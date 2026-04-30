const Stripe = require('stripe');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { frontendUrl } = require('../config/site');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_MAP = {
  morning:   process.env.PRICE_ID_250,
  afternoon: process.env.PRICE_ID_250,
  evening:   process.env.PRICE_ID_350,
};

const AMOUNT_MAP = {
  morning:   250,
  afternoon: 250,
  evening:   350,
};

async function createPaymentLink(booking) {
  const priceId = PRICE_MAP[booking.slot];
  if (!priceId) throw new Error(`Unknown slot: ${booking.slot}`);

  const link = await stripe.paymentLinks.create({
    line_items: [{ price: priceId, quantity: 1 }],
    after_completion: {
      type: 'redirect',
      redirect: { url: `${frontendUrl}/booking-confirmed?id=${booking.id}` },
    },
    metadata: {
      booking_id: booking.id,
      booking_date: booking.date,
      booking_slot: booking.slot,
      customer_email: booking.email,
      customer_name: booking.name,
    },
    phone_number_collection: { enabled: false },
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `Venue booking — ${booking.slot} slot — ${booking.date}`,
        metadata: { booking_id: booking.id },
      },
    },
  });

  return link.url;
}

function constructWebhookEvent(rawBody, signature) {
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

async function getInvoicePdfUrl(invoiceId) {
  const invoice = await stripe.invoices.retrieve(invoiceId);
  return { pdfUrl: invoice.invoice_pdf, hostedUrl: invoice.hosted_invoice_url, total: invoice.amount_paid };
}

async function getPaymentIntent(piId) {
  return stripe.paymentIntents.retrieve(piId, { expand: ['invoice'] });
}

// Finds the paid checkout session for a payment link URL and returns invoice data.
// Used by mark-paid poller (no webhook needed).
async function getInvoiceFromPaymentLink(paymentLinkUrl) {
  try {
    // Resolve buy URL → plink_ ID
    const links = await stripe.paymentLinks.list({ limit: 100 });
    const pl = links.data.find(l => l.url === paymentLinkUrl);
    if (!pl) return null;

    const sessions = await stripe.checkout.sessions.list({ payment_link: pl.id, limit: 5 });
    const paid = sessions.data.find(s => s.payment_status === 'paid');
    if (!paid) return null;

    const invoiceId = paid.invoice;
    if (!invoiceId) return null;

    const invoice = await stripe.invoices.retrieve(invoiceId);
    return {
      invoiceId,
      pdfUrl:     invoice.invoice_pdf,
      hostedUrl:  invoice.hosted_invoice_url,
      total:      invoice.amount_paid,
      number:     invoice.number,
    };
  } catch (e) {
    console.error('[Stripe] getInvoiceFromPaymentLink failed:', e.message);
    return null;
  }
}

module.exports = { createPaymentLink, constructWebhookEvent, getInvoicePdfUrl, getPaymentIntent, getInvoiceFromPaymentLink, AMOUNT_MAP };
