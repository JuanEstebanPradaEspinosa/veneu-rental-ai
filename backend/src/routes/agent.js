/**
 * /api/agent/* — Internal endpoints called by Hermes (the AI agent)
 * when processing Allusion's conversational replies in Slack.
 *
 * These endpoints are the "hands" of the agent — they execute real
 * side-effects: approve, reject, email customer, check availability, etc.
 *
 * Security: Protected by a simple bearer token (AGENT_API_SECRET).
 * On localhost this is sufficient. In production, add IP allowlisting too.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const express = require('express');
const router = express.Router();

const { getBookingById, updateBooking, appendAuditLog, getDb } = require('../db');
const { confirmCalendarEvent, deleteCalendarEvent, getAvailableSlots } = require('../services/calendar');
const { createPaymentLink, getInvoiceFromPaymentLink } = require('../services/stripe');
const { sendPaymentLinkEmail, sendFollowupMeetingEmail, sendInvoiceEmail, sendRejectionEmail, sendPaymentReminderEmail } = require('../services/email');
const { postThreadReply } = require('../services/slack');
const { syncInvoiceToOdoo } = require('../services/odoo');

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAgentAuth(req, res, next) {
  const secret = process.env.AGENT_API_SECRET;
  // If no secret configured, allow on localhost only
  if (!secret) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (!isLocal) return res.status(401).json({ error: 'Unauthorized' });
    return next();
  }
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.use(requireAgentAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

const SLOT_LABELS = {
  morning:   'Morning (09:00–13:00)',
  afternoon: 'Afternoon (13:00–17:00)',
  evening:   'Evening (18:00–22:00)',
};

const PRICE_LABELS = { morning: '€250', afternoon: '€250', evening: '€350' };

function formatDate(dateStr) {
  try {
    return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  } catch { return dateStr; }
}

// ── POST /api/agent/approve ───────────────────────────────────────────────────
// Approve a booking: create Stripe link → email customer → confirm calendar
router.post('/approve', async (req, res) => {
  const { booking_id, note } = req.body;

  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

  const booking = getBookingById(booking_id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  if (booking.status === 'approved' || booking.status === 'awaiting_payment' || booking.status === 'paid') {
    return res.json({
      ok: true,
      already: true,
      message: `Booking ${booking_id.slice(0,8)} is already in status: ${booking.status}`,
      booking: safeBooking(booking),
    });
  }

  try {
    // 1. Mark approved → awaiting_payment immediately (skip interim 'approved' status)
    updateBooking(booking_id, { status: 'approved' });
    appendAuditLog(booking_id, 'APPROVED', 'agent');

    // NOTE: Calendar event intentionally stays TENTATIVE at this point.
    // It will only be promoted to CONFIRMED by the calendar sync once
    // Stripe confirms payment. Allusion approval alone is not sufficient.

    // 2. Create Stripe payment link
    const paymentLink = await createPaymentLink(booking);
    updateBooking(booking_id, { status: 'awaiting_payment', stripe_payment_link: paymentLink });
    appendAuditLog(booking_id, 'PAYMENT_LINK_CREATED', 'agent', paymentLink);

    // 3. Send payment email (with optional custom note from Allusion)
    await sendPaymentLinkEmail(booking, paymentLink, note || null);
    appendAuditLog(booking_id, 'PAYMENT_EMAIL_SENT', 'agent');

    res.json({
      ok: true,
      message: `Approved. Payment link sent to ${booking.email}.`,
      payment_link: paymentLink,
      booking: safeBooking(getBookingById(booking_id)),
    });
  } catch (err) {
    console.error('[Agent/approve]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agent/reject ────────────────────────────────────────────────────
// Reject a booking: delete calendar event, optionally email customer
router.post('/reject', async (req, res) => {
  const { booking_id, reason, notify_customer } = req.body;

  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

  const booking = getBookingById(booking_id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  if (booking.status === 'rejected') {
    return res.json({ ok: true, already: true, message: 'Booking already rejected.' });
  }

  try {
    updateBooking(booking_id, { status: 'rejected' });
    appendAuditLog(booking_id, 'REJECTED', 'agent', reason || null);

    // Delete tentative calendar event
    if (booking.calendar_event_id) {
      try {
        await deleteCalendarEvent(booking.calendar_event_id);
      } catch (e) {
        console.error('[Agent/reject] Calendar delete failed:', e.message);
      }
    }

    // Send rejection email if requested or reason given
    // Coerce both boolean true and string "true" (agent may send either)
    const notifyBool = notify_customer === true || notify_customer === 'true' || notify_customer === 1;
    const shouldNotify = notifyBool || (notify_customer !== false && notify_customer !== 'false' && reason);
    let emailSent = false;
    if (shouldNotify) {
      try {
        await sendRejectionEmail(booking, reason || null);
        appendAuditLog(booking_id, 'REJECTION_EMAIL_SENT', 'agent', reason || null);
        emailSent = true;
      } catch (e) {
        console.error('[Agent/reject] Rejection email failed:', e.message);
      }
    }

    res.json({
      ok: true,
      message: `Rejected.${emailSent ? ` Notification sent to ${booking.email}.` : ' Customer not notified.'}`,
      email_sent: emailSent,
      booking: safeBooking(getBookingById(booking_id)),
    });
  } catch (err) {
    console.error('[Agent/reject]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agent/mark-paid ─────────────────────────────────────────────────
// Called by the status watcher when Stripe confirms payment.
// Updates DB status → paid, sends confirmation + invoice email to customer.
router.post('/mark-paid', async (req, res) => {
  const { booking_id, payment_intent_id } = req.body;

  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });
  const booking = getBookingById(booking_id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  if (booking.status === 'paid') {
    return res.json({ ok: true, already: true, message: 'Booking already marked as paid.' });
  }

  try {
    updateBooking(booking_id, {
      status: 'paid',
      stripe_payment_intent_id: payment_intent_id || null,
    });
    appendAuditLog(booking_id, 'PAYMENT_RECEIVED', 'stripe-poller', payment_intent_id || null);

    const updatedBooking = getBookingById(booking_id);

    // Fetch Stripe invoice so the confirmation email includes the invoice link
    let invoiceData = null;
    if (updatedBooking.stripe_payment_link) {
      try {
        invoiceData = await getInvoiceFromPaymentLink(updatedBooking.stripe_payment_link);
        if (invoiceData) {
          updateBooking(booking_id, { stripe_invoice_id: invoiceData.invoiceId });
          appendAuditLog(booking_id, 'INVOICE_FETCHED', 'stripe-poller', invoiceData.invoiceId);
        }
      } catch (e) {
        console.error('[mark-paid] Invoice fetch failed:', e.message);
      }
    }

    await sendInvoiceEmail(updatedBooking, invoiceData);
    appendAuditLog(booking_id, 'INVOICE_EMAIL_SENT', 'stripe-poller');

    res.json({
      ok: true,
      message: `Marked as paid. Confirmation email sent to ${booking.email}.`,
      booking: safeBooking(updatedBooking),
    });
  } catch (err) {
    console.error('[Agent/mark-paid]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agent/payment-reminder ─────────────────────────────────────────
// Called by the calendar sync on day 3 of the payment window.
// Sends a final reminder email to the customer with the same payment link.
router.post('/payment-reminder', async (req, res) => {
  const { booking_id } = req.body;
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

  const booking = getBookingById(booking_id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  if (booking.status !== 'awaiting_payment') {
    return res.json({ ok: true, skipped: true, message: `Booking is ${booking.status}, no reminder needed.` });
  }

  if (!booking.stripe_payment_link) {
    return res.status(400).json({ error: 'No payment link on this booking.' });
  }

  try {
    await sendPaymentReminderEmail(booking, booking.stripe_payment_link);
    appendAuditLog(booking_id, 'PAYMENT_REMINDER_SENT', 'calendar-sync');
    res.json({
      ok: true,
      message: `Payment reminder sent to ${booking.email}.`,
      booking: safeBooking(booking),
    });
  } catch (err) {
    console.error('[Agent/payment-reminder]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agent/followup ──────────────────────────────────────────────────
// Send follow-up meeting emails to customer + team
router.post('/followup', async (req, res) => {
  const { booking_id } = req.body;

  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });
  const booking = getBookingById(booking_id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  try {
    await sendFollowupMeetingEmail(booking);
    appendAuditLog(booking_id, 'FOLLOWUP_REQUESTED', 'agent');

    res.json({
      ok: true,
      message: `Follow-up meeting email sent to ${booking.email} and the team.`,
      booking: safeBooking(booking),
    });
  } catch (err) {
    console.error('[Agent/followup]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agent/email ─────────────────────────────────────────────────────
// Send a freeform email to the customer from Allusion (drafted by agent)
router.post('/email', async (req, res) => {
  const { booking_id, subject, body, html } = req.body;

  if (!booking_id || !subject || !body) {
    return res.status(400).json({ error: 'booking_id, subject, body required' });
  }

  const booking = getBookingById(booking_id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  try {
    const nodemailer = require('nodemailer');
    const fs = require('fs');

    const tokenPath = process.env.GOOGLE_TOKEN_PATH || '/home/trader/.hermes/google_token.json';
    const token = JSON.parse(fs.readFileSync(tokenPath));
    const credPath = process.env.GOOGLE_CREDENTIALS_PATH;
    let clientId, clientSecret;
    if (credPath && fs.existsSync(credPath)) {
      const creds = JSON.parse(fs.readFileSync(credPath));
      const info = creds.installed || creds.web;
      clientId = info.client_id;
      clientSecret = info.client_secret;
    } else {
      clientId = token.client_id || process.env.GOOGLE_CLIENT_ID;
      clientSecret = token.client_secret || process.env.GOOGLE_CLIENT_SECRET;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: process.env.GMAIL_USER,
        clientId, clientSecret,
        refreshToken: token.refresh_token,
        accessToken: token.token || token.access_token,
      },
    });

    await transporter.sendMail({
      from: `"${process.env.ALLUSION_NAME || 'Allusion'}" <${process.env.GMAIL_USER}>`,
      to: booking.email,
      subject,
      [html ? 'html' : 'text']: body,
    });

    appendAuditLog(booking_id, 'CUSTOM_EMAIL_SENT', 'agent', subject);

    res.json({
      ok: true,
      message: `Email sent to ${booking.email}: "${subject}"`,
    });
  } catch (err) {
    console.error('[Agent/email]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agent/bookings ───────────────────────────────────────────────────
// List bookings with optional filters — used by agent to answer "show pending"
router.get('/bookings', (req, res) => {
  const { status, date_from, date_to, limit = 20 } = req.query;

  try {
    let query = 'SELECT * FROM bookings WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    if (date_from) { query += ' AND date >= ?'; params.push(date_from); }
    if (date_to)   { query += ' AND date <= ?'; params.push(date_to); }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const db = getDb();
    const bookings = db.prepare(query).all(...params);

    // Format for agent readability
    const formatted = bookings.map(b => ({
      id: b.id,
      short_id: b.id.slice(0, 8),
      name: b.name,
      email: b.email,
      phone: b.phone,
      organization: b.organization,
      date: b.date,
      date_formatted: formatDate(b.date),
      slot: b.slot,
      slot_label: SLOT_LABELS[b.slot],
      price: PRICE_LABELS[b.slot],
      guests: b.guests,
      message: b.message,
      status: b.status,
      stripe_payment_link: b.stripe_payment_link,
      created_at: b.created_at,
    }));

    res.json({
      count: formatted.length,
      bookings: formatted,
      summary: summarizeBookings(formatted),
    });
  } catch (err) {
    console.error('[Agent/bookings]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agent/booking/:id ────────────────────────────────────────────────
// Get full booking details for agent context
router.get('/booking/:id', (req, res) => {
  // Support both full UUID and short 8-char prefix
  const idOrShort = req.params.id;
  let booking = getBookingById(idOrShort);

  if (!booking && idOrShort.length < 36) {
    // Try prefix match
    const db = getDb();
    booking = db.prepare('SELECT * FROM bookings WHERE id LIKE ?').get(idOrShort + '%');
  }

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  res.json({
    ...booking,
    date_formatted: formatDate(booking.date),
    slot_label: SLOT_LABELS[booking.slot],
    price: PRICE_LABELS[booking.slot],
    short_id: booking.id.slice(0, 8),
  });
});

// ── GET /api/agent/availability ───────────────────────────────────────────────
// Check slot availability for a date (agent-accessible)
router.get('/availability', async (req, res) => {
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
  }

  try {
    const available = await getAvailableSlots(date);
    const all = ['morning', 'afternoon', 'evening'];
    const unavailable = all.filter(s => !available.includes(s));

    res.json({
      date,
      date_formatted: formatDate(date),
      available,
      unavailable,
      summary: available.length === 0
        ? `${formatDate(date)} is fully booked.`
        : `${formatDate(date)}: ${available.map(s => `${SLOT_LABELS[s]}`).join(', ')} available.`,
    });
  } catch (err) {
    console.error('[Agent/availability]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// sendRejectionEmail is imported from ../services/email

function safeBooking(b) {
  if (!b) return null;
  return {
    id: b.id,
    short_id: b.id.slice(0, 8),
    name: b.name,
    email: b.email,
    date: b.date,
    date_formatted: formatDate(b.date),
    slot: b.slot,
    slot_label: SLOT_LABELS[b.slot],
    price: PRICE_LABELS[b.slot],
    guests: b.guests,
    status: b.status,
    stripe_payment_link: b.stripe_payment_link,
  };
}

function summarizeBookings(bookings) {
  const byStatus = {};
  for (const b of bookings) {
    byStatus[b.status] = (byStatus[b.status] || 0) + 1;
  }
  return Object.entries(byStatus).map(([s, n]) => `${n} ${s}`).join(', ') || 'none';
}

module.exports = router;
