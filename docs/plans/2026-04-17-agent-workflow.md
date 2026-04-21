# Allusion Booking — Agent Workflow Design

## The Core Idea

Hermes runs as a Slack bot in #venue-bookings.
When a booking arrives, Hermes posts a rich notification.
Allusion responds in the thread — in plain language.
Hermes reads it, decides what to do, and handles everything.

No buttons. No forms. Just conversation.

---

## What Allusion Says → What Hermes Does

```
"approve"                    → create Stripe link → email customer → confirm calendar
"approve and add a note"     → approve + send custom note in payment email
"reject"                     → delete calendar event → notify customer (optional)
"reject, venue not available"→ reject + send custom rejection email with reason
"ask them about catering"    → draft + send email to customer with the question
"request follow-up"          → send follow-up meeting email to customer + team
"what did they write?"       → quote back booking.message from DB
"how many guests?"           → report booking.guests from DB
"is June 5 morning free?"    → check calendar availability → report back
"what bookings do we have this month?" → query DB → formatted summary
"move to July 10 evening"    → check if free → if yes: update DB + calendar
"show all pending"           → list all pending bookings with details
"send them our venue brochure" → email customer with brochure attachment
"approve all from this week" → batch approve multiple pending bookings
```

---

## System Architecture

```
Customer fills booking form (React page)
         ↓
Express API creates DB record
         ↓
Express API calls Google Calendar → tentative event
         ↓
Express API calls Hermes via HTTP (internal notify endpoint)
         ↓
Hermes posts rich booking card to #venue-bookings
         ↓
Allusion replies in thread
         ↓
Hermes (Slack bot, Socket Mode) receives the reply
         ↓
Hermes interprets intent (full LLM reasoning)
         ↓
Hermes calls booking system tools:
  - approve_booking(booking_id)
  - reject_booking(booking_id, reason?)
  - send_email_to_customer(booking_id, subject, body)
  - request_followup(booking_id)
  - check_availability(date)
  - get_booking(booking_id)
  - list_bookings(status?, date_range?)
         ↓
Hermes replies in thread with outcome
```

---

## Key Design Decisions

### 1. Hermes is the agent, not just a router

The old design: Allusion clicks buttons → Express handles it.
The new design: Allusion talks → Hermes understands → Hermes calls Express.

Hermes has LLM reasoning. It can handle ambiguity, ask clarifying questions,
batch multiple bookings, understand "the last one" referring to context.

### 2. The #venue-bookings channel has a specialized system prompt

Via channel_prompts in config.yaml, Hermes knows in this channel:
- It is the Allusion venue booking manager
- It has access to booking tools
- It should always thread replies to the relevant booking message
- It understands the venue, slots, prices, and workflows

### 3. Booking tools are exposed as MCP tools OR as HTTP endpoints

Two options:
  A. Add a local MCP server for the booking system (cleanest)
  B. Hermes calls the Express API via HTTP using its terminal/web tools

Option B is faster to implement and works with existing infrastructure.
Hermes can use terminal tool: curl http://localhost:3001/api/...

### 4. Notification format changed

Instead of Slack Block Kit buttons (which bypass Hermes), the booking
notification is now a clean informational card. Hermes reads it for context.
The thread is where everything happens.

### 5. Booking ID threading

Every notification includes the booking ID prominently.
Hermes extracts it from context when Allusion says "approve" or "reject".
No need for Allusion to repeat the ID.

---

## The Booking Notification Card (new format)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏛️  NEW BOOKING REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤  Sophie Declercq
📧  sophie@eventco.be
📞  +32 477 123 456
🏢  EventCo Ghent

📅  Thursday, May 15, 2026
🌙  Evening Slot · 18:00 – 22:00
👥  45 guests
💶  €350

📝  "Private corporate dinner and product launch.
     We'll need AV setup and catering tables."

🆔  e0a175d1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reply in this thread to manage the booking.
Type "approve", "reject", or ask me anything about it.
```

---

## Hermes Channel Prompt (for #venue-bookings)

```
You are the Allusion venue booking manager for Allusion in Ghent, Belgium.

VENUE DETAILS:
- Allusion Venue, located in Ghent, Belgium
- 3 daily slots: Morning (09:00-13:00, €250), Afternoon (13:00-17:00, €250), Evening (18:00-22:00, €350)
- Bookings require approval before payment is requested

YOUR JOB:
When Allusion (the venue owner) replies to a booking notification in this channel,
you interpret their intent and take action immediately by calling the booking system.

AVAILABLE ACTIONS (call via curl to localhost:3001):
- Approve: POST /api/agent/approve {"booking_id": "...", "note": "optional custom note"}
- Reject: POST /api/agent/reject {"booking_id": "...", "reason": "optional reason to send"}
- Follow-up meeting: POST /api/agent/followup {"booking_id": "..."}
- Email customer: POST /api/agent/email {"booking_id": "...", "subject": "...", "body": "..."}
- Get booking: GET /api/bookings/:id
- List bookings: GET /api/agent/bookings?status=pending
- Check availability: GET /api/availability?date=YYYY-MM-DD

BEHAVIOR RULES:
1. Always reply in the thread of the booking you're managing
2. Extract booking_id from the message context (it's in the 🆔 field)
3. Confirm every action with a brief summary after doing it
4. If the request is ambiguous, ask one clarifying question
5. For approvals, always mention the payment link was sent and to which email
6. For rejections, ask if they want to send a reason to the customer
7. Be concise — this is a working channel, not a chat
8. If asked about bookings in general (not a specific thread), query the DB and summarize
```

---

## New Express Endpoints Needed

```
POST /api/agent/approve
  body: { booking_id, note? }
  → marks approved, creates Stripe link, sends payment email (with optional note), confirms calendar

POST /api/agent/reject
  body: { booking_id, reason? }
  → marks rejected, deletes calendar event, optionally emails customer with reason

POST /api/agent/followup
  body: { booking_id }
  → sends follow-up meeting email to customer + team

POST /api/agent/email
  body: { booking_id, subject, body }
  → sends freeform email to the booking's customer

GET /api/agent/bookings
  query: status?, date_from?, date_to?
  → returns list of bookings with full details

These endpoints are internal-only (no auth required on localhost, 
but add a simple bearer token for production)
```

---

## Implementation Tasks

### Task A: Add /api/agent/* endpoints to Express backend
  - approve, reject, followup, email, list-bookings routes
  - All in a single file: backend/src/routes/agent.js

### Task B: Update booking notification to conversational card format
  - Remove Slack Block Kit buttons from slack.js service
  - New clean text card with booking ID and "reply to manage" instruction

### Task C: Configure Hermes Slack integration
  - Add SLACK_BOT_TOKEN and SLACK_APP_TOKEN to ~/.hermes/.env
  - Add channel_prompts for #venue-bookings channel ID in config.yaml
  - Start Hermes gateway

### Task D: Update backend to notify Hermes via internal endpoint
  - When booking is submitted, call Hermes send-message API OR
  - Hermes Slack bot sees the message naturally since it's in the channel

### Task E: Test the full conversational flow
  - Submit booking → see card in Slack → reply "approve" → verify email sent
  - Reply "reject, not available that weekend" → verify calendar deleted + email
  - Reply "what did they write in their message?" → verify Hermes quotes it back
  - Reply "is June 5 morning free?" → verify availability check
