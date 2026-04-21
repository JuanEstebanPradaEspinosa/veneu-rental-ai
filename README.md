# Allusion Venue Booking System

Fully automated AI-powered venue booking system for Allusion in Ghent.
Bookings flow from a single shareable URL through approval, payment, and accounting — with minimal human interaction.

## How It Works

1. **Customer visits the booking page** → selects date, slot, fills in details → submits
2. **Allusion receives a Slack notification** with booking details and 3 action buttons:
   - ✅ Approve → automatically sends a Stripe payment link to the customer
   - ❌ Reject → removes the tentative calendar event, closes the request
   - 📅 Follow-up Meeting → sends meeting proposal emails to both parties
3. **Customer pays** via the Stripe payment link
4. **System automatically:**
   - Confirms the Google Calendar event
   - Emails the paid invoice to the customer
   - Syncs the invoice to Odoo
   - Sends a Slack confirmation

## Architecture

```
React SPA (Vite + Tailwind)  ←→  Express API (Node.js)
                                       ├── Google Calendar API (availability + events)
                                       ├── Slack Block Kit (approval + notifications)
                                       ├── Stripe (payment links + webhooks)
                                       ├── Gmail OAuth2 (transactional emails)
                                       ├── Odoo XML-RPC (invoice sync)
                                       └── SQLite (booking state machine)
```

## Booking Slots

| Slot      | Hours         | Price |
|-----------|---------------|-------|
| Morning   | 09:00 – 13:00 | €250  |
| Afternoon | 13:00 – 17:00 | €250  |
| Evening   | 18:00 – 22:00 | €350  |

## Quick Start

```bash
# 1. Clone / copy to server
git clone ... && cd allusion-booking

# 2. Run setup script
bash setup.sh

# 3. Edit credentials
nano backend/.env

# 4. Start with PM2
npx pm2 start ecosystem.config.js
npx pm2 save && npx pm2 startup
```

The booking page will be available at `http://localhost:3001` (or your configured domain).

## Required Credentials (backend/.env)

### Google (already configured)
- `GOOGLE_TOKEN_PATH` — path to ~/.hermes/google_token.json (pre-authenticated)
- `GOOGLE_CREDENTIALS_PATH` — path to OAuth client credentials JSON
- `VENUE_CALENDAR_ID` — your Google Calendar ID for availability checking
- `GMAIL_USER` — Gmail address for sending emails

### Slack
See `slack-setup-guide.md` for step-by-step instructions.
- `SLACK_BOT_TOKEN` — Bot User OAuth Token (xoxb-...)
- `SLACK_SIGNING_SECRET` — App signing secret
- `SLACK_APPROVAL_CHANNEL` — Channel to post booking requests (e.g. #venue-bookings)

### Stripe
See `stripe-setup-guide.md` for step-by-step instructions.
- `STRIPE_SECRET_KEY` — Secret key (rk_test_... for test, sk_live_... for production)
- `STRIPE_WEBHOOK_SECRET` — Webhook endpoint signing secret (whsec_...)

### Odoo
- `ODOO_URL` — Your Odoo instance URL
- `ODOO_DB` — Database name
- `ODOO_USERNAME` — Admin username
- `ODOO_PASSWORD` — Admin password

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |
| GET | /api/availability?date=YYYY-MM-DD | Get available slots |
| POST | /api/bookings | Submit booking request |
| GET | /api/bookings/:id | Get booking status |
| POST | /api/slack/actions | Slack interactive actions |
| POST | /api/stripe/webhook | Stripe webhook events |

## Development

```bash
# Backend (port 3001)
cd backend && npm run dev

# Frontend (port 5173, proxied to backend)
cd frontend && npm run dev

# Test webhook locally
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

## Booking Status Flow

```
pending → approved → awaiting_payment → paid
        ↘ rejected
        ↘ cancelled
```

## Files

```
allusion-booking/
├── backend/
│   ├── src/
│   │   ├── index.js          # Express server
│   │   ├── routes/
│   │   │   ├── availability.js
│   │   │   ├── bookings.js
│   │   │   ├── slack-actions.js
│   │   │   └── stripe-webhook.js
│   │   ├── services/
│   │   │   ├── calendar.js   # Google Calendar
│   │   │   ├── email.js      # Gmail OAuth2
│   │   │   ├── odoo.js       # Odoo XML-RPC
│   │   │   ├── slack.js      # Slack Block Kit
│   │   │   └── stripe.js     # Stripe payments
│   │   └── db/
│   │       ├── index.js      # SQLite queries
│   │       └── schema.js     # Table definitions
│   ├── data/
│   │   └── bookings.db       # SQLite database
│   └── .env                  # Environment variables
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── BookingPage.jsx
│   │   └── ConfirmedPage.jsx
│   └── dist/                 # Built static files
├── docs/plans/               # Implementation plan
├── ecosystem.config.js       # PM2 config
├── setup.sh                  # Setup script
├── slack-setup-guide.md      # Slack configuration guide
└── stripe-setup-guide.md     # Stripe configuration guide
```

## Accounting / Odoo Integration

When a booking is paid via Stripe:
1. The system authenticates with Odoo via XML-RPC
2. Finds or creates a customer partner record (by email)
3. Creates a posted (confirmed) out_invoice
4. Invoice line: venue name + slot name + amount

Odoo sync is non-blocking — if it fails, the booking is still marked paid and the invoice email is still sent.
