const express = require('express');
const router = express.Router();
const { getAvailableSlots, getOccupiedSlotsByMonth } = require('../services/calendar');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/bookings.db');
const ALL_SLOTS = ['morning', 'afternoon', 'evening'];

// GET /api/availability/month?year=2026&month=5
// Returns per-day slot availability for a full month — sourced from DB (fast, no Calendar API).
// Response: { year, month, days: { "2026-05-03": { available: [...], unavailable: [...] }, ... } }
router.get('/month', async (req, res) => {
  try {
    const year  = parseInt(req.query.year,  10);
    const month = parseInt(req.query.month, 10); // 1-based

    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Provide valid year and month (1-12).' });
    }

    // Build date range for the month
    const pad    = n => String(n).padStart(2, '0');
    const from   = `${year}-${pad(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to     = `${year}-${pad(month)}-${pad(lastDay)}`;

    // Fetch occupied slots from two independent sources in parallel:
    //   1. Bookings DB  — pending/approved/awaiting_payment/paid bookings
    //   2. Google Calendar — includes manual blocks (maintenance, holds, personal events)
    const [dbRows, calOccupied] = await Promise.all([
      (() => {
        const db   = new Database(DB_PATH, { readonly: true });
        const rows = db.prepare(
          `SELECT date, slot FROM bookings
           WHERE date >= ? AND date <= ?
             AND status NOT IN ('rejected','cancelled')
           ORDER BY date`
        ).all(from, to);
        db.close();
        return rows;
      })(),
      getOccupiedSlotsByMonth(year, month),
    ]);

    // Build occupied map from DB
    const dbOccupied = {};
    for (const { date: d, slot } of dbRows) {
      if (!dbOccupied[d]) dbOccupied[d] = new Set();
      dbOccupied[d].add(slot);
    }

    // Build response — union of DB + Calendar occupied slots for each day
    const todayDate  = new Date();
    const today  = todayDate.toISOString().split('T')[0];
    // Dates within 3 days of today are blocked regardless of calendar state
    const cutoff = new Date(todayDate);
    cutoff.setDate(cutoff.getDate() + 3);
    const cutoffStr = cutoff.toISOString().split('T')[0]; // first bookable date (exclusive of today+0..+2)

    const days   = {};
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${pad(month)}-${pad(d)}`;

      // Past dates and dates within the 3-day lead-time buffer are fully unavailable
      if (dateStr < cutoffStr) {
        days[dateStr] = { available: [], unavailable: ALL_SLOTS };
        continue;
      }

      // Merge: start with calendar-occupied slots, add DB-occupied slots
      const merged = new Set([
        ...(calOccupied[dateStr] || []),
        ...(dbOccupied[dateStr]  ? [...dbOccupied[dateStr]] : []),
      ]);

      const unavailable = dateStr < today ? ALL_SLOTS : ALL_SLOTS.filter(s => merged.has(s));
      const available   = dateStr < today ? []         : ALL_SLOTS.filter(s => !merged.has(s));
      days[dateStr] = { available, unavailable };
    }

    res.json({ year, month, days });
  } catch (err) {
    console.error('[Availability/month]', err);
    res.status(500).json({ error: 'Failed to fetch monthly availability' });
  }
});

// GET /api/availability?date=2026-05-01
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
    }

    const todayDate = new Date();
    const today = todayDate.toISOString().split('T')[0];
    const cutoff = new Date(todayDate);
    cutoff.setDate(cutoff.getDate() + 3);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    // Reject past dates and dates within the 3-day lead-time buffer
    if (date < cutoffStr) {
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
