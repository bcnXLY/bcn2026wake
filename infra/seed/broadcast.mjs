/**
 * Send a web push broadcast to all attendees via the OneSignal REST API.
 *
 *   ONESIGNAL_APP_ID=xxx ONESIGNAL_REST_API_KEY=xxx \
 *   node broadcast.mjs "Keynote starts in 10 minutes!" "See you in Auditorium A"
 *
 * Intended to be run manually or from a scheduled GitHub Actions job.
 */
const APP_ID = process.env.ONESIGNAL_APP_ID;
const REST_KEY = process.env.ONESIGNAL_REST_API_KEY;

const [, , title, body] = process.argv;

if (!APP_ID || !REST_KEY) {
  console.error('Set ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY.');
  process.exit(1);
}
if (!title) {
  console.error('Usage: node broadcast.mjs "<title>" "<body>"');
  process.exit(1);
}

const res = await fetch('https://api.onesignal.com/notifications', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Basic ${REST_KEY}`,
  },
  body: JSON.stringify({
    app_id: APP_ID,
    included_segments: ['Subscribed Users'],
    headings: { en: title },
    contents: { en: body || '' },
  }),
});

const data = await res.json();
if (!res.ok) {
  console.error('Broadcast failed:', data);
  process.exit(1);
}
console.log('Broadcast queued:', data.id, `→ recipients: ${data.recipients ?? 'n/a'}`);
