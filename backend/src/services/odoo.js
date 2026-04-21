const xmlrpc = require('xmlrpc');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

function createClient(path) {
  const urlStr = process.env.ODOO_URL || 'https://placeholder.odoo.com';
  let url;
  try {
    url = new URL(urlStr);
  } catch {
    return null;
  }
  const secure = url.protocol === 'https:';
  const options = {
    host: url.hostname,
    port: parseInt(url.port) || (secure ? 443 : 80),
    path,
  };
  return secure ? xmlrpc.createSecureClient(options) : xmlrpc.createClient(options);
}

function call(client, method, params) {
  return new Promise((resolve, reject) => {
    client.methodCall(method, params, (err, val) => {
      if (err) reject(err);
      else resolve(val);
    });
  });
}

async function authenticate() {
  const client = createClient('/xmlrpc/2/common');
  if (!client) throw new Error('Invalid ODOO_URL');
  const uid = await call(client, 'authenticate', [
    process.env.ODOO_DB || '',
    process.env.ODOO_USERNAME || 'admin',
    process.env.ODOO_PASSWORD || '',
    {},
  ]);
  if (!uid || uid === false) throw new Error('Odoo authentication failed');
  return uid;
}

function modelsClient() {
  return createClient('/xmlrpc/2/object');
}

async function findOrCreatePartner(uid, booking) {
  const models = modelsClient();
  const params = [process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD];

  const existing = await call(models, 'execute_kw', [
    ...params, 'res.partner', 'search_read',
    [[['email', '=', booking.email]]],
    { fields: ['id', 'name', 'email'], limit: 1 },
  ]);

  if (existing.length > 0) return existing[0].id;

  const partnerId = await call(models, 'execute_kw', [
    ...params, 'res.partner', 'create',
    [{
      name: booking.name,
      email: booking.email,
      phone: booking.phone || '',
      comment: `Venue booking customer. Organization: ${booking.organization || 'N/A'}`,
      country_id: parseInt(process.env.ODOO_PARTNER_COUNTRY_ID || '20'),
    }],
  ]);

  return partnerId;
}

async function syncInvoiceToOdoo(booking, invoiceData) {
  try {
    // Skip if Odoo is not configured
    const odooUrl = process.env.ODOO_URL || '';
    if (!odooUrl || odooUrl.includes('placeholder') || odooUrl.includes('your-odoo')) {
      console.log('[Odoo] Not configured, skipping sync.');
      return null;
    }

    const uid = await authenticate();
    const models = modelsClient();
    const params = [process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD];

    const partnerId = await findOrCreatePartner(uid, booking);

    const SLOT_LABELS = {
      morning: 'Morning Slot (09:00\u201313:00)',
      afternoon: 'Afternoon Slot (13:00\u201317:00)',
      evening: 'Evening Slot (18:00\u201322:00)',
    };

    const amount = (invoiceData.total || 0) / 100;
    const venueName = process.env.VENUE_NAME || 'Allusion Venue, Ghent';

    const invoiceId = await call(models, 'execute_kw', [
      ...params, 'account.move', 'create',
      [{
        move_type: 'out_invoice',
        partner_id: partnerId,
        invoice_date: booking.date,
        ref: `Stripe Invoice \u2014 Booking ${booking.id}`,
        narration: `Venue booking: ${SLOT_LABELS[booking.slot]} on ${booking.date}`,
        invoice_line_ids: [[0, 0, {
          name: `${venueName} \u2014 ${SLOT_LABELS[booking.slot]}`,
          quantity: 1,
          price_unit: amount,
        }]],
      }],
    ]);

    await call(models, 'execute_kw', [
      ...params, 'account.move', 'action_post',
      [[invoiceId]],
    ]);

    console.log(`[Odoo] Invoice ${invoiceId} created for booking ${booking.id}`);
    return { invoiceId, partnerId };
  } catch (err) {
    console.error('[Odoo] Sync error:', err.message);
    return null;
  }
}

module.exports = { syncInvoiceToOdoo };
