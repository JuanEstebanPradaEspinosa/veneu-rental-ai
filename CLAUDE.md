# CLAUDE.md — Allusion Venue Rental

## What this project is
Automated venue rental website for Allusion (Gent). Visitors request bookings through an embedded Tally form, one human reviews in Slack, everything else is automated via Relay.app. Near-zero manual work is the core constraint.

## Stack
- **React + Vite** — the website (you own this)
- **Tally** — booking request form (embed or link)
- **Stripe** — payment links sent after approval
- **Relay.app** — automation pipeline (Tally -> Slack -> email -> Stripe)
- **Odoo** — CRM, calendar, invoicing
- **Slack** — human review touchpoint (approve / reject / request meeting)

---

## Booking flow

```
Visitor -> React site -> Tally form -> Relay.app -> Stripe  handles everything after submission
```

### Full lifecycle (reference — Relay.app implements steps 3-8)

1. **Customer visits site** — browses the space, checks availability calendar
2. **Customer submits booking request** — fills out embedded Tally form
3. **Notification sent** — Relay.app sends the request to Slack + email to Allusion team
4. **Pending approval** — request sits in pending state until Allusion reviews
5. **Allusion reviews** — three possible outcomes:
   - **Approve** -> confirmation email sent to customer
   - **Request meeting** -> Google Meet / Zoom link sent by email to gather more details before deciding
   - **Reject** -> rejection email sent to customer
6. **After approval** — Stripe payment link sent to customer
7. **Customer pays** — completes payment via Stripe link
8. **Payment confirmed** — confirmation/update message posted to Slack
9. **Store surpase the booking* - After payment the calender needs to be updated and booking should be stored

### What the React site is responsible for
- Showcase the space (photos, description, pricing, amenities)
- Display availability (calendar showing open/blocked dates)
- Get the visitor to submit the Tally form (embed or link)
- Show booking states if needed (confirmation page, pending message)

### What Relay.app handles (do NOT reimplement)
- Tally form submission processing
- Slack notifications and approval routing
- Email notifications (confirmation, rejection, meeting requests)
- Stripe payment link generation and sending
- Payment confirmation notifications

---

## Booking states

| State | Trigger | Owner |
|---|---|---|
| `browsing` | Customer visits site | React site |
| `form_submitted` | Tally form completed | React site -> Relay.app |
| `pending_review` | Request arrives in Slack | Relay.app |
| `meeting_requested` | Allusion wants to meet first | Relay.app |
| `approved` | Allusion approves in Slack | Relay.app |
| `rejected` | Allusion rejects in Slack | Relay.app |
| `payment_sent` | Stripe link emailed to customer | Relay.app |
| `paid` | Customer completes Stripe payment | Relay.app |
| `confirmed` | Payment verified, Slack notified | Relay.app |

The React site only needs to handle `browsing` and `form_submitted`. Everything else happens outside the site.

---

## Skills — read these before writing code

| Task | Skill to read first |
|---|---|
| Building any UI component, page, or layout | `/mnt/skills/public/frontend-design/SKILL.md` |
| Reviewing UI for accessibility, UX, and best practices | `/mnt/skills/public/web-design-guidelines/SKILL.md` |
| Stripe integration (payment pages, checkout, webhooks) | `/mnt/skills/user/stripe-integration/SKILL.md` |
| React components, hooks, and rendering patterns | `/mnt/skills/public/react-expert/SKILL.md` |
| React/Next.js performance optimization | `/mnt/skills/public/vercel-react-best-practices/SKILL.md` |
| React composition and component API design | `/mnt/skills/public/vercel-composition-patterns/SKILL.md` |
| Page transitions and animations | `/mnt/skills/public/vercel-react-view-transitions/SKILL.md` |
| Deploying to Vercel | `/mnt/skills/public/deploy-to-vercel/SKILL.md` |
| Supabase (database, auth, storage, realtime) | `/mnt/skills/public/supabase/SKILL.md` |
| Writing clear code documentation | `/mnt/skills/public/documentation-writer/SKILL.md` |
| Explaining code with diagrams | `/mnt/skills/public/explain-code/SKILL.md` |

**How to use a skill:** call `read /mnt/skills/...SKILL.md` at the start of the relevant task. Follow its instructions exactly.

---

## What you CAN do
- Build and modify all React components and pages
- Add, update, or remove routes and UI logic
- Set up Vite config, Tailwind, and frontend tooling
- Embed the Tally form (`https://tally.so/widgets/embed.js`)
- Build an availability calendar using FullCalendar (already installed)
- Read blocked dates from Odoo API to show availability
- Follow the frontend-design skill for visual quality
- Create post-submission pages (thank you, pending confirmation)
- Update this CLAUDE.md when the stack or constraints change

## What you CANNOT do
- Touch Relay.app workflows — automation is handled externally
- Touch Tally form fields or structure — form is configured in Tally directly
- Add user accounts, login, or an admin dashboard — not needed
- Implement the approval/rejection flow — that lives in Relay.app + Slack
- Generate or handle Stripe payment links — Relay.app sends those
- Expose any secret keys in the frontend
- Add any feature that creates recurring manual work for the Allusion team

---

## Blocked dates (never bookable)
- Weekly drawing class (recurring)
- Monthly ICP Belgium event (recurring)

---

## Architecture decisions
- **No backend** — the React site is purely frontend; all server-side logic lives in Relay.app and booking data in surepase 
- **Tally over custom forms** — less code to maintain, Relay.app integrates directly
- **Stripe via Relay.app** — payment links are generated and sent by the automation pipeline, not the website
