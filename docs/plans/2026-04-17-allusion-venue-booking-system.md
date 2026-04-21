# Allusion Venue Booking System — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a fully automated venue booking system for Allusion in Ghent — React frontend, Google Calendar availability, Slack approval workflow, Stripe payment links, and Odoo invoice sync.

**Architecture:**
- React SPA (Vite + TailwindCSS) served as static files via Express, deployable anywhere by sharing one URL
- Node.js/Express backend that exposes a REST API for bookings, integrates Google Calendar for availability, posts to Slack for approval, sends Gmail via Google Workspace, and handles Stripe webhooks
- All automation wired through a single Hermes webhook that listens for Stripe payment events
- Odoo connected via its XML-RPC API to receive confirmed invoices

**Tech Stack:**
- Frontend: React 18, Vite, TailwindCSS, date-fns, react-hot-toast
- Backend: Node.js 24 LTS, Express 4, googleapis (Node SDK), @slack/web-api, nodemailer (Gmail OAuth2), stripe (Node SDK), xmlrpc (Odoo), better-sqlite3 (lightweight booking state DB)
- Infrastructure: PM2 for process management, dotenv for secrets

---

## Environment Context

Existing Stripe resources (test mode):
- Price €250 (EUR): price_1TMnIH8xOvs4P5fvn5jc0IQ4 — product prod_ULUGmOlzHFuohY
- Price €350 (EUR): price_1TMnIJ8xOvs4P5fvUbh80CCi — product prod_ULUGtZN3ng0Qp3
- Stripe secret key: stored in ~/.hermes/config.yaml STRIPE_SECRET_KEY env

Google Calendar:
- "#3 Venue Rental" calendar ID: c_c1cb22c487334781ff941640afae38f88ec1bd686aa468f6822bef1fb8a57e99@group.calendar.google.com
- Google OAuth token at ~/.hermes/google_token.json (AUTHENTICATED)
- Google Workspace credentials at ~/.hermes/ (client secret + token JSON)

Slack: Not yet configured — tokens required (SLACK_BOT_TOKEN, SLACK_APP_TOKEN)
Odoo: Credentials TBD — will be loaded from .env

Slot definitions:
- Morning:   09:00–13:00 CET — €250 — price_1TMnIH8xOvs4P5fvn5jc0IQ4
- Afternoon: 13:00–17:00 CET — €250 — price_1TMnIH8xOvs4P5fvn5jc0IQ4
- Evening:   18:00–22:00 CET — €350 — price_1TMnIJ8xOvs4P5fvUbh80CCi

---

## Task 1: Project Scaffold

**Objective:** Create the monorepo structure, install all dependencies, and configure environment.

**Files:**
- Create: `~/projects/allusion-booking/package.json` (root workspace)
- Create: `~/projects/allusion-booking/.env.example`
- Create: `~/projects/allusion-booking/backend/package.json`
- Create: `~/projects/allusion-booking/frontend/package.json`

**Steps:**

```bash
cd ~/projects/allusion-booking

# Root workspace
cat > package.json << 'EOF'
{
  "name": "allusion-booking",
  "private": true,
  "workspaces": ["backend", "frontend"],
  "scripts": {
    "dev:backend": "npm run dev --workspace=backend",
    "dev:frontend": "npm run dev --workspace=frontend",
    "build:frontend": "npm run build --workspace=frontend",
    "start": "npm run start --workspace=backend"
  }
}
EOF

# Backend
mkdir -p backend/src/{routes,services,db,middleware}
cd backend
npm init -y
npm install express cors dotenv better-sqlite3 googleapis @slack/web-api stripe nodemailer xmlrpc date-fns uuid
npm install -D nodemon
# Fix package.json scripts
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json'));
p.scripts = { start: 'node src/index.js', dev: 'nodemon src/index.js' };
p.main = 'src/index.js';
fs.writeFileSync('package.json', JSON.stringify(p, null, 2));
"

# Frontend
cd ../frontend
npm create vite@latest . -- --template react
npm install
npm install tailwindcss @tailwindcss/vite date-fns react-hot-toast axios lucide-react
npx tailwindcss init -p 2>/dev/null || true
```

**Create .env.example** at project root:

```
# Backend server
PORT=3001
FRONTEND_URL=http://localhost:5173

# Google Calendar + Gmail
GOOGLE_TOKEN_PATH=/home/trader/.hermes/google_token.json
GOOGLE_CREDENTIALS_PATH=/home/trader/.hermes/google_client_secret.json
VENUE_CALENDAR_ID=c_c1cb22c487334781ff941640afae38f88ec1bd686aa468f6822bef1fb8a57e99@group.calendar.google.com
GMAIL_USER=oc.al.assistant@gmail.com

# Allusion contact info
ALLUSION_EMAIL=info@allusion.be
ALLUSION_TEAM_EMAILS=info@allusion.be
ALLUSION_NAME=Allusion
VENUE_NAME=Allusion Venue, Ghent

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_APPROVAL_CHANNEL=#venue-bookings

# Stripe
STRIPE_SECRET_KEY=rk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PRICE_ID_250=price_1TMnIH8xOvs4P5fvn5jc0IQ4
PRICE_ID_350=price_1TMnIJ8xOvs4P5fvUbh80CCi

# Odoo
ODOO_URL=https://your-odoo-instance.odoo.com
ODOO_DB=your_database
ODOO_USERNAME=admin
ODOO_PASSWORD=your_password
ODOO_PARTNER_COUNTRY_ID=20

# Hermes Webhook (for Stripe events)
HERMES_WEBHOOK_SECRET=your_hermes_webhook_secret
```

Copy `.env.example` to `backend/.env` and fill real values.

**Verify:** `cd ~/projects/allusion-booking && ls backend/node_modules | head -5`

---

## Task 2: SQLite Booking Database

**Objective:** Create a lightweight SQLite schema to track booking state machine (pending → approved/rejected → paid).

**Files:**
- Create: `~/projects/allusion-booking/backend/src/db/schema.js`
- Create: `~/projects/allusion-booking/backend/src/db/index.js`

**schema.js:**

```javascript
const CREATE_BOOKINGS = `
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  slot TEXT NOT NULL CHECK(slot IN ('morning','afternoon','evening')),
  slot_start TEXT NOT NULL,
  slot_end TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  organization TEXT,
  message TEXT,
  guests INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','awaiting_payment','paid','cancelled')),
  calendar_event_id TEXT,
  stripe_payment_link TEXT,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  slack_message_ts TEXT,
  slack_channel_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CREATE_AUDIT_LOG = `
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT DEFAULT 'system',
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

module.exports = { CREATE_BOOKINGS, CREATE_AUDIT_LOG };
```

**db/index.js:**

```javascript
const Database = require('better-sqlite3');
const path = require('path');
const { CREATE_BOOKINGS, CREATE_AUDIT_LOG } = require('./schema');

const DB_PATH = path.join(__dirname, '../../data/bookings.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(CREATE_BOOKINGS);
    db.exec(CREATE_AUDIT_LOG);
  }
  return db;
}

function createBooking(booking) {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO bookings (id,date,slot,slot_start,slot_end,name,email,phone,organization,message,guests)
    VALUES (@id,@date,@slot,@slot_start,@slot_end,@name,@email,@phone,@organization,@message,@guests)
  `);
  stmt.run(booking);
  return getBookingById(booking.id);
}

