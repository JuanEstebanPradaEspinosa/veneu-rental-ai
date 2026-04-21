const express = require('express');
const router = express.Router();
const { constructWebhookEvent, getInvoicePdfUrl } = require('../services/stripe');
const { getBookingById, updateBooking, appendAuditLog } = require('../db');
const { confirmCalendarEvent } = require('../services/calendar');
const { sendInvoiceEmail } = require('../services/email');
const { updateBookingMessage, postThreadReply } = require('../services/slack');
const { syncInvoiceToOdoo } = require('../services/odoo');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

// IMPORTANT: raw body needed for Stripe webhook signature
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = constructWebhookEvent(req.body, sig);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  res.status(200).json({ received: true });

  try {
    const handled = ['checkout.session.completed', 'payment_intent.succeeded'];
    if (!handled.includes(event.type)) return;

    const obj = event.data.object;
    const metadata = obj.metadata || {};
    const bookingId = metadata.booking_id;

    if (!bookingId) return;

    const booking = getBookingById(bookingId);
    if (!booking) return;
    if (booking.status === 'paid') return;

    const piId = obj.id.startsWith('pi_') ? obj.id : (obj.payment_intent || obj.id);
    updateBooking(bookingId, { status: 'paid', stripe_payment_intent_id: piId });
    appendAuditLog(bookingId, 'PAYMENT_RECEIVED', 'stripe', piId);

    let invoiceData = { pdfUrl: null, hostedUrl: null, total: obj.amount_received || obj.amount || 0 };
    const invoiceId = obj.invoice || (obj.payment_intent ? null : null);
    if (invoiceId) {
      try {
        invoiceData = await getInvoicePdfUrl(invoiceId);
        updateBooking(bookingId, { stripe_invoice_id: invoiceId });
      } catch (e) { console.error('[Stripe] Invoice fetch failed:', e.message); }
    }

    const updatedBooking = getBookingById(bookingId);

    if (booking.calendar_event_id) {
      try { await confirmCalendarEvent(booking.calendar_event_id, booking.name, booking.slot); }
      catch (e) { console.error('[Calendar] Confirm failed:', e.message); }
    }

    try {
      await sendInvoiceEmail(updatedBooking, invoiceData);
      appendAuditLog(bookingId, 'INVOICE_EMAIL_SENT', 'system');
    } catch (e) { console.error('[Email] Invoice email failed:', e.message); }

    try {
      if (booking.slack_message_ts) {
        await updateBookingMessage(booking.slack_channel_id, booking.slack_message_ts, updatedBooking, 'paid');
        await postThreadReply(booking.slack_channel_id, booking.slack_message_ts, `\uD83D\uDCB3 Payment confirmed! Booking confirmation + calendar links emailed to ${booking.email}.`);
      }
    } catch (e) { console.error('[Slack] Update failed:', e.message); }

    try {
      const odooResult = await syncInvoiceToOdoo(updatedBooking, invoiceData);
      if (odooResult) appendAuditLog(bookingId, 'ODOO_SYNC_COMPLETE', 'system', `Odoo invoice: ${odooResult.invoiceId}`);
    } catch (e) { console.error('[Odoo] Sync failed:', e.message); }

  } catch (err) {
    console.error('[Stripe Webhook] Handler error:', err);
  }
});

module.exports = router;
