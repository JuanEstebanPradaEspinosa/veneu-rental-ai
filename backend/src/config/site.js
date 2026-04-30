// Single source of truth for the public site host.
// Set VENUE_HOST in backend/.env (e.g. venue.allusion.ventures); FRONTEND_URL is derived.
// Set FRONTEND_URL explicitly only to override (e.g. http://localhost:5173 for dev).

const venueHost = process.env.VENUE_HOST || '';
const isLocalHost = /^localhost(:|$)|^127\./.test(venueHost);
const derivedUrl = venueHost
  ? `${isLocalHost ? 'http' : 'https'}://${venueHost}`
  : 'http://localhost:5173';

const frontendUrl = process.env.FRONTEND_URL || derivedUrl;

module.exports = { venueHost, frontendUrl };