function getBookingById(id) {
  return getDb().prepare('SELECT * FROM bookings WHERE id = ?').get(id);
}

function updateBooking(id, fields) {
  const d = getDb();
  const sets = Object.keys(fields).map(k => `${k} = @${k}`).join(', ');
  d.prepare(`UPDATE bookings SET ${sets}, updated_at = datetime('now') WHERE id = @id`)
   .run({ ...fields, id });
  return getBookingById(id);
}

function getBookingsByDate(date) {
  return getDb().prepare('SELECT * FROM bookings WHERE date = ? AND status NOT IN (?,?)').all(date, 'rejected', 'cancelled');
}

function appendAuditLog(booking_id, action, actor = 'system', detail = null) {
  getDb().prepare('INSERT INTO audit_log (booking_id,action,actor,detail) VALUES (?,?,?,?)').run(booking_id, action, actor, detail);
}

module.exports = { createBooking, getBookingById, updateBooking, getBookingsByDate, appendAuditLog };
```

**Verify:** `cd ~/projects/allusion-booking/backend && node -e "const db = require('./src/db'); console.log('DB OK')"`

---

## Task 3: Google Calendar Service

**Objective:** Service to check slot availability and create/delete calendar events using the existing Google OAuth token.

**Files:**
- Create: `~/projects/allusion-booking/backend/src/services/calendar.js`

**Key logic — reads from VENUE_CALENDAR_ID, uses existing ~/.hermes/google_token.json:**

```javascript
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config();

const SLOT_DEFINITIONS = {
  morning:   { label: 'Morning',   start: '09:00', end: '13:00' },
  afternoon: { label: 'Afternoon', start: '13:00', end: '17:00' },
  evening:   { label: 'Evening',   start: '18:00', end: '22:00' },
};

const TIMEZONE = 'Europe/Brussels';
const CALENDAR_ID = process.env.VENUE_CALENDAR_ID;

function getAuth() {
  const tokenPath = process.env.GOOGLE_TOKEN_PATH;
  const token = JSON.parse(fs.readFileSync(tokenPath));

  // Try to find client credentials
  let clientId, clientSecret;
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH;
  if (credPath && fs.existsSync(credPath)) {
    const creds = JSON.parse(fs.readFileSync(credPath));
    const info = creds.installed || creds.web;
    clientId = info.client_id;
    clientSecret = info.client_secret;
  } else {
    // Fall back to token's own client fields if present
    clientId = token.client_id || process.env.GOOGLE_CLIENT_ID;
    clientSecret = token.client_secret || process.env.GOOGLE_CLIENT_SECRET;
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials(token);

  // Auto-save refreshed tokens
  auth.on('tokens', (newTokens) => {
    const existing = JSON.parse(fs.readFileSync(tokenPath));
    fs.writeFileSync(tokenPath, JSON.stringify({ ...existing, ...newTokens }, null, 2));
  });

  return auth;
}

// Returns list of occupied slots for a given date (YYYY-MM-DD)
async function getOccupiedSlots(date) {
  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });

  const timeMin = new Date(`${date}T00:00:00+02:00`).toISOString();
  const timeMax = new Date(`${date}T23:59:59+02:00`).toISOString();

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items || [];
  const occupied = [];

  for (const slot of Object.keys(SLOT_DEFINITIONS)) {
    const slotDef = SLOT_DEFINITIONS[slot];
    const slotStart = new Date(`${date}T${slotDef.start}:00+02:00`);
    const slotEnd   = new Date(`${date}T${slotDef.end}:00+02:00`);

    const conflict = events.some(ev => {
      const evStart = new Date(ev.start.dateTime || ev.start.date);
      const evEnd   = new Date(ev.end.dateTime || ev.end.date);
      // Overlap check
      return evStart < slotEnd && evEnd > slotStart;
    });

    if (conflict) occupied.push(slot);
  }

  return occupied;
}

// Returns available slots for a date
async function getAvailableSlots(date) {
  const occupied = await getOccupiedSlots(date);
  return Object.keys(SLOT_DEFINITIONS).filter(s => !occupied.includes(s));
}

// Creates a tentative calendar event; returns event ID
async function createCalendarEvent(booking) {
  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });
  const slotDef = SLOT_DEFINITIONS[booking.slot];

  const event = {
    summary: `[PENDING] ${booking.name} — ${slotDef.label} Slot`,
    description: `Booking ID: ${booking.id}\nOrganization: ${booking.organization || 'N/A'}\nGuests: ${booking.guests}\nMessage: ${booking.message || 'N/A'}\nEmail: ${booking.email}\nPhone: ${booking.phone || 'N/A'}`,
    start: { dateTime: `${booking.date}T${slotDef.start}:00`, timeZone: TIMEZONE },
    end:   { dateTime: `${booking.date}T${slotDef.end}:00`, timeZone: TIMEZONE },
    colorId: '5', // banana yellow = tentative
    status: 'tentative',
  };

  const res = await calendar.events.insert({ calendarId: CALENDAR_ID, requestBody: event });
  return res.data.id;
}

// Confirms a calendar event (changes color + title) after approval
async function confirmCalendarEvent(eventId, bookingName, slot) {
  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });
  const slotDef = SLOT_DEFINITIONS[slot];

  await calendar.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: {
      summary: `✅ CONFIRMED: ${bookingName} — ${slotDef.label} Slot`,
      colorId: '2', // sage green
      status: 'confirmed',
    },
  });
}

// Deletes a calendar event on rejection
async function deleteCalendarEvent(eventId) {
  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });
  try {
    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
  } catch (e) {
    if (e.code !== 410) throw e; // ignore already-deleted
  }
}

module.exports = { getAvailableSlots, getOccupiedSlots, createCalendarEvent, confirmCalendarEvent, deleteCalendarEvent, SLOT_DEFINITIONS };
```

**Verify:**
```bash
cd ~/projects/allusion-booking/backend
node -e "require('dotenv').config(); const c = require('./src/services/calendar'); c.getAvailableSlots('2026-04-20').then(console.log)"
```

---

## Task 4: Stripe Service

**Objective:** Service to create payment links and handle Stripe webhooks.

**Files:**
- Create: `~/projects/allusion-booking/backend/src/services/stripe.js`

```javascript
const Stripe = require('stripe');
require('dotenv').config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_MAP = {
  morning:   process.env.PRICE_ID_250,
  afternoon: process.env.PRICE_ID_250,
  evening:   process.env.PRICE_ID_350,
};

const AMOUNT_MAP = {
  morning:   250,
  afternoon: 250,
  evening:   350,
};

// Creates a one-time payment link for a specific slot
async function createPaymentLink(booking) {
  const priceId = PRICE_MAP[booking.slot];
  if (!priceId) throw new Error(`Unknown slot: ${booking.slot}`);

  const link = await stripe.paymentLinks.create({
    line_items: [{ price: priceId, quantity: 1 }],
    after_completion: { type: 'redirect', redirect: { url: `${process.env.FRONTEND_URL}/booking-confirmed?id=${booking.id}` } },
    metadata: {
      booking_id: booking.id,
      booking_date: booking.date,
      booking_slot: booking.slot,
      customer_email: booking.email,
      customer_name: booking.name,
    },
    customer_email: booking.email,
    phone_number_collection: { enabled: false },
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `Venue booking — ${booking.slot} slot — ${booking.date}`,
        metadata: { booking_id: booking.id },
        rendering_options: { amount_tax_display: 'include_inclusive_tax' },
      },
    },
  });

  return link.url;
}

