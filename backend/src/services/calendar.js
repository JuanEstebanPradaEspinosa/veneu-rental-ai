const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const SLOT_DEFINITIONS = {
  morning:   { label: 'Morning',   start: '09:00', end: '13:00' },
  afternoon: { label: 'Afternoon', start: '13:00', end: '17:00' },
  evening:   { label: 'Evening',   start: '18:00', end: '22:00' },
};

const TIMEZONE = 'Europe/Brussels';

function getCalendarId() {
  return process.env.VENUE_CALENDAR_ID || 'c_c1cb22c487334781ff941640afae38f88ec1bd686aa468f6822bef1fb8a57e99@group.calendar.google.com';
}

function getAuth() {
  const tokenPath = process.env.GOOGLE_TOKEN_PATH || '/home/trader/.hermes/google_token.json';
  const token = JSON.parse(fs.readFileSync(tokenPath));

  let clientId, clientSecret;
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH;
  if (credPath && fs.existsSync(credPath)) {
    const creds = JSON.parse(fs.readFileSync(credPath));
    const info = creds.installed || creds.web;
    clientId = info.client_id;
    clientSecret = info.client_secret;
  } else {
    clientId = token.client_id || process.env.GOOGLE_CLIENT_ID;
    clientSecret = token.client_secret || process.env.GOOGLE_CLIENT_SECRET;
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials(token);

  auth.on('tokens', (newTokens) => {
    const existing = JSON.parse(fs.readFileSync(tokenPath));
    fs.writeFileSync(tokenPath, JSON.stringify({ ...existing, ...newTokens }, null, 2));
  });

  return auth;
}

async function getOccupiedSlots(date) {
  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });

  const timeMin = new Date(`${date}T00:00:00+02:00`).toISOString();
  const timeMax = new Date(`${date}T23:59:59+02:00`).toISOString();

  const res = await calendar.events.list({
    calendarId: getCalendarId(),
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items || [];
  const occupied = [];

  for (const slot of Object.keys(SLOT_DEFINITIONS)) {
    const slotDef = SLOT_DEFINITIONS[slot];
    const slotStart = new Date(`${date}T${slotDef.start}:00+02:00`);
    const slotEnd   = new Date(`${date}T${slotDef.end}:00+02:00`);

    const conflict = events.some(ev => {
      const evStart = new Date(ev.start.dateTime || ev.start.date);
      const evEnd   = new Date(ev.end.dateTime || ev.end.date);
      return evStart < slotEnd && evEnd > slotStart;
    });

    if (conflict) occupied.push(slot);
  }

  return occupied;
}

async function getAvailableSlots(date) {
  const occupied = await getOccupiedSlots(date);
  return Object.keys(SLOT_DEFINITIONS).filter(s => !occupied.includes(s));
}

// Fetch all calendar events for an entire month in a single API call,
// then return a map of { "YYYY-MM-DD": ["morning","evening", ...] } for
// every day that has at least one conflicting event.
// This includes manual blocks (maintenance, holds) not tracked in the DB.
async function getOccupiedSlotsByMonth(year, month) {
  const auth     = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });
  const pad      = n => String(n).padStart(2, '0');

  // Full month window in Brussels time (+02:00 summer, +01:00 winter — use +01:00
  // conservatively so we never miss events near midnight)
  const timeMin = new Date(`${year}-${pad(month)}-01T00:00:00+01:00`).toISOString();
  const lastDay = new Date(year, month, 0).getDate();
  const timeMax = new Date(`${year}-${pad(month)}-${pad(lastDay)}T23:59:59+01:00`).toISOString();

  let allEvents = [];
  let pageToken;
  do {
    const res = await calendar.events.list({
      calendarId:   getCalendarId(),
      timeMin,
      timeMax,
      singleEvents: true,
      maxResults:   250,
      pageToken,
    });
    allEvents = allEvents.concat(res.data.items || []);
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  // For each day in the month, check which slots conflict with any event
  const result = {};
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${pad(month)}-${pad(d)}`;
    const occupied = [];

    for (const [slotId, slotDef] of Object.entries(SLOT_DEFINITIONS)) {
      const slotStart = new Date(`${dateStr}T${slotDef.start}:00+02:00`);
      const slotEnd   = new Date(`${dateStr}T${slotDef.end}:00+02:00`);

      const conflict = allEvents.some(ev => {
        // All-day events (ev.start.date, no dateTime) block the entire day
        if (ev.start.date && !ev.start.dateTime) {
          return ev.start.date <= dateStr && ev.end.date > dateStr;
        }
        const evStart = new Date(ev.start.dateTime);
        const evEnd   = new Date(ev.end.dateTime);
        return evStart < slotEnd && evEnd > slotStart;
      });

      if (conflict) occupied.push(slotId);
    }

    if (occupied.length > 0) result[dateStr] = occupied;
  }

  return result; // { "2026-05-10": ["morning","afternoon"], ... }
}

async function createCalendarEvent(booking) {
  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });
  const slotDef = SLOT_DEFINITIONS[booking.slot];

  const event = {
    summary: `[PENDING] ${booking.name} — ${slotDef.label} Slot`,
    description: `Booking ID: ${booking.id}\nOrganization: ${booking.organization || 'N/A'}\nGuests: ${booking.guests}\nMessage: ${booking.message || 'N/A'}\nEmail: ${booking.email}\nPhone: ${booking.phone || 'N/A'}`,
    start: { dateTime: `${booking.date}T${slotDef.start}:00`, timeZone: TIMEZONE },
    end:   { dateTime: `${booking.date}T${slotDef.end}:00`, timeZone: TIMEZONE },
    colorId: '5',
    status: 'tentative',
  };

  const res = await calendar.events.insert({ calendarId: getCalendarId(), requestBody: event });
  return res.data.id;
}

async function confirmCalendarEvent(eventId, bookingName, slot) {
  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });
  const slotDef = SLOT_DEFINITIONS[slot];

  await calendar.events.patch({
    calendarId: getCalendarId(),
    eventId,
    requestBody: {
      summary: `\u2705 CONFIRMED: ${bookingName} — ${slotDef.label} Slot`,
      colorId: '2',
      status: 'confirmed',
    },
  });
}

async function deleteCalendarEvent(eventId) {
  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });
  try {
    await calendar.events.delete({ calendarId: getCalendarId(), eventId });
  } catch (e) {
    if (e.code !== 410) throw e;
  }
}

module.exports = { getAvailableSlots, getOccupiedSlots, getOccupiedSlotsByMonth, createCalendarEvent, confirmCalendarEvent, deleteCalendarEvent, SLOT_DEFINITIONS };
