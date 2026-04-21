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

module.exports = { createBooking, getBookingById, updateBooking, getBookingsByDate, appendAuditLog, getDb };
