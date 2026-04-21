const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getAvailableSlots, createCalendarEvent, SLOT_DEFINITIONS } = require('../services/calendar');
const { postBookingRequest } = require('../services/slack');
const { createBooking, updateBooking, getBookingById, appendAuditLog } = require('../db');
const { generateICS } = require('../services/ics');

// POST /api/bookings
router.post('/', async (req, res) => {
  try {
    const { date, slot, name, email, phone, organization, message, guests } = req.body;

    if (!date || !slot || !name || !email) {
      return res.status(400).json({ error: 'Missing required fields: date, slot, name, email' });
    }
    if (!['morning', 'afternoon', 'evening'].includes(slot)) {
      return res.status(400).json({ error: 'Invalid slot' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

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

    const saved = createBooking(booking);
    appendAuditLog(booking.id, 'BOOKING_CREATED', 'customer', `Submitted from ${req.ip}`);

    let calendarEventId = null;
    try {
      calendarEventId = await createCalendarEvent(booking);
      updateBooking(booking.id, { calendar_event_id: calendarEventId });
    } catch (calErr) {
      console.error('[Calendar] Failed to create event:', calErr.message);
    }

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

// GET /api/bookings/:id
router.get('/:id', async (req, res) => {
  const booking = getBookingById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const { id, date, slot, name, status, created_at } = booking;
  res.json({ id, date, slot, name, status, created_at });
});

// GET /api/bookings/:id/calendar.ics
// Returns a downloadable .ics calendar event for confirmed/paid bookings.
// Works with Apple Calendar, Outlook, Google Calendar (import), and any RFC 5545 client.
router.get('/:id/calendar.ics', (req, res) => {
  const booking = getBookingById(req.params.id);
  if (!booking) return res.status(404).send('Booking not found');

  // Only serve ICS for confirmed (awaiting_payment or paid) bookings
  if (!['awaiting_payment', 'approved', 'paid'].includes(booking.status)) {
    return res.status(403).send('Calendar file is only available for confirmed bookings');
  }

  try {
    const ics = generateICS(booking);
    const filename = `allusion-venue-${booking.date}-${booking.slot}.ics`;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(ics);
  } catch (err) {
    console.error('[ICS]', err.message);
    res.status(500).send('Failed to generate calendar file');
  }
});

module.exports = router;