// Verify and parse Stripe webhook signature
function constructWebhookEvent(rawBody, signature) {
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

// Retrieve invoice PDF URL from Stripe
async function getInvoicePdfUrl(invoiceId) {
  const invoice = await stripe.invoices.retrieve(invoiceId);
  return { pdfUrl: invoice.invoice_pdf, hostedUrl: invoice.hosted_invoice_url, total: invoice.amount_paid };
}

// Retrieve payment intent
async function getPaymentIntent(piId) {
  return stripe.paymentIntents.retrieve(piId, { expand: ['invoice'] });
}

module.exports = { createPaymentLink, constructWebhookEvent, getInvoicePdfUrl, getPaymentIntent, AMOUNT_MAP };
```

---

## Task 5: Slack Service

**Objective:** Service to post booking requests to Slack with approve/reject/meeting action buttons.

**Files:**
- Create: `~/projects/allusion-booking/backend/src/services/slack.js`

```javascript
const { WebClient } = require('@slack/web-api');
require('dotenv').config();

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const CHANNEL = process.env.SLACK_APPROVAL_CHANNEL;

const SLOT_LABELS = {
  morning:   'Morning   (09:00–13:00)',
  afternoon: 'Afternoon (13:00–17:00)',
  evening:   'Evening   (18:00–22:00)',
};

const PRICE_LABELS = {
  morning: '€250', afternoon: '€250', evening: '€350',
};

// Post booking request with action buttons; returns ts + channel
async function postBookingRequest(booking) {
  const res = await slack.chat.postMessage({
    channel: CHANNEL,
    text: `New venue booking request from ${booking.name}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🏛️ New Venue Booking Request', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Name:*\n${booking.name}` },
          { type: 'mrkdwn', text: `*Email:*\n${booking.email}` },
          { type: 'mrkdwn', text: `*Date:*\n${booking.date}` },
          { type: 'mrkdwn', text: `*Slot:*\n${SLOT_LABELS[booking.slot]}` },
          { type: 'mrkdwn', text: `*Price:*\n${PRICE_LABELS[booking.slot]}` },
          { type: 'mrkdwn', text: `*Guests:*\n${booking.guests}` },
        ],
      },
      ...(booking.organization ? [{
        type: 'section',
        text: { type: 'mrkdwn', text: `*Organization:* ${booking.organization}` },
      }] : []),
      ...(booking.message ? [{
        type: 'section',
        text: { type: 'mrkdwn', text: `*Message:*\n${booking.message}` },
      }] : []),
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Booking ID:* \`${booking.id}\`` },
      },
      {
        type: 'actions',
        block_id: `booking_${booking.id}`,
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Approve', emoji: true },
            style: 'primary',
            action_id: 'approve_booking',
            value: booking.id,
            confirm: {
              title: { type: 'plain_text', text: 'Approve this booking?' },
              text: { type: 'plain_text', text: `This will send a ${PRICE_LABELS[booking.slot]} payment link to ${booking.email}` },
              confirm: { type: 'plain_text', text: 'Yes, approve' },
              deny: { type: 'plain_text', text: 'Cancel' },
            },
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ Reject', emoji: true },
            style: 'danger',
            action_id: 'reject_booking',
            value: booking.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '📅 Request Follow-up Meeting', emoji: true },
            action_id: 'followup_booking',
            value: booking.id,
          },
        ],
      },
    ],
  });

  return { ts: res.ts, channel: res.channel };
}

