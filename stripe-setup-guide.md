# Stripe Webhook Setup Guide for Allusion Booking System

## Step 1: Register Webhook Endpoint

1. Go to https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Endpoint URL: https://YOUR_DOMAIN/api/stripe/webhook
4. Select events:
   - payment_intent.succeeded
   - checkout.session.completed
   - invoice.payment_succeeded
5. Click "Add endpoint"

## Step 2: Copy Signing Secret

1. Click on the newly created webhook endpoint
2. Under "Signing secret", click "Reveal"
3. Copy the value (starts with whsec_)
4. Add it to backend/.env as STRIPE_WEBHOOK_SECRET

## Step 3: Test Locally (Optional)

If testing locally before deploying:
```bash
# Install Stripe CLI
npm install -g stripe-cli

# Forward webhooks to local server
stripe listen --forward-to localhost:3001/api/stripe/webhook

# In another terminal, trigger a test event
stripe trigger payment_intent.succeeded
```

## Existing Stripe Resources (already configured in .env)

- Price €250 (Morning/Afternoon): price_1TMnIH8xOvs4P5fvn5jc0IQ4
- Price €350 (Evening): price_1TMnIJ8xOvs4P5fvUbh80CCi
- Currently in TEST MODE - switch STRIPE_SECRET_KEY to live key for production
