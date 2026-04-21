const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getBookingById, updateBooking, appendAuditLog } = require('../db');
const { confirmCalendarEvent, deleteCalendarEvent } = require('../services/calendar');
const { createPaymentLink } = require('../services/stripe');
const { sendPaymentLinkEmail, sendFollowupMeetingEmail } = require('../services/email');
const { updateBookingMessage, postThreadReply } = require('../services/slack');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

function verifySlackSignature(req) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return true;

  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];
  if (!timestamp || !signature) return false;

  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) return false;

  const rawBody = req.rawBody || '';
  const baseString = `v0:${timestamp}:${rawBody}`;
  const expected = 'v0=' + crypto.createHmac('sha256', signingSecret).update(baseString).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// POST /api/slack/actions
router.post('/actions', async (req, res) => {
  res.status(200).send('');

  try {
    const payload = JSON.parse(req.body.payload);
    const action = payload.actions?.[0];
    if (!action) return;

    const bookingId = action.value;
    const booking = getBookingById(bookingId);
    if (!booking) {
      console.error(`[Slack Action] Booking not found: ${bookingId}`);
      return;
    }

    const actor = payload.user?.name || payload.user?.id || 'slack_user';

    if (action.action_id === 'approve_booking') {
      updateBooking(bookingId, { status: 'approved' });
      appendAuditLog(bookingId, 'APPROVED', actor);

      if (booking.calendar_event_id) {
        try { await confirmCalendarEvent(booking.calendar_event_id, booking.name, booking.slot); } catch(e) { console.error('[Cal confirm]', e.message); }
      }

      const paymentLink = await createPaymentLink(booking);
      updateBooking(bookingId, { status: 'awaiting_payment', stripe_payment_link: paymentLink });
      appendAuditLog(bookingId, 'PAYMENT_LINK_CREATED', 'system', paymentLink);

      await sendPaymentLinkEmail(booking, paymentLink);
      appendAuditLog(bookingId, 'PAYMENT_EMAIL_SENT', 'system');

      await updateBookingMessage(booking.slack_channel_id, booking.slack_message_ts, booking, 'approved');
      await postThreadReply(booking.slack_channel_id, booking.slack_message_ts, `\u2705 Approved by ${actor}. Payment link sent to ${booking.email}`);

    } else if (action.action_id === 'reject_booking') {
      updateBooking(bookingId, { status: 'rejected' });
      appendAuditLog(bookingId, 'REJECTED', actor);

      if (booking.calendar_event_id) {
        try { await deleteCalendarEvent(booking.calendar_event_id); } catch(e) { console.error('[Cal delete]', e.message); }
      }

      await updateBookingMessage(booking.slack_channel_id, booking.slack_message_ts, booking, 'rejected');
      await postThreadReply(booking.slack_channel_id, booking.slack_message_ts, `\u274C Rejected by ${actor}.`);

    } else if (action.action_id === 'followup_booking') {
      await sendFollowupMeetingEmail(booking);
      appendAuditLog(bookingId, 'FOLLOWUP_REQUESTED', actor);

      await postThreadReply(booking.slack_channel_id, booking.slack_message_ts, `\uD83D\uDCC5 Follow-up meeting email sent to ${booking.email} by ${actor}.`);
    }
  } catch (err) {
    console.error('[Slack Actions]', err);
  }
});

module.exports = router;
