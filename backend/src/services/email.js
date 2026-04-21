/**
 * Email service — uses google_api.py CLI (same auth as calendar/gmail skill)
 *
 * IMPORTANT: Do NOT use nodemailer OAuth2 — it hangs because google_token.json
 * uses the 'token' key instead of 'access_token'. Use execSync to google_api.py.
 *
 * Exported functions:
 *   sendPaymentLinkEmail      — STEP 1: Allusion approved → payment link to client
 *   sendBookingConfirmedEmail — STEP 2: Stripe paid → confirmation + calendar download links
 *   sendRejectionEmail        — Allusion rejected → decline notification to client
 *   sendFollowupMeetingEmail  — Follow-up meeting request to client + team
 *   sendInvoiceEmail          — alias for sendBookingConfirmedEmail (webhook compatibility)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { googleCalendarUrl } = require('./ics');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// ── Config ─────────────────────────────────────────────────────────────────────

const GAPI = '/home/trader/.hermes/hermes-agent/venv/bin/python3 ' +
             '/home/trader/.hermes/skills/productivity/google-workspace/scripts/google_api.py';

const SLOT_LABELS = {
  morning:   'Morning &nbsp;&nbsp; 09:00 – 13:00',
  afternoon: 'Afternoon &nbsp; 13:00 – 17:00',
  evening:   'Evening &nbsp;&nbsp;&nbsp; 18:00 – 22:00',
};

const SLOT_LABELS_PLAIN = {
  morning:   'Morning (09:00–13:00)',
  afternoon: 'Afternoon (13:00–17:00)',
  evening:   'Evening (18:00–22:00)',
};

const PRICE_LABELS = { morning: '€250', afternoon: '€250', evening: '€350' };

function formatDate(dateStr) {
  try {
    return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return dateStr; }
}

const cfg = {
  venue:    () => process.env.VENUE_NAME     || 'Allusion Venue, Ghent',
  name:     () => process.env.ALLUSION_NAME  || 'Allusion',
  email:    () => process.env.ALLUSION_EMAIL || 'info@allusion.be',
  gmailUser:() => process.env.GMAIL_USER     || 'oc.al.assistant@gmail.com',
  baseUrl:  () => process.env.FRONTEND_URL   || 'http://localhost:5173',
};

// ── Core send ─────────────────────────────────────────────────────────────────

function sendMail({ to, cc, subject, html }) {
  const htmlFile   = path.join(os.tmpdir(), `allusion-body-${Date.now()}.html`);
  const scriptFile = path.join(os.tmpdir(), `allusion-send-${Date.now()}.sh`);
  try {
    fs.writeFileSync(htmlFile, html, 'utf8');
    const ccLine = cc ? `  --cc "${cc}" \\` : null;
    const script = [
      '#!/bin/bash',
      `${GAPI} gmail send \\`,
      `  --to "${to}" \\`,
      ccLine,
      `  --subject "${subject.replace(/"/g, '\\"')}" \\`,
      `  --body "$(cat ${htmlFile})" \\`,
      '  --html 2>&1',
    ].filter(Boolean).join('\n');
    fs.writeFileSync(scriptFile, script, { mode: 0o755 });
    const result = execSync(`bash ${scriptFile}`, { timeout: 30000, encoding: 'utf8' });
    console.log(`[Email] → ${to}${cc ? ' cc:' + cc : ''} | ${subject} | ${result.trim().slice(0, 80)}`);
  } finally {
    try { fs.unlinkSync(htmlFile); }   catch {}
    try { fs.unlinkSync(scriptFile); } catch {}
  }
}

// ── Shared HTML wrapper ───────────────────────────────────────────────────────

function wrap(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0"
      style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.10);">

      <!-- Header -->
      <tr>
        <td style="background:#1a1a2e;padding:32px 40px;">
          <p style="margin:0;color:#9999cc;font-size:12px;letter-spacing:3px;text-transform:uppercase;">Venue Booking</p>
          <h1 style="margin:8px 0 0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">
            ${cfg.venue()}
          </h1>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:40px;">
          ${body}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f8f8f8;padding:24px 40px;border-top:1px solid #ebebeb;">
          <p style="margin:0;color:#aaaaaa;font-size:12px;line-height:1.6;">
            ${cfg.name()} &nbsp;·&nbsp; ${cfg.venue()}<br/>
            Questions? <a href="mailto:${cfg.email()}" style="color:#1a1a2e;text-decoration:none;">${cfg.email()}</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Shared components ─────────────────────────────────────────────────────────

function bookingCard(booking, accentColor = '#1a1a2e') {
  const date  = formatDate(booking.date);
  const slot  = SLOT_LABELS[booking.slot]      || booking.slot;
  const price = PRICE_LABELS[booking.slot]     || '';

  return `
<table width="100%" cellpadding="0" cellspacing="0"
  style="background:#f8f9ff;border:1px solid #dde0f0;border-radius:8px;margin:24px 0;overflow:hidden;">
  <tr>
    <td style="background:${accentColor};padding:14px 20px;">
      <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">
        Booking Details
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:20px 20px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="width:36px;padding:6px 10px 6px 0;vertical-align:top;">
            <span style="font-size:18px;">📅</span>
          </td>
          <td style="padding:6px 0;vertical-align:top;">
            <p style="margin:0;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Date</p>
            <p style="margin:2px 0 0;color:#1a1a2e;font-size:15px;font-weight:700;">${date}</p>
          </td>
        </tr>
        <tr>
          <td style="width:36px;padding:6px 10px 6px 0;vertical-align:top;">
            <span style="font-size:18px;">🕐</span>
          </td>
          <td style="padding:6px 0;vertical-align:top;">
            <p style="margin:0;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Time Slot</p>
            <p style="margin:2px 0 0;color:#1a1a2e;font-size:15px;font-weight:700;">${slot}</p>
          </td>
        </tr>
        <tr>
          <td style="width:36px;padding:6px 10px 6px 0;vertical-align:top;">
            <span style="font-size:18px;">👥</span>
          </td>
          <td style="padding:6px 0;vertical-align:top;">
            <p style="margin:0;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Guests</p>
            <p style="margin:2px 0 0;color:#1a1a2e;font-size:15px;font-weight:700;">${booking.guests}</p>
          </td>
        </tr>
        <tr>
          <td style="width:36px;padding:6px 10px 6px 0;vertical-align:top;">
            <span style="font-size:18px;">💶</span>
          </td>
          <td style="padding:6px 0;vertical-align:top;">
            <p style="margin:0;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Amount</p>
            <p style="margin:2px 0 0;color:#1a1a2e;font-size:20px;font-weight:800;">${price}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function ctaButton(label, url, color = '#1a1a2e') {
  return `
<div style="text-align:center;margin:32px 0;">
  <a href="${url}"
    style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;
           padding:16px 44px;border-radius:8px;font-size:16px;font-weight:700;
           letter-spacing:0.3px;box-shadow:0 4px 12px rgba(0,0,0,0.25);">
    ${label}
  </a>
</div>`;
}

// ── Calendar add links block ──────────────────────────────────────────────────

function calendarLinksBlock(booking, baseUrl) {
  const icsUrl = `${baseUrl}/api/bookings/${booking.id}/calendar.ics`;
  const googleUrl = googleCalendarUrl(booking);

  return `
<table width="100%" cellpadding="0" cellspacing="0"
  style="background:#f0f7f0;border:1px solid #c3e6cb;border-radius:8px;margin:28px 0;overflow:hidden;">
  <tr>
    <td style="background:#2e7d32;padding:14px 20px;">
      <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">
        📅 &nbsp;Add to Your Calendar
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:20px;">
      <p style="margin:0 0 16px;color:#444;font-size:14px;line-height:1.5;">
        Save this event to your calendar so you never miss it:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:0 8px 0 0;width:50%;">
            <a href="${googleUrl}" target="_blank"
              style="display:block;text-align:center;background:#ffffff;color:#1a1a2e;
                     text-decoration:none;padding:12px 16px;border-radius:6px;
                     font-size:14px;font-weight:600;
                     border:1.5px solid #c3e6cb;">
              <span style="font-size:18px;">📆</span><br/>
              <span style="font-size:13px;">Google Calendar</span>
            </a>
          </td>
          <td style="padding:0 0 0 8px;width:50%;">
            <a href="${icsUrl}"
              style="display:block;text-align:center;background:#ffffff;color:#1a1a2e;
                     text-decoration:none;padding:12px 16px;border-radius:6px;
                     font-size:14px;font-weight:600;
                     border:1.5px solid #c3e6cb;">
              <span style="font-size:18px;">🗓️</span><br/>
              <span style="font-size:13px;">Apple / Outlook</span>
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:14px 0 0;color:#888;font-size:12px;">
        The Apple &amp; Outlook button downloads an .ics file — open it to add the event directly to your calendar.
      </p>
    </td>
  </tr>
</table>`;
}

// ── sendPaymentLinkEmail — STEP 1 ─────────────────────────────────────────────
// Triggered: Allusion approves the booking in Slack.
// Sends a beautiful approval email with a Stripe payment CTA.

async function sendPaymentLinkEmail(booking, paymentLink, note) {
  const noteHtml = note
    ? `<div style="background:#fffbf0;border-left:4px solid #f5a623;padding:14px 18px;
                  margin:20px 0;border-radius:4px;">
         <p style="margin:0;color:#555;font-size:14px;font-style:italic;">${note}</p>
       </div>`
    : '';

  const html = wrap(`
    <!-- Badge -->
    <div style="display:inline-block;background:#e8f5e9;border-radius:20px;
                padding:6px 16px;margin-bottom:20px;">
      <span style="color:#2e7d32;font-size:13px;font-weight:600;">✅ &nbsp;Booking Approved</span>
    </div>

    <h2 style="color:#1a1a2e;font-size:22px;font-weight:700;margin:0 0 12px;">
      Great news, ${booking.name}!
    </h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 6px;">
      Your venue booking request has been approved.
      To secure your reservation, please complete your payment using the button below.
    </p>

    ${bookingCard(booking)}
    ${noteHtml}
    ${ctaButton('Complete Your Payment &nbsp;→', paymentLink, '#1a1a2e')}

    <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:14px 18px;margin:0 0 24px;text-align:center;">
      <p style="margin:0;color:#795548;font-size:13px;line-height:1.6;">
        ⏳ &nbsp;<strong>Payment is required within 3 days</strong> to secure this reservation.<br/>
        If payment is not completed by then, the slot will be released to other clients.
      </p>
    </div>

    <p style="color:#555;font-size:14px;line-height:1.6;margin:0;">
      We look forward to welcoming you at ${cfg.venue()}!
    </p>
  `);

  sendMail({
    to: booking.email,
    cc: cfg.email(),
    subject: `Your Booking is Approved – Complete Payment | ${cfg.venue()}`,
    html,
  });
}

// ── sendBookingConfirmedEmail — STEP 2 ────────────────────────────────────────
// Triggered: Stripe webhook fires after successful payment.
// Sends a full confirmation with invoice link + Google / Apple / Outlook calendar buttons.

async function sendBookingConfirmedEmail(booking, invoiceData) {
  const invoiceLink = invoiceData?.pdfUrl || invoiceData?.hostedUrl
    || invoiceData?.invoice_pdf || invoiceData?.hosted_invoice_url || null;

  const invoiceHtml = invoiceLink
    ? `<p style="color:#555;font-size:14px;line-height:1.6;margin:16px 0 8px;">
         Your invoice has been generated by Stripe and is ready to download. A copy is also sent to you by Stripe directly.
       </p>
       <div style="text-align:center;margin:0 0 8px;">
         <a href="${invoiceLink}"
           style="display:inline-block;background:#f5f5f5;color:#1a1a2e;text-decoration:none;
                  padding:10px 28px;border-radius:6px;font-size:13px;font-weight:600;
                  border:1.5px solid #ddd;">
           📄 &nbsp;Download Invoice
         </a>
       </div>`
    : '';

  const baseUrl = cfg.baseUrl().replace(/\/+$/, '');

  const html = wrap(`
    <!-- Badge -->
    <div style="display:inline-block;background:#e8f5e9;border-radius:20px;
                padding:6px 16px;margin-bottom:20px;">
      <span style="color:#2e7d32;font-size:13px;font-weight:600;">💳 &nbsp;Payment Confirmed</span>
    </div>

    <h2 style="color:#1a1a2e;font-size:22px;font-weight:700;margin:0 0 12px;">
      You're all set, ${booking.name}! 🎉
    </h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 6px;">
      Your payment has been received and your venue booking is
      <strong>fully confirmed</strong>. We can't wait to host you!
    </p>

    ${bookingCard(booking, '#2e7d32')}
    ${invoiceHtml}
    ${calendarLinksBlock(booking, baseUrl)}

    <p style="color:#555;font-size:14px;line-height:1.7;margin:24px 0 0;">
      If you have any questions before your event, feel free to reach out — we're here to help.<br/><br/>
      See you soon!<br/>
      <strong style="color:#1a1a2e;">${cfg.name()}</strong>
    </p>
  `);

  sendMail({
    to: booking.email,
    cc: cfg.email(),
    subject: `Booking Confirmed – See You on ${formatDate(booking.date)} | ${cfg.venue()}`,
    html,
  });
}

// Alias so stripe-webhook.js keeps working without changes
const sendInvoiceEmail = sendBookingConfirmedEmail;

// ── sendRejectionEmail ────────────────────────────────────────────────────────

async function sendRejectionEmail(booking, reason) {
  const reasonHtml = reason
    ? `<p style="color:#555;font-size:14px;line-height:1.6;">
         Unfortunately, we are unable to confirm this booking at this time:
       </p>
       <blockquote style="border-left:4px solid #d0d0d0;margin:16px 0;padding:12px 18px;
                          background:#fafafa;border-radius:0 6px 6px 0;color:#666;
                          font-style:italic;font-size:14px;line-height:1.6;">
         ${reason}
       </blockquote>`
    : `<p style="color:#555;font-size:14px;line-height:1.6;">
         Unfortunately, we are unable to accommodate this booking request at this time.
       </p>`;

  const html = wrap(`
    <h2 style="color:#1a1a2e;font-size:22px;font-weight:700;margin:0 0 16px;">
      Booking Update
    </h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 8px;">
      Dear ${booking.name},
    </p>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 6px;">
      Thank you for your interest in booking
      <strong>${cfg.venue()}</strong> on
      <strong>${formatDate(booking.date)}</strong>
      (${SLOT_LABELS_PLAIN[booking.slot] || booking.slot}).
    </p>

    ${reasonHtml}

    <p style="color:#555;font-size:14px;line-height:1.6;margin:16px 0 0;">
      We hope to welcome you on a future occasion. Please don't hesitate to reach out
      if you'd like to explore alternative dates — we'd love to find a time that works.
    </p>

    <p style="color:#555;font-size:14px;line-height:1.6;margin:24px 0 0;">
      Best regards,<br/>
      <strong style="color:#1a1a2e;">${cfg.name()}</strong>
    </p>
  `);

  sendMail({
    to: booking.email,
    cc: cfg.email(),
    subject: `Regarding Your Booking Request | ${cfg.venue()}`,
    html,
  });
}

// ── sendFollowupMeetingEmail ──────────────────────────────────────────────────

async function sendFollowupMeetingEmail(booking) {
  const teamEmails = (process.env.ALLUSION_TEAM_EMAILS || process.env.ALLUSION_EMAIL || 'info@allusion.be')
    .split(',').map(e => e.trim()).filter(Boolean);

  const customerHtml = wrap(`
    <h2 style="color:#1a1a2e;font-size:22px;font-weight:700;margin:0 0 16px;">
      Let's Have a Quick Chat 📅
    </h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 8px;">
      Dear ${booking.name},
    </p>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 6px;">
      Thank you for your booking request for
      <strong>${formatDate(booking.date)}</strong>
      (${SLOT_LABELS_PLAIN[booking.slot] || booking.slot}).
    </p>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:12px 0 0;">
      We'd love to have a quick conversation to discuss your event in more detail
      and make sure everything is perfectly arranged for you.
    </p>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:12px 0 0;">
      Please reply to this email with your availability and we'll find a time
      that works for both of us.
    </p>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:28px 0 0;">
      Looking forward to speaking with you!<br/>
      <strong style="color:#1a1a2e;">${cfg.name()}</strong>
    </p>
  `);

  sendMail({
    to: booking.email,
    cc: cfg.email(),
    subject: `Follow-Up: Your Venue Booking on ${formatDate(booking.date)} | ${cfg.venue()}`,
    html: customerHtml,
  });

  // Internal team alert
  const teamHtml = wrap(`
    <h2 style="color:#1a1a2e;font-size:20px;font-weight:700;margin:0 0 16px;">
      &#x1F514; Follow-Up Requested
    </h2>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px;">
      A follow-up meeting has been requested for the booking below.
      A follow-up email has already been sent to the customer.
    </p>
    ${bookingCard(booking)}
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#f8f8f8;border-radius:6px;margin:16px 0;padding:16px;">
      <tr>
        <td style="padding:0;color:#444;font-size:14px;">
          <strong>Customer email:</strong> ${booking.email}<br/>
          ${booking.phone ? `<strong>Phone:</strong> ${booking.phone}<br/>` : ''}
          ${booking.message ? `<strong>Their message:</strong> <em>${booking.message}</em>` : ''}
        </td>
      </tr>
    </table>
  `);

  for (const teamEmail of teamEmails) {
    sendMail({
      to: teamEmail,
      subject: `[Action Required] Follow-Up: ${booking.name} – ${formatDate(booking.date)}`,
      html: teamHtml,
    });
  }

  console.log(`[Email] Follow-up sent to ${booking.email} + team (${teamEmails.join(', ')})`);
}

// ── sendPaymentReminderEmail — Day-3 reminder ─────────────────────────────────
// Triggered by the calendar sync when an awaiting_payment booking is on its
// final day (between 2 and 3 days since approval). Sent once per booking.

async function sendPaymentReminderEmail(booking, paymentLink) {
  const html = wrap(`
    <!-- Badge -->
    <div style="display:inline-block;background:#fff3e0;border-radius:20px;
                padding:6px 16px;margin-bottom:20px;">
      <span style="color:#e65100;font-size:13px;font-weight:600;">⏰ &nbsp;Reservation Expiring Today</span>
    </div>

    <h2 style="color:#1a1a2e;font-size:22px;font-weight:700;margin:0 0 12px;">
      A reminder for your upcoming booking, ${booking.name}
    </h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 6px;">
      This is a friendly reminder that your payment window for the reservation below
      closes <strong>today</strong>. To keep your slot, please complete payment at your
      earliest convenience.
    </p>

    ${bookingCard(booking, '#e65100')}

    <div style="background:#fff3e0;border:1px solid #ffcc80;border-radius:8px;
                padding:16px 18px;margin:0 0 24px;">
      <p style="margin:0;color:#bf360c;font-size:14px;line-height:1.6;">
        <strong>Your reservation expires at the end of today.</strong><br/>
        If payment is not received by end of day, the slot will be released and
        made available to other clients. We would love to keep it reserved for you —
        the button below takes you straight to payment.
      </p>
    </div>

    ${ctaButton('Complete Your Payment Now &nbsp;→', paymentLink, '#e65100')}

    <p style="color:#555;font-size:14px;line-height:1.6;margin:0;">
      If you have any questions or need assistance, simply reply to this email
      and we'll be happy to help.<br/><br/>
      Best regards,<br/>
      <strong style="color:#1a1a2e;">${cfg.name()}</strong>
    </p>
  `);

  sendMail({
    to: booking.email,
    cc: cfg.email(),
    subject: `Action Required: Your Reservation Expires Today | ${cfg.venue()}`,
    html,
  });
}

module.exports = {
  sendPaymentLinkEmail,
  sendBookingConfirmedEmail,
  sendInvoiceEmail,
  sendRejectionEmail,
  sendFollowupMeetingEmail,
  sendPaymentReminderEmail,
};
