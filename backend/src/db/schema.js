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