// Update the Slack message with outcome
async function updateBookingMessage(channel, ts, booking, outcome) {
  const outcomeEmojis = { approved: '✅', rejected: '❌', paid: '💳' };
  const outcomeTexts = { approved: 'APPROVED', rejected: 'REJECTED', paid: 'PAID' };

  await slack.chat.update({
    channel,
    ts,
    text: `Booking ${outcome}: ${booking.name} on ${booking.date}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${outcomeEmojis[outcome] || '📝'} Booking ${outcomeTexts[outcome] || outcome.toUpperCase()}`, emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Name:*\n${booking.name}` },
          { type: 'mrkdwn', text: `*Date:*\n${booking.date}` },
          { type: 'mrkdwn', text: `*Slot:*\n${SLOT_LABELS[booking.slot]}` },
          { type: 'mrkdwn', text: `*Status:*\n${outcomeEmojis[outcome]} ${outcomeTexts[outcome] || outcome}` },
        ],
      },
      ...(outcome === 'paid' ? [{
        type: 'section',
        text: { type: 'mrkdwn', text: '💰 Payment confirmed. Invoice sent to customer. Odoo sync complete.' },
      }] : []),
    ],
  });
}

// Post a thread reply
async function postThreadReply(channel, ts, text) {
  await slack.chat.postMessage({ channel, thread_ts: ts, text });
}

module.exports = { postBookingRequest, updateBookingMessage, postThreadReply };
```

---

## Task 6: Email Service (Gmail via Google OAuth2)

**Objective:** Service to send HTML emails — approval notification, follow-up meeting proposal, payment link, and invoice delivery.

**Files:**
- Create: `~/projects/allusion-booking/backend/src/services/email.js`

```javascript
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config();

function getTransporter() {
  const tokenPath = process.env.GOOGLE_TOKEN_PATH;
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

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: process.env.GMAIL_USER,
      clientId,
      clientSecret,
      refreshToken: token.refresh_token,
      accessToken: token.access_token,
    },
  });
}

const SLOT_LABELS = {
  morning: 'Morning (09:00–13:00)',
  afternoon: 'Afternoon (13:00–17:00)',
  evening: 'Evening (18:00–22:00)',
};

const PRICE_LABELS = { morning: '€250', afternoon: '€250', evening: '€350' };

// Email 1: Sent to customer after approval — includes payment link
async function sendPaymentLinkEmail(booking, paymentLink) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"${process.env.ALLUSION_NAME}" <${process.env.GMAIL_USER}>`,
    to: booking.email,
    subject: `Your venue booking at ${process.env.VENUE_NAME} — Payment Required`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Your Booking Has Been Approved! 🎉</h2>
        <p>Dear ${booking.name},</p>
        <p>We're excited to confirm that your venue booking request has been approved.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr><td style="padding:8px;border:1px solid #e0e0e0;background:#f5f5f5;font-weight:bold;">Date</td><td style="padding:8px;border:1px solid #e0e0e0;">${booking.date}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e0e0e0;background:#f5f5f5;font-weight:bold;">Slot</td><td style="padding:8px;border:1px solid #e0e0e0;">${SLOT_LABELS[booking.slot]}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e0e0e0;background:#f5f5f5;font-weight:bold;">Amount</td><td style="padding:8px;border:1px solid #e0e0e0;">${PRICE_LABELS[booking.slot]}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e0e0e0;background:#f5f5f5;font-weight:bold;">Venue</td><td style="padding:8px;border:1px solid #e0e0e0;">${process.env.VENUE_NAME}</td></tr>
        </table>
        <p>To secure your booking, please complete payment using the link below:</p>
        <div style="text-align:center;margin:30px 0;">
          <a href="${paymentLink}" style="background:#1a1a2e;color:white;padding:14px 28px;text-decoration:none;border-radius:6px;font-size:16px;font-weight:bold;">Pay ${PRICE_LABELS[booking.slot]} Now</a>
        </div>
        <p style="color:#666;font-size:14px;">This payment link is valid for 24 hours. If you have questions, reply to this email.</p>
        <p>Best regards,<br/>${process.env.ALLUSION_NAME}</p>
      </div>
    `,
  });
}

// Email 2: Follow-up meeting proposal
async function sendFollowupMeetingEmail(booking) {
  const transporter = getTransporter();
  const teamEmails = process.env.ALLUSION_TEAM_EMAILS.split(',').map(e => e.trim());

  // To the customer
  await transporter.sendMail({
    from: `"${process.env.ALLUSION_NAME}" <${process.env.GMAIL_USER}>`,
    to: booking.email,
    subject: `Follow-up Meeting Request — Venue Booking at ${process.env.VENUE_NAME}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">We'd Love to Chat! ☕</h2>
        <p>Dear ${booking.name},</p>
        <p>Thank you for your interest in booking our venue. We've reviewed your request and would love to schedule a quick follow-up meeting to discuss the details and ensure everything meets your needs.</p>
        <p>Please reply to this email with a few times that work for you, and we'll get something confirmed right away.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr><td style="padding:8px;border:1px solid #e0e0e0;background:#f5f5f5;font-weight:bold;">Requested Date</td><td style="padding:8px;border:1px solid #e0e0e0;">${booking.date}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e0e0e0;background:#f5f5f5;font-weight:bold;">Requested Slot</td><td style="padding:8px;border:1px solid #e0e0e0;">${SLOT_LABELS[booking.slot]}</td></tr>
        </table>
        <p>Best regards,<br/>${process.env.ALLUSION_NAME}</p>
      </div>
    `,
  });

  // Internal notification to the team
  if (teamEmails.length) {
    await transporter.sendMail({
      from: `"Booking System" <${process.env.GMAIL_USER}>`,
      to: teamEmails.join(', '),
      subject: `[Follow-up Needed] Booking from ${booking.name} — ${booking.date}`,
      html: `
        <p>A follow-up meeting has been requested for booking <strong>${booking.id}</strong>.</p>
        <p><strong>Customer:</strong> ${booking.name} &lt;${booking.email}&gt;</p>
        <p><strong>Date/Slot:</strong> ${booking.date} — ${SLOT_LABELS[booking.slot]}</p>
        <p>An email has been sent to the customer asking them to propose times. Please monitor and respond promptly.</p>
      `,
    });
  }
}

// Email 3: Send paid invoice to customer
async function sendInvoiceEmail(booking, invoiceData) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"${process.env.ALLUSION_NAME}" <${process.env.GMAIL_USER}>`,
    to: booking.email,
    subject: `Payment Confirmed & Invoice — ${process.env.VENUE_NAME}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Payment Confirmed! 💳✅</h2>
        <p>Dear ${booking.name},</p>
        <p>Your payment has been received. Your booking is now fully confirmed!</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr><td style="padding:8px;border:1px solid #e0e0e0;background:#f5f5f5;font-weight:bold;">Date</td><td style="padding:8px;border:1px solid #e0e0e0;">${booking.date}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e0e0e0;background:#f5f5f5;font-weight:bold;">Slot</td><td style="padding:8px;border:1px solid #e0e0e0;">${SLOT_LABELS[booking.slot]}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e0e0e0;background:#f5f5f5;font-weight:bold;">Amount Paid</td><td style="padding:8px;border:1px solid #e0e0e0;">€${(invoiceData.total / 100).toFixed(2)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e0e0e0;background:#f5f5f5;font-weight:bold;">Venue</td><td style="padding:8px;border:1px solid #e0e0e0;">${process.env.VENUE_NAME}</td></tr>
        </table>
        <div style="text-align:center;margin:30px 0;">
          <a href="${invoiceData.pdfUrl}" style="background:#1a1a2e;color:white;padding:14px 28px;text-decoration:none;border-radius:6px;font-size:16px;">Download Invoice PDF</a>
        </div>
        <p>We look forward to seeing you!</p>
        <p>Best regards,<br/>${process.env.ALLUSION_NAME}</p>
      </div>
    `,
  });
}

module.exports = { sendPaymentLinkEmail, sendFollowupMeetingEmail, sendInvoiceEmail };
```

---

## Task 7: Odoo Service

**Objective:** Service to create a partner and invoice in Odoo after payment.

**Files:**
- Create: `~/projects/allusion-booking/backend/src/services/odoo.js`

```javascript
const xmlrpc = require('xmlrpc');
require('dotenv').config();

function createClient(path) {
  const url = new URL(process.env.ODOO_URL);
  const secure = url.protocol === 'https:';
  const options = {
    host: url.hostname,
    port: url.port || (secure ? 443 : 80),
    path,
  };
  return secure ? xmlrpc.createSecureClient(options) : xmlrpc.createClient(options);
}

function call(client, method, params) {
  return new Promise((resolve, reject) => {
    client.methodCall(method, params, (err, val) => {
      if (err) reject(err);
      else resolve(val);
    });
  });
}

async function authenticate() {
  const client = createClient('/xmlrpc/2/common');
  const uid = await call(client, 'authenticate', [
    process.env.ODOO_DB,
    process.env.ODOO_USERNAME,
    process.env.ODOO_PASSWORD,
    {},
  ]);
  if (!uid || uid === false) throw new Error('Odoo authentication failed');
  return uid;
}

function modelsClient() {
  return createClient('/xmlrpc/2/object');
}

// Find or create a partner by email
async function findOrCreatePartner(uid, booking) {
  const models = modelsClient();
  const params = [process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD];

  const existing = await call(models, 'execute_kw', [
    ...params, 'res.partner', 'search_read',
    [[['email', '=', booking.email]]],
    { fields: ['id', 'name', 'email'], limit: 1 },
  ]);

  if (existing.length > 0) return existing[0].id;

  const partnerId = await call(models, 'execute_kw', [
    ...params, 'res.partner', 'create',
    [{
      name: booking.name,
      email: booking.email,
      phone: booking.phone || '',
      comment: `Venue booking customer. Organization: ${booking.organization || 'N/A'}`,
      country_id: parseInt(process.env.ODOO_PARTNER_COUNTRY_ID || 20), // 20 = Belgium
    }],
  ]);

  return partnerId;
}

