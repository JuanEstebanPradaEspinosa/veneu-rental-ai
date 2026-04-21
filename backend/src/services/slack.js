const { WebClient } = require('@slack/web-api');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

let _slack;
function getSlack() {
  if (!_slack) _slack = new WebClient(process.env.SLACK_BOT_TOKEN);
  return _slack;
}

const CHANNEL = () => process.env.SLACK_APPROVAL_CHANNEL;

const SLOT_LABELS = {
  morning:   'Morning   (09:00–13:00)',
  afternoon: 'Afternoon (13:00–17:00)',
  evening:   'Evening   (18:00–22:00)',
};

const PRICE_LABELS = {
  morning: '€250', afternoon: '€250', evening: '€350',
};

const SLOT_ICONS = {
  morning: '🌅', afternoon: '☀️', evening: '🌙',
};

function formatDate(dateStr) {
  try {
    return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  } catch { return dateStr; }
}

/**
 * Post a new booking notification as a conversational card.
 * Hermes (the AI agent in Slack) reads this and responds to thread replies.
 * Returns { ts, channel } for threading.
 */
async function postBookingRequest(booking) {
  const lines = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `🏛️  *NEW BOOKING REQUEST*`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `👤  *${booking.name}*`,
    `📧  ${booking.email}`,
    booking.phone    ? `📞  ${booking.phone}` : null,
    booking.organization ? `🏢  ${booking.organization}` : null,
    '',
    `📅  *${formatDate(booking.date)}*`,
    `${SLOT_ICONS[booking.slot] || '🕐'}  *${SLOT_LABELS[booking.slot]}*`,
    `👥  ${booking.guests} guest${booking.guests !== 1 ? 's' : ''}`,
    `💶  *${PRICE_LABELS[booking.slot]}*`,
    '',
    booking.message
      ? `📝  _"${booking.message}"_`
      : `📝  _No message provided_`,
    '',
    `🆔  \`${booking.id.slice(0, 8)}\``,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `_Reply in this thread: "approve", "reject", "ask them about X", or anything else._`,
  ].filter(l => l !== null).join('\n');

  const res = await getSlack().chat.postMessage({
    channel: CHANNEL(),
    text: `New booking request from ${booking.name} — ${formatDate(booking.date)} — ${SLOT_LABELS[booking.slot]}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: lines },
      },
    ],
  });

  return { ts: res.ts, channel: res.channel };
}

/**
 * Post a thread reply — used by Hermes to confirm actions back to Allusion.
 */
async function postThreadReply(channel, ts, text) {
  if (!channel || !ts) return;
  await getSlack().chat.postMessage({
    channel,
    thread_ts: ts,
    text,
    mrkdwn: true,
  });
}

/**
 * Update the original booking message to reflect final status.
 * Called after payment confirmed (paid) or other terminal states.
 */
async function updateBookingMessage(channel, ts, booking, outcome) {
  if (!channel || !ts) return;

  const STATUS_LINES = {
    approved: `✅ *APPROVED* — Payment link sent to ${booking.email}`,
    rejected: `❌ *REJECTED*`,
    paid:     `💳 *PAID & CONFIRMED* — Invoice sent to ${booking.email}`,
  };

  const statusLine = STATUS_LINES[outcome] || `📝 *${outcome.toUpperCase()}*`;

  const lines = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `🏛️  *BOOKING — ${outcome.toUpperCase()}*`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `👤  *${booking.name}*`,
    `📅  ${formatDate ? formatDate(booking.date) : booking.date}`,
    `${SLOT_ICONS[booking.slot] || '🕐'}  ${SLOT_LABELS[booking.slot]}`,
    `💶  ${PRICE_LABELS[booking.slot]}`,
    '',
    statusLine,
    `🆔  \`${booking.id.slice(0, 8)}\``,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');

  await getSlack().chat.update({
    channel,
    ts,
    text: `Booking ${outcome}: ${booking.name} — ${booking.date}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: lines },
      },
    ],
  });
}

module.exports = { postBookingRequest, postThreadReply, updateBookingMessage };
