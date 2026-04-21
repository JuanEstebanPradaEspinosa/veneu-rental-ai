/**
 * ICS (iCalendar) generation — RFC 5545 compliant .ics files
 *
 * Generates calendar event files that work with:
 *   - Apple Calendar (macOS + iOS)
 *   - Google Calendar (import)
 *   - Microsoft Outlook
 *   - Thunderbird / any RFC 5545 client
 *
 * Usage:
 *   const { generateICS } = require('./ics');
 *   const icsContent = generateICS(booking);
 *   res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
 *   res.setHeader('Content-Disposition', 'attachment; filename="booking.ics"');
 *   res.send(icsContent);
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const SLOT_DEFINITIONS = {
  morning:   { label: 'Morning',   start: '09:00', end: '13:00' },
  afternoon: { label: 'Afternoon', start: '13:00', end: '17:00' },
  evening:   { label: 'Evening',   start: '18:00', end: '22:00' },
};

const TIMEZONE = 'Europe/Brussels';

/**
 * Format a date+time as ICS datetime string (local, with TZID).
 * Input: date "2026-09-10", time "18:00"
 * Output: "20260910T180000"
 */
function icsDateTime(date, time) {
  return date.replace(/-/g, '') + 'T' + time.replace(':', '') + '00';
}

/**
 * Fold long ICS lines at 75 octets (RFC 5545 §3.1).
 */
function foldLine(line) {
  const max = 75;
  if (line.length <= max) return line;
  const parts = [];
  parts.push(line.slice(0, max));
  let i = max;
  while (i < line.length) {
    parts.push(' ' + line.slice(i, i + max - 1));
    i += max - 1;
  }
  return parts.join('\r\n');
}

/**
 * Escape special chars in ICS text values.
 */
function icsEscape(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Build a Google Calendar "Add to Calendar" URL.
 */
function googleCalendarUrl(booking) {
  const slot = SLOT_DEFINITIONS[booking.slot];
  if (!slot) return null;

  const dateStr = booking.date.replace(/-/g, '');
  const startStr = dateStr + 'T' + slot.start.replace(':', '') + '00';
  const endStr   = dateStr + 'T' + slot.end.replace(':', '') + '00';

  const venueName = process.env.VENUE_NAME || 'Allusion Venue, Ghent';
  const title = encodeURIComponent(`${venueName} — ${slot.label} Slot`);
  const details = encodeURIComponent(
    `Venue booking confirmed.\nGuests: ${booking.guests}\nOrganization: ${booking.organization || 'N/A'}\n\nQuestions? Email: ${process.env.ALLUSION_EMAIL || 'info@allusion.be'}`
  );
  const location = encodeURIComponent(venueName);
  const ctz = encodeURIComponent(TIMEZONE);

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}&location=${location}&ctz=${ctz}`;
}

/**
 * Generate RFC 5545 .ics content for a confirmed booking.
 */
function generateICS(booking) {
  const slot = SLOT_DEFINITIONS[booking.slot];
  if (!slot) throw new Error(`Unknown slot: ${booking.slot}`);

  const venueName  = process.env.VENUE_NAME    || 'Allusion Venue, Ghent';
  const allusionEmail = process.env.ALLUSION_EMAIL || 'info@allusion.be';
  const allusionName  = process.env.ALLUSION_NAME  || 'Allusion';

  const dtStart  = icsDateTime(booking.date, slot.start);
  const dtEnd    = icsDateTime(booking.date, slot.end);
  const dtstamp  = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const uid      = `booking-${booking.id}@allusion.be`;

  const summary     = `${venueName} — ${slot.label} Slot`;
  const description = [
    `Venue booking confirmed.`,
    `Guest: ${booking.name}`,
    `Guests: ${booking.guests}`,
    booking.organization ? `Organization: ${booking.organization}` : '',
    ``,
    `Questions? Contact us at ${allusionEmail}`,
  ].filter(l => l !== null).join('\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Allusion//Venue Booking//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE',
    `TZID:${TIMEZONE}`,
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=${TIMEZONE}:${dtStart}`,
    `DTEND;TZID=${TIMEZONE}:${dtEnd}`,
    foldLine(`SUMMARY:${icsEscape(summary)}`),
    foldLine(`DESCRIPTION:${icsEscape(description)}`),
    foldLine(`LOCATION:${icsEscape(venueName)}`),
    `ORGANIZER;CN=${allusionName}:mailto:${allusionEmail}`,
    `ATTENDEE;PARTSTAT=ACCEPTED;CN=${icsEscape(booking.name)}:mailto:${booking.email}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}

module.exports = { generateICS, googleCalendarUrl, SLOT_DEFINITIONS };