// Create a paid invoice in Odoo
async function syncInvoiceToOdoo(booking, invoiceData) {
  try {
    const uid = await authenticate();
    const models = modelsClient();
    const params = [process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD];

    const partnerId = await findOrCreatePartner(uid, booking);

    const SLOT_LABELS = {
      morning: 'Morning Slot (09:00–13:00)',
      afternoon: 'Afternoon Slot (13:00–17:00)',
      evening: 'Evening Slot (18:00–22:00)',
    };

    const amount = invoiceData.total / 100;

    // Create invoice (account.move)
    const invoiceId = await call(models, 'execute_kw', [
      ...params, 'account.move', 'create',
      [{
        move_type: 'out_invoice',
        partner_id: partnerId,
        invoice_date: booking.date,
        ref: `Stripe Invoice — Booking ${booking.id}`,
        narration: `Venue booking: ${SLOT_LABELS[booking.slot]} on ${booking.date}\nStripe Payment Link: ${booking.stripe_payment_link}`,
        invoice_line_ids: [[0, 0, {
          name: `${process.env.VENUE_NAME} — ${SLOT_LABELS[booking.slot]}`,
          quantity: 1,
          price_unit: amount,
        }]],
      }],
    ]);

    // Confirm (post) the invoice
    await call(models, 'execute_kw', [
      ...params, 'account.move', 'action_post',
      [[invoiceId]],
    ]);

    // Register payment (mark as paid)
    const paymentId = await call(models, 'execute_kw', [
      ...params, 'account.payment', 'create',
      [{
        payment_type: 'inbound',
        partner_type: 'customer',
        partner_id: partnerId,
        amount,
        date: new Date().toISOString().split('T')[0],
        ref: `Stripe — ${booking.stripe_payment_intent_id}`,
        journal_id: 1, // Default journal — may need to update
      }],
    ]);

    await call(models, 'execute_kw', [
      ...params, 'account.payment', 'action_post',
      [[paymentId]],
    ]);

    return { invoiceId, partnerId };
  } catch (err) {
    // Log but don't throw — Odoo sync is non-blocking
    console.error('[Odoo] Sync error:', err.message);
    return null;
  }
}

module.exports = { syncInvoiceToOdoo };
```

---

## Task 8: Express API Routes

**Objective:** Wire up all REST endpoints: availability, booking submission, Slack action handler, Stripe webhook.

**Files:**
- Create: `~/projects/allusion-booking/backend/src/routes/availability.js`
- Create: `~/projects/allusion-booking/backend/src/routes/bookings.js`
- Create: `~/projects/allusion-booking/backend/src/routes/slack-actions.js`
- Create: `~/projects/allusion-booking/backend/src/routes/stripe-webhook.js`
- Create: `~/projects/allusion-booking/backend/src/index.js`

### availability.js

```javascript
const express = require('express');
const router = express.Router();
const { getAvailableSlots } = require('../services/calendar');

// GET /api/availability?date=2026-05-01
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
    }

    // Don't allow past dates
    const today = new Date().toISOString().split('T')[0];
    if (date < today) {
      return res.json({ date, available: [], unavailable: ['morning', 'afternoon', 'evening'] });
    }

    const available = await getAvailableSlots(date);
    const all = ['morning', 'afternoon', 'evening'];
    const unavailable = all.filter(s => !available.includes(s));

    res.json({ date, available, unavailable });
  } catch (err) {
    console.error('[Availability]', err);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

module.exports = router;
```

### bookings.js

```javascript
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getAvailableSlots, createCalendarEvent, SLOT_DEFINITIONS } = require('../services/calendar');
const { postBookingRequest } = require('../services/slack');
const { createBooking, updateBooking, getBookingById, appendAuditLog } = require('../db');

// POST /api/bookings — submit a new booking request
router.post('/', async (req, res) => {
  try {
    const { date, slot, name, email, phone, organization, message, guests } = req.body;

    // Validate required fields
    if (!date || !slot || !name || !email) {
      return res.status(400).json({ error: 'Missing required fields: date, slot, name, email' });
    }
    if (!['morning', 'afternoon', 'evening'].includes(slot)) {
      return res.status(400).json({ error: 'Invalid slot' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Check availability
    const available = await getAvailableSlots(date);
    if (!available.includes(slot)) {
      return res.status(409).json({ error: 'This slot is no longer available. Please choose another.' });
    }

    const slotDef = SLOT_DEFINITIONS[slot];
    const booking = {
      id: uuidv4(),
      date,
      slot,
      slot_start: `${date}T${slotDef.start}:00`,
      slot_end: `${date}T${slotDef.end}:00`,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      organization: organization?.trim() || null,
      message: message?.trim() || null,
      guests: parseInt(guests) || 1,
    };

    // Save to DB
    const saved = createBooking(booking);
    appendAuditLog(booking.id, 'BOOKING_CREATED', 'customer', `Submitted from ${req.ip}`);

    // Create tentative calendar event
    let calendarEventId = null;
    try {
      calendarEventId = await createCalendarEvent(booking);
      updateBooking(booking.id, { calendar_event_id: calendarEventId });
    } catch (calErr) {
      console.error('[Calendar] Failed to create event:', calErr.message);
    }

    // Notify Slack
    try {
      const { ts, channel } = await postBookingRequest(booking);
      updateBooking(booking.id, { slack_message_ts: ts, slack_channel_id: channel });
    } catch (slackErr) {
      console.error('[Slack] Failed to post:', slackErr.message);
    }

    res.status(201).json({
      id: booking.id,
      message: 'Booking request submitted. You will receive an email once it is reviewed.',
    });
  } catch (err) {
    console.error('[Bookings POST]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/bookings/:id — get booking status
router.get('/:id', async (req, res) => {
  const booking = getBookingById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  // Return safe subset
  const { id, date, slot, name, status, created_at } = booking;
  res.json({ id, date, slot, name, status, created_at });
});

module.exports = router;
```

### slack-actions.js

```javascript
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getBookingById, updateBooking, appendAuditLog } = require('../db');
const { confirmCalendarEvent, deleteCalendarEvent } = require('../services/calendar');
const { createPaymentLink } = require('../services/stripe');
const { sendPaymentLinkEmail, sendFollowupMeetingEmail } = require('../services/email');
const { updateBookingMessage, postThreadReply } = require('../services/slack');
require('dotenv').config();

// Verify Slack request signature
function verifySlackSignature(req) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return true; // Skip in dev if not set

  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];
  if (!timestamp || !signature) return false;

  // Reject old messages (replay attack prevention)
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

  const baseString = `v0:${timestamp}:${req.rawBody}`;
  const expected = 'v0=' + crypto.createHmac('sha256', signingSecret).update(baseString).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// POST /api/slack/actions
router.post('/actions', express.urlencoded({ extended: true }), async (req, res) => {
  // Acknowledge immediately (Slack requires <3s response)
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
      // 1. Mark approved
      updateBooking(bookingId, { status: 'approved' });
      appendAuditLog(bookingId, 'APPROVED', actor);

      // 2. Confirm calendar event
      if (booking.calendar_event_id) {
        await confirmCalendarEvent(booking.calendar_event_id, booking.name, booking.slot);
      }

      // 3. Create Stripe payment link
      const paymentLink = await createPaymentLink(booking);
      updateBooking(bookingId, { status: 'awaiting_payment', stripe_payment_link: paymentLink });
      appendAuditLog(bookingId, 'PAYMENT_LINK_CREATED', 'system', paymentLink);

      // 4. Email payment link to customer
      await sendPaymentLinkEmail(booking, paymentLink);
      appendAuditLog(bookingId, 'PAYMENT_EMAIL_SENT', 'system');

      // 5. Update Slack message
      await updateBookingMessage(booking.slack_channel_id, booking.slack_message_ts, booking, 'approved');
      await postThreadReply(
        booking.slack_channel_id, booking.slack_message_ts,
        `✅ Approved by ${actor}. Payment link sent to ${booking.email}`
      );

    } else if (action.action_id === 'reject_booking') {
      // 1. Mark rejected
      updateBooking(bookingId, { status: 'rejected' });
      appendAuditLog(bookingId, 'REJECTED', actor);

      // 2. Delete calendar event
      if (booking.calendar_event_id) {
        await deleteCalendarEvent(booking.calendar_event_id);
      }

      // 3. Update Slack message
      await updateBookingMessage(booking.slack_channel_id, booking.slack_message_ts, booking, 'rejected');
      await postThreadReply(
        booking.slack_channel_id, booking.slack_message_ts,
        `❌ Rejected by ${actor}.`
      );

    } else if (action.action_id === 'followup_booking') {
      // 1. Send follow-up meeting emails
      await sendFollowupMeetingEmail(booking);
      appendAuditLog(bookingId, 'FOLLOWUP_REQUESTED', actor);

      await postThreadReply(
        booking.slack_channel_id, booking.slack_message_ts,
        `📅 Follow-up meeting email sent to ${booking.email} by ${actor}.`
      );
    }
  } catch (err) {
    console.error('[Slack Actions]', err);
  }
});

module.exports = router;
```

### stripe-webhook.js

```javascript
const express = require('express');
const router = express.Router();
const { constructWebhookEvent, getInvoicePdfUrl } = require('../services/stripe');
const { getBookingById, updateBooking, appendAuditLog } = require('../db');
const { confirmCalendarEvent } = require('../services/calendar');
const { sendInvoiceEmail } = require('../services/email');
const { updateBookingMessage, postThreadReply } = require('../services/slack');
const { syncInvoiceToOdoo } = require('../services/odoo');

// IMPORTANT: This route needs raw body — mounted BEFORE express.json() in index.js
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = constructWebhookEvent(req.body, sig);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Acknowledge immediately
  res.status(200).json({ received: true });

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
      // Get booking ID from metadata
      const obj = event.data.object;
      const metadata = obj.metadata || {};
      const bookingId = metadata.booking_id;

      if (!bookingId) return;

      const booking = getBookingById(bookingId);
      if (!booking) return;
      if (booking.status === 'paid') return; // idempotent

      const piId = obj.id.startsWith('pi_') ? obj.id : obj.payment_intent;
      updateBooking(bookingId, {
        status: 'paid',
        stripe_payment_intent_id: piId,
      });
      appendAuditLog(bookingId, 'PAYMENT_RECEIVED', 'stripe', piId);

      // Get invoice data
      let invoiceData = { pdfUrl: null, hostedUrl: null, total: obj.amount_received || obj.amount };
      if (obj.invoice) {
        try {
          invoiceData = await getInvoicePdfUrl(obj.invoice);
          updateBooking(bookingId, { stripe_invoice_id: obj.invoice });
        } catch (e) {
          console.error('[Stripe] Invoice fetch failed:', e.message);
        }
      }

      // Re-fetch updated booking
      const updatedBooking = getBookingById(bookingId);

      // Confirm calendar event
      if (booking.calendar_event_id) {
        try {
          await confirmCalendarEvent(booking.calendar_event_id, booking.name, booking.slot);
        } catch (e) {
          console.error('[Calendar] Confirm failed:', e.message);
        }
      }

      // Send invoice email
      try {
        await sendInvoiceEmail(updatedBooking, invoiceData);
        appendAuditLog(bookingId, 'INVOICE_EMAIL_SENT', 'system');
      } catch (e) {
        console.error('[Email] Invoice email failed:', e.message);
      }

      // Update Slack
      try {
        if (booking.slack_message_ts) {
          await updateBookingMessage(booking.slack_channel_id, booking.slack_message_ts, updatedBooking, 'paid');
          await postThreadReply(
            booking.slack_channel_id, booking.slack_message_ts,
            `💳 Payment confirmed! Invoice emailed to ${booking.email}.`
          );
        }
      } catch (e) {
        console.error('[Slack] Update failed:', e.message);
      }

      // Sync to Odoo
      try {
        const odooResult = await syncInvoiceToOdoo(updatedBooking, invoiceData);
        if (odooResult) {
          appendAuditLog(bookingId, 'ODOO_SYNC_COMPLETE', 'system', `Odoo invoice: ${odooResult.invoiceId}`);
        }
      } catch (e) {
        console.error('[Odoo] Sync failed:', e.message);
      }
    }
  } catch (err) {
    console.error('[Stripe Webhook] Handler error:', err);
  }
});

