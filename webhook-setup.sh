#!/usr/bin/env bash
# Run this script once after Hermes gateway is started to register the Stripe payment monitoring subscription

hermes webhook subscribe stripe-allusion-payments \
  --events "payment_intent.succeeded,checkout.session.completed,invoice.payment_succeeded" \
  --prompt "Stripe payment event for Allusion booking system received. Event type: {type}. Object ID: {data.object.id}. Booking ID from metadata: {data.object.metadata.booking_id}. The booking server at port 3001 handles processing automatically via /api/stripe/webhook. This subscription is for monitoring only — log that this event was received and confirm it was dispatched to the booking server." \
  --description "Allusion venue booking payment events monitoring"

echo "Webhook subscription created."
echo "Next steps:"
echo "  1. Start gateway: hermes gateway run"
echo "  2. Register webhook URL in Stripe Dashboard:"
echo "     URL: https://YOUR_DOMAIN/api/stripe/webhook"
echo "     Events: payment_intent.succeeded, checkout.session.completed"
echo "  3. Copy the webhook signing secret to backend/.env as STRIPE_WEBHOOK_SECRET"
