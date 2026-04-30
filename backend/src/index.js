require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { frontendUrl } = require('./config/site');

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_DIST = path.join(__dirname, '../../frontend/dist');

// ── Stripe webhook: mount FIRST, needs raw body ──────────────────────
const stripeWebhookRouter = require('./routes/stripe-webhook');
app.use('/api/stripe', stripeWebhookRouter);

// ── Standard middleware ────────────────────────────────────────────────────────────────────────────
app.use(cors({ origin: frontendUrl || '*' }));

// express.json with verify to capture rawBody for Slack signature verification
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString(); },
}));

// Also capture raw body for URL-encoded (Slack actions)
app.use(express.urlencoded({
  extended: true,
  verify: (req, res, buf) => { req.rawBody = buf.toString(); },
}));

// ── API Routes ────────────────────────────────────────────────────────
const availabilityRouter = require('./routes/availability');
const bookingsRouter = require('./routes/bookings');
const slackActionsRouter = require('./routes/slack-actions');
const agentRouter = require('./routes/agent');

app.use('/api/availability', availabilityRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/slack', slackActionsRouter);
app.use('/api/agent', agentRouter);

// ── Health check ─────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── Serve React frontend (production) ────────────────────────────────
const fs = require('fs');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[Allusion Booking] Server running on http://127.0.0.1:${PORT}`);
});