module.exports = router;
```

### index.js (main server)

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_DIST = path.join(__dirname, '../../frontend/dist');

// ── Stripe webhook needs raw body — mount FIRST ──────────────────────
const stripeWebhookRouter = require('./routes/stripe-webhook');
app.use('/api/stripe', stripeWebhookRouter);

// ── Slack actions needs raw body for signature verification ───────────
app.use((req, res, next) => {
  let rawBody = '';
  req.on('data', chunk => { rawBody += chunk.toString(); });
  req.on('end', () => {
    req.rawBody = rawBody;
    next();
  });
});

// ── Standard middleware ───────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// ── API Routes ────────────────────────────────────────────────────────
const availabilityRouter = require('./routes/availability');
const bookingsRouter = require('./routes/bookings');
const slackActionsRouter = require('./routes/slack-actions');

app.use('/api/availability', availabilityRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/slack', slackActionsRouter);

// ── Health check ─────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Serve React frontend (production) ────────────────────────────────
app.use(express.static(FRONTEND_DIST));
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[Allusion Booking] Server running on http://localhost:${PORT}`);
});
```

---

## Task 9: React Frontend — Booking Page

**Objective:** Build a beautiful, minimal React booking page with date picker, slot selector, and form.

**Files:**
- Create: `~/projects/allusion-booking/frontend/src/App.jsx`
- Create: `~/projects/allusion-booking/frontend/src/BookingPage.jsx`
- Create: `~/projects/allusion-booking/frontend/src/ConfirmedPage.jsx`
- Modify: `~/projects/allusion-booking/frontend/src/index.css`
- Modify: `~/projects/allusion-booking/frontend/vite.config.js`

### vite.config.js (add proxy for dev)

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
```

### index.css

```css
@import "tailwindcss";

@layer base {
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  }
}
```

### App.jsx

```jsx
import { Toaster } from 'react-hot-toast';
import BookingPage from './BookingPage';
import ConfirmedPage from './ConfirmedPage';

export default function App() {
  const isConfirmed = window.location.pathname === '/booking-confirmed';
  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <Toaster position="top-center" />
      {isConfirmed ? <ConfirmedPage /> : <BookingPage />}
    </div>
  );
}
```

### BookingPage.jsx

