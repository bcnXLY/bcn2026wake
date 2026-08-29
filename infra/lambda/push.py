"""Web push fan-out via the OneSignal REST API.

Server-side because the REST key must never reach the browser — the client
bundle only ever sees the public app ID. With either variable missing the
module no-ops, so a stack deployed without OneSignal still stores messages
normally, exactly like the frontend degrades when VITE_ONESIGNAL_APP_ID is
unset.
"""
import os
import json
import logging
import urllib.request
import urllib.error

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ONESIGNAL_URL = 'https://api.onesignal.com/notifications'
ONESIGNAL_TIMEOUT = 5

# The OS truncates notification bodies anyway; this keeps the payload small
# and the log line readable.
MAX_PREVIEW_LENGTH = 180

# OneSignal's built-in segment of everyone who granted permission.
SUBSCRIBED_SEGMENT = 'Subscribed Users'

DEFAULT_HEADING = 'BCN 2026'


def _config():
    """(app id, rest key), or (None, None) when push is not configured."""
    app_id = (os.environ.get('ONESIGNAL_APP_ID') or '').strip()
    rest_key = (os.environ.get('ONESIGNAL_REST_API_KEY') or '').strip()
    return (app_id, rest_key) if app_id and rest_key else (None, None)


def preview(text, limit=MAX_PREVIEW_LENGTH):
    """Collapse a message to one line short enough for a notification body."""
    flat = ' '.join((text or '').split())
    if len(flat) <= limit:
        return flat
    return flat[:limit - 1].rstrip() + '…'


def notify_global_message(sender_name, text):
    """Push a new global-board message to every subscriber. Never raises.

    Returns the OneSignal notification id, or None when push is unconfigured
    or the call failed: the message is already in DynamoDB by this point, so a
    failed notification must not fail the request that stored it.
    """
    app_id, rest_key = _config()
    if not app_id:
        logger.info('OneSignal not configured; skipping global push.')
        return None

    payload = {
        'app_id': app_id,
        'included_segments': [SUBSCRIBED_SEGMENT],
        'headings': {'en': (sender_name or '').strip() or DEFAULT_HEADING},
        'contents': {'en': preview(text)},
    }

    req = urllib.request.Request(
        ONESIGNAL_URL,
        data=json.dumps(payload).encode('utf-8'),
        method='POST',
    )
    # Matches infra/seed/broadcast.mjs — a rotated key must be updated in both.
    req.add_header('Authorization', f'Basic {rest_key}')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Accept', 'application/json')

    try:
        with urllib.request.urlopen(req, timeout=ONESIGNAL_TIMEOUT) as response:
            body = json.loads(response.read().decode('utf-8'))
        logger.info('OneSignal queued %s -> recipients=%s',
                    body.get('id'), body.get('recipients'))
        return body.get('id')
    except urllib.error.HTTPError as e:
        # OneSignal puts the useful diagnostics in the error body (bad key,
        # unknown segment), so read it instead of logging an opaque failure.
        logger.warning('OneSignal HTTP %s: %s', e.code, e.read().decode('utf-8', 'replace'))
    except Exception as err:
        logger.warning('OneSignal push failed: %s', err)
    return None