Full booking form with:
- Dark elegant design (#0f0f1a background, white/gold accents)
- Date picker (native input[type=date]) with min=today
- Slot cards showing Morning/Afternoon/Evening with price, timing, availability
- Contact form: name, email, phone, organization, guests, message
- Availability loaded via GET /api/availability?date=... on date change
- Submit via POST /api/bookings
- Success state with booking ID
- Error handling with toast notifications
- Responsive mobile-first layout

```jsx
import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { format, addDays } from 'date-fns';

const SLOTS = [
  { id: 'morning',   label: 'Morning',   hours: '09:00 – 13:00', price: 250, icon: '🌅' },
  { id: 'afternoon', label: 'Afternoon', hours: '13:00 – 17:00', price: 250, icon: '☀️' },
  { id: 'evening',   label: 'Evening',   hours: '18:00 – 22:00', price: 350, icon: '🌙' },
];

const today = new Date().toISOString().split('T')[0];

export default function BookingPage() {
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('');
  const [availability, setAvailability] = useState({ available: [], unavailable: [] });
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', organization: '', guests: 1, message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  useEffect(() => {
    if (!date) return;
    setSlot('');
    setLoadingAvail(true);
    axios.get(`/api/availability?date=${date}`)
      .then(r => setAvailability(r.data))
      .catch(() => toast.error('Failed to check availability'))
      .finally(() => setLoadingAvail(false));
  }, [date]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date || !slot) return toast.error('Please select a date and time slot');
    setSubmitting(true);
    try {
      const res = await axios.post('/api/bookings', { date, slot, ...form });
      setSubmitted(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-10 max-w-md text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-white mb-2">Request Submitted!</h2>
          <p className="text-white/60 mb-4">We'll review your request and be in touch shortly. Check your email for confirmation.</p>
          <p className="text-white/40 text-sm font-mono">Booking ID: {submitted.id}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-sm font-bold text-black">A</div>
          <span className="text-white font-semibold text-lg">Allusion</span>
          <span className="text-white/30 mx-2">|</span>
          <span className="text-white/50 text-sm">Venue Booking · Ghent</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-white mb-3">Book Our Venue</h1>
          <p className="text-white/50 text-lg">A beautiful space in the heart of Ghent — available in 4-hour slots.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Step 1: Date */}
          <section>
            <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-4">1 — Choose a Date</h2>
            <input
              type="date"
              min={today}
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400/50 focus:bg-white/8 transition-all"
            />
          </section>

          {/* Step 2: Slot */}
          {date && (
            <section>
              <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-4">
                2 — Choose a Time Slot
                {loadingAvail && <span className="ml-2 text-amber-400/60 normal-case font-normal tracking-normal">Checking availability…</span>}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {SLOTS.map(s => {
                  const isAvailable = availability.available.includes(s.id);
                  const isUnavailable = availability.unavailable.includes(s.id);
                  const isSelected = slot === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={isUnavailable || loadingAvail}
                      onClick={() => setSlot(s.id)}
                      className={`relative rounded-xl border p-5 text-left transition-all duration-200
                        ${isSelected
                          ? 'border-amber-400 bg-amber-400/10 shadow-lg shadow-amber-400/10'
                          : isUnavailable
                          ? 'border-white/5 bg-white/2 opacity-40 cursor-not-allowed'
                          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8 cursor-pointer'
                        }`}
                    >
                      <div className="text-2xl mb-3">{s.icon}</div>
                      <div className={`font-semibold text-base mb-1 ${isSelected ? 'text-amber-400' : 'text-white'}`}>{s.label}</div>
                      <div className="text-white/40 text-sm mb-3">{s.hours}</div>
                      <div className={`text-lg font-bold ${isSelected ? 'text-amber-400' : 'text-white/80'}`}>€{s.price}</div>
                      {isUnavailable && (
                        <div className="absolute top-3 right-3 text-xs text-white/30 bg-white/5 px-2 py-1 rounded-full">Booked</div>
                      )}
                      {isSelected && (
                        <div className="absolute top-3 right-3 text-xs text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full">Selected</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Step 3: Contact Details */}
          {slot && (
            <section>
              <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-4">3 — Your Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-white/50 text-sm mb-2">Full Name *</label>
                  <input
                    type="text" required
                    value={form.name}
                    onChange={e => setForm(f => ({...f, name: e.target.value}))}
                    placeholder="Jane Smith"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-amber-400/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-white/50 text-sm mb-2">Email Address *</label>
                  <input
                    type="email" required
                    value={form.email}
                    onChange={e => setForm(f => ({...f, email: e.target.value}))}
                    placeholder="jane@example.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-amber-400/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-white/50 text-sm mb-2">Phone Number</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({...f, phone: e.target.value}))}
                    placeholder="+32 ..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-amber-400/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-white/50 text-sm mb-2">Organization / Event Name</label>
                  <input
                    type="text"
                    value={form.organization}
                    onChange={e => setForm(f => ({...f, organization: e.target.value}))}
                    placeholder="Company or event name"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-amber-400/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-white/50 text-sm mb-2">Expected Guests</label>
                  <input
                    type="number" min="1" max="500"
                    value={form.guests}
                    onChange={e => setForm(f => ({...f, guests: parseInt(e.target.value) || 1}))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400/50 transition-all"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-white/50 text-sm mb-2">Message / Event Description</label>
                  <textarea
                    rows={4}
                    value={form.message}
                    onChange={e => setForm(f => ({...f, message: e.target.value}))}
                    placeholder="Tell us a bit about your event..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-amber-400/50 transition-all resize-none"
                  />
                </div>
              </div>
            </section>
          )}

          {/* Summary + Submit */}
          {slot && (
            <section className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-4">Booking Summary</h3>
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Date</span>
                  <span className="text-white">{date}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Slot</span>
                  <span className="text-white">{SLOTS.find(s => s.id === slot)?.label} — {SLOTS.find(s => s.id === slot)?.hours}</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-white/10 pt-2 mt-2">
                  <span className="text-white/70">Total</span>
                  <span className="text-amber-400 text-lg">€{SLOTS.find(s => s.id === slot)?.price}</span>
                </div>
              </div>
              <p className="text-white/30 text-xs mb-5">Payment is only requested after your booking is reviewed and approved. No charge today.</p>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-black font-bold py-4 px-6 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-base"
              >
                {submitting ? 'Submitting…' : 'Submit Booking Request →'}
              </button>
            </section>
          )}
        </form>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-white/5 text-center text-white/20 text-sm">
          <p>Allusion · Ghent, Belgium</p>
          <p className="mt-1">Questions? Email {import.meta.env.VITE_ALLUSION_EMAIL || 'info@allusion.be'}</p>
        </footer>
      </main>
    </div>
  );
}
```

### ConfirmedPage.jsx

```jsx
import { useEffect, useState } from 'react';
import axios from 'axios';

export default function ConfirmedPage() {
  const [booking, setBooking] = useState(null);
  const id = new URLSearchParams(window.location.search).get('id');

  useEffect(() => {
    if (id) {
      axios.get(`/api/bookings/${id}`)
        .then(r => setBooking(r.data))
        .catch(() => {});
    }
  }, [id]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-10 max-w-md w-full text-center">
        <div className="text-6xl mb-6">🎉</div>
        <h1 className="text-3xl font-bold text-white mb-3">Booking Confirmed!</h1>
        <p className="text-white/50 text-lg mb-6">Your payment has been received. Check your email for the invoice and confirmation details.</p>
        {booking && (
          <div className="bg-white/5 rounded-xl p-4 text-left space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-white/40">Date</span><span className="text-white">{booking.date}</span></div>
            <div className="flex justify-between"><span className="text-white/40">Slot</span><span className="text-white capitalize">{booking.slot}</span></div>
            <div className="flex justify-between"><span className="text-white/40">Status</span><span className="text-green-400">✅ Paid</span></div>
          </div>
        )}
        <p className="text-white/20 text-xs mt-6 font-mono">Booking ID: {id}</p>
      </div>
    </div>
  );
}
```

---

## Task 10: Stripe Webhook Setup & Hermes Webhook Config

**Objective:** Enable the Hermes webhook platform and register the Stripe webhook with Stripe, so payment events trigger automated processing.

**Steps:**

1. Enable Hermes webhook platform in config:

```yaml
# Add to ~/.hermes/config.yaml under platforms:
platforms:
  webhook:
    enabled: true
    extra:
      host: "0.0.0.0"
      port: 8644
      secret: "allusion-hermes-webhook-secret"
```

2. Restart Hermes gateway:
```bash
hermes gateway run &
# or systemctl --user restart hermes-gateway
```

3. Register Stripe webhook subscription (for payment monitoring):
```bash
hermes webhook subscribe stripe-allusion-payments \
  --events "payment_intent.succeeded,checkout.session.completed,invoice.payment_succeeded" \
  --prompt "Stripe payment event received for Allusion booking system. Event type: {type}. Object ID: {data.object.id}. Metadata booking_id: {data.object.metadata.booking_id}. The booking server handles this automatically via its own /api/stripe/webhook route. Log this event and confirm it was processed." \
  --description "Allusion venue booking payment events"
```

4. Configure Stripe to send webhooks to the booking server:
   - In Stripe Dashboard → Developers → Webhooks → Add endpoint
   - URL: `https://your-domain.com/api/stripe/webhook`
   - Events: `payment_intent.succeeded`, `checkout.session.completed`, `invoice.payment_succeeded`
   - Copy the signing secret to STRIPE_WEBHOOK_SECRET in backend/.env

5. Configure Slack App (if not already done):
   - Create Slack App at https://api.slack.com/apps
   - Enable "Interactivity" → Set Request URL to `https://your-domain.com/api/slack/actions`
   - OAuth scopes: `chat:write`, `channels:read`, `channels:join`
   - Install to workspace and copy Bot Token to SLACK_BOT_TOKEN
   - Copy Signing Secret to SLACK_SIGNING_SECRET in backend/.env

---

## Task 11: PM2 Process Management + Build Script

**Objective:** Production-ready startup — build frontend, start backend with PM2, configure env.

**Files:**
- Create: `~/projects/allusion-booking/ecosystem.config.js`
- Create: `~/projects/allusion-booking/setup.sh`
- Create: `~/projects/allusion-booking/README.md`

### ecosystem.config.js

```javascript
module.exports = {
  apps: [{
    name: 'allusion-booking',
    script: 'backend/src/index.js',
    cwd: '/home/trader/projects/allusion-booking',
    env_file: 'backend/.env',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    log_file: 'logs/combined.log',
    time: true,
  }],
};
```

### setup.sh

```bash
#!/usr/bin/env bash
set -e

echo "=== Allusion Booking System Setup ==="
cd ~/projects/allusion-booking

# Install deps
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# Build frontend
cd frontend && npm run build && cd ..

# Create logs dir
mkdir -p logs

# Copy env if missing
if [ ! -f backend/.env ]; then
  cp .env.example backend/.env
  echo "Created backend/.env from .env.example — please fill in your credentials!"
fi

echo "=== Setup Complete ==="
echo "Edit backend/.env with your credentials, then run:"
echo "  npx pm2 start ecosystem.config.js"
echo "  npx pm2 save"
echo "  npx pm2 startup"
```

### README.md

```markdown
# Allusion Venue Booking System

Fully automated venue booking system for Allusion, Ghent.

## Architecture

- React SPA (dark, elegant booking page)
- Node.js/Express API
- Google Calendar for availability + event management
- Slack for approval workflow (approve/reject/follow-up buttons)
- Stripe for payment links + webhook processing
- Gmail (via Google OAuth2) for all transactional emails
- Odoo for accounting/invoice sync

## Quick Start

1. Copy .env.example to backend/.env and fill in all values
2. Run: bash setup.sh
3. Start: npx pm2 start ecosystem.config.js

## Required Credentials

### Slack
- Create Slack App: https://api.slack.com/apps
- Scopes: chat:write, channels:read
- Set Interactivity URL: https://your-domain.com/api/slack/actions
- Copy SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET

### Stripe
- Add webhook endpoint in Stripe Dashboard: https://your-domain.com/api/stripe/webhook
- Events: payment_intent.succeeded, checkout.session.completed
- Copy webhook signing secret to STRIPE_WEBHOOK_SECRET

### Google (already configured via Hermes)
- Token at ~/.hermes/google_token.json
- Credentials at ~/.hermes/google_client_secret.json

## Booking Flow

1. Customer visits booking page and submits request
2. Slack notification sent to #venue-bookings with approve/reject/meeting buttons
3. Allusion clicks approve → payment link sent to customer
4. Customer pays → Stripe webhook fires
5. Invoice emailed to customer
6. Invoice synced to Odoo
7. Slack updated with paid confirmation
```

---

## Task 12: End-to-End Test Run

**Objective:** Verify the full system works end-to-end.

**Steps:**

```bash
# 1. Start backend in dev mode
cd ~/projects/allusion-booking/backend
cp ../.env.example .env  # fill in real values first
npm run dev &

# 2. Start frontend in dev mode
cd ../frontend
npm run dev &

# 3. Test availability endpoint
curl "http://localhost:3001/api/availability?date=2026-05-01"
# Expected: {"date":"2026-05-01","available":["morning","afternoon","evening"],"unavailable":[]}

# 4. Submit a test booking
curl -X POST http://localhost:3001/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-05-01","slot":"evening","name":"Test User","email":"test@example.com","guests":10,"message":"Test booking"}'
# Expected: {"id":"...","message":"Booking request submitted..."}

# 5. Check Slack for notification with action buttons
# 6. Click Approve in Slack → check email for payment link
# 7. Complete test payment in Stripe
# 8. Verify invoice email arrives
# 9. Check Slack for paid confirmation
# 10. Verify Odoo has the invoice

# 4b. Test Stripe webhook locally with Stripe CLI
stripe listen --forward-to localhost:3001/api/stripe/webhook &
stripe trigger payment_intent.succeeded
```

**Verification checklist:**
- [ ] GET /api/availability returns correct slots
- [ ] POST /api/bookings creates DB record + calendar event + Slack message
- [ ] Clicking Approve in Slack sends payment email
- [ ] Clicking Reject removes calendar event
- [ ] Clicking Follow-up sends meeting email to both parties
- [ ] Stripe webhook marks booking paid
- [ ] Invoice email arrives with PDF link
- [ ] Booking confirmed page shows correct status
- [ ] Odoo has partner + invoice created

---

## Summary of External Setup Required (by Allusion)

Before the system goes live, Allusion must:

1. **Slack App** — Create at https://api.slack.com/apps
   - Enable Interactivity + set Request URL
   - Install to workspace
   - Set SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET in .env

2. **Stripe Webhook** — Register in Stripe Dashboard
   - Set STRIPE_WEBHOOK_SECRET in .env

3. **Odoo** — Fill in ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD

4. **Google Calendar write access** — Grant oc.al.assistant@gmail.com "Make changes to events" on the #3 Venue Rental calendar

5. **Domain/hosting** — Deploy backend to a server with a public URL for Slack + Stripe callbacks

6. **ALLUSION_EMAIL, ALLUSION_TEAM_EMAILS** — Set real email addresses in .env
```
