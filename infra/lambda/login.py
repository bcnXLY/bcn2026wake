import os
import boto3
import json
import base64
import logging
import urllib.request
import urllib.parse
import urllib.error
from boto3.dynamodb.conditions import Key
from util import json_response, permissions_of
ddb = boto3.resource('dynamodb')
PARTICIPANTS_TABLE = os.environ.get('ATTENDEES_TABLE', '')

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ROLE_MEMBER = 0
ROLE_LEADER = 1
ROLE_MAINTAINER = 8

UNASSIGNED = {'unassigned', 'team_0', 'room_0'}

DEFAULT_COUNTRY_CODE = '34'


TWILIO_TIMEOUT = 8

TWILIO_ERR_MAX_CHECK_ATTEMPTS = 60202
TWILIO_ERR_MAX_SEND_ATTEMPTS = 60203


class TwilioNotConfigured(Exception):
    """Raised when the Verify credentials are missing from the environment."""


class TwilioError(Exception):
    def __init__(self, status, code, message):
        super().__init__(f'Twilio HTTP {status} (code {code}): {message}')
        self.status = status
        self.code = code


def _twilio_config():
    account_sid = (os.environ.get('TWILIO_ACCOUNT_SID') or '').strip()
    auth_token = (os.environ.get('TWILIO_AUTH_TOKEN') or '').strip()
    service_sid = (os.environ.get('TWILIO_VERIFY_SERVICE_SID') or '').strip()

    missing = [
        name for name, value in (
            ('TWILIO_ACCOUNT_SID', account_sid),
            ('TWILIO_AUTH_TOKEN', auth_token),
            ('TWILIO_VERIFY_SERVICE_SID', service_sid),
        ) if not value
    ]
    if missing:
        raise TwilioNotConfigured(', '.join(missing))

    return account_sid, auth_token, service_sid


def _twilio_post(url, fields, account_sid, auth_token):
    """POST a form-encoded body to Twilio. Returns (status_code, parsed_body)."""
    data = urllib.parse.urlencode(fields).encode('utf-8')
    auth_b64 = base64.b64encode(f'{account_sid}:{auth_token}'.encode('utf-8')).decode('ascii')

    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Authorization', f'Basic {auth_b64}')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    req.add_header('Accept', 'application/json')

    try:
        with urllib.request.urlopen(req, timeout=TWILIO_TIMEOUT) as response:
            return response.status, json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        # Twilio puts the useful diagnostics in the error body, so read it rather
        # than letting the exception bubble up as an opaque failure.
        raw = e.read().decode('utf-8', 'replace')
        try:
            body = json.loads(raw)
        except ValueError:
            body = {'message': raw}
        logger.warning('Twilio %s -> HTTP %s code=%s message=%s',
                       url, e.code, body.get('code'), body.get('message'))
        return e.code, body


def twilio_verify_start(to_phone):
    """Send an SMS verification. Raises TwilioNotConfigured / TwilioError."""
    account_sid, auth_token, service_sid = _twilio_config()
    url = f'https://verify.twilio.com/v2/Services/{service_sid}/Verifications'

    status, body = _twilio_post(url, {'To': to_phone, 'Channel': 'sms'}, account_sid, auth_token)

    if status in (200, 201):
        return body
    raise TwilioError(status, body.get('code'), body.get('message'))


def twilio_verify_check(to_phone, code):
    """Check a code. Returns 'approved', 'invalid', 'expired' or 'too_many_attempts'."""
    account_sid, auth_token, service_sid = _twilio_config()
    url = f'https://verify.twilio.com/v2/Services/{service_sid}/VerificationCheck'

    status, body = _twilio_post(url, {'To': to_phone, 'Code': code}, account_sid, auth_token)

    if status == 200 and body.get('status') == 'approved':
        return 'approved'
    if body.get('code') == TWILIO_ERR_MAX_CHECK_ATTEMPTS or status == 429:
        return 'too_many_attempts'
    # Twilio 404s once a verification expires, is approved, or was never started.
    if status == 404:
        return 'expired'
    return 'invalid'


def normalize_phone(raw):
    """Best-effort E.164 conversion for roster numbers stored in mixed formats."""
    if raw is None:
        return ''

    s = str(raw).strip()
    if not s:
        return ''
    if 'E' in s or 'e' in s or s.endswith('.0'):
        try:
            s = str(int(float(s)))
        except ValueError:
            pass

    international = s.startswith('+') or s.startswith('00')
    digits = ''.join(c for c in s if c.isdigit())
    if not digits:
        return ''

    if s.startswith('00'):
        digits = digits[2:]
    if international:
        return '+' + digits

    if digits.startswith(DEFAULT_COUNTRY_CODE) and len(digits) > 9:
        return '+' + digits
    return '+' + DEFAULT_COUNTRY_CODE + digits.lstrip('0')


def lambda_handler(event, context):
    query_params = event.get('queryStringParameters') or {}
    user_id = (query_params.get('id') or '').strip()
    code = (query_params.get('code') or '').strip()

    if not user_id:
        return json_response(400, {'code': 'missingId', 'message': 'Missing id'})

    table = ddb.Table(PARTICIPANTS_TABLE)

    try:
        res = table.get_item(Key={'id': user_id})
        p = res.get('Item')
        if not p:
            return json_response(404, {'code': 'unknownId', 'message': 'Unknown id'})

        role = p.get('role', 0)
        try:
            role = int(role)
        except (ValueError, TypeError):
            role = 0

        if role in (ROLE_LEADER, ROLE_MAINTAINER, ):
            phone_str = normalize_phone(p.get('phone'))
            if not phone_str:
                return json_response(400, {
                    'code': 'noPhoneRegistered',
                    'message': 'Phone number not registered.',
                })

            if not code:
                try:
                    twilio_verify_start(phone_str)
                except TwilioNotConfigured as e:
                    logger.error('Twilio Verify is not configured; missing: %s', e)
                    return json_response(503, {
                        'code': 'smsFailed',
                        'message': 'SMS verification is unavailable.',
                    })
                except TwilioError as e:
                    logger.error('Could not start verification for %s: %s', user_id, e)
                    if e.code == TWILIO_ERR_MAX_SEND_ATTEMPTS:
                        return json_response(429, {
                            'code': 'tooManyAttempts',
                            'message': 'Too many codes requested.',
                        })
                    return json_response(502, {
                        'code': 'smsFailed',
                        'message': 'Could not send the verification code.',
                    })
                except urllib.error.URLError as e:
                    logger.error('Could not reach Twilio: %s', e)
                    return json_response(502, {
                        'code': 'smsFailed',
                        'message': 'Could not send the verification code.',
                    })

                return json_response(200, {'requires2FA': True})

            if not code.isdigit() or not 4 <= len(code) <= 10:
                return json_response(401, {'code': 'invalidCode', 'message': 'Invalid code'})

            try:
                result = twilio_verify_check(phone_str, code)
            except TwilioNotConfigured as e:
                logger.error('Twilio Verify is not configured; missing: %s', e)
                return json_response(503, {
                    'code': 'smsFailed',
                    'message': 'SMS verification is unavailable.',
                })
            except urllib.error.URLError as e:
                logger.error('Could not reach Twilio: %s', e)
                return json_response(502, {
                    'code': 'smsFailed',
                    'message': 'Could not verify the code.',
                })

            if result == 'too_many_attempts':
                return json_response(429, {
                    'code': 'tooManyAttempts',
                    'message': 'Too many attempts. Request a new code.',
                })
            if result == 'expired':
                return json_response(401, {'code': 'invalidCode', 'message': 'Code has expired'})
            if result != 'approved':
                return json_response(401, {'code': 'invalidCode', 'message': 'Invalid code'})

        return json_response(200, {'profile': to_profile(p)})
    except Exception:
        logger.exception('Login failed for id=%s', user_id)
        return json_response(500, {'code': 'genericError', 'message': 'Server error'})

def has_real_team(p):
    team_id = p.get('team_id')
    return bool(team_id) and team_id not in UNASSIGNED

def has_real_room(p):
    room_id = p.get('room_id')
    return bool(room_id) and room_id not in UNASSIGNED

def extract_numbers(id_str):
    if not id_str:
        return ''
    return ''.join(c for c in id_str if c.isdigit())

def query_index(index_name, key_name, value):
    if not value:
        return []
    table = ddb.Table(PARTICIPANTS_TABLE)
    items = []
    kwargs = {
        'IndexName': index_name,
        'KeyConditionExpression': Key(key_name).eq(value)
    }
    while True:
        res = table.query(**kwargs)
        items.extend(res.get('Items', []))
        if 'LastEvaluatedKey' in res:
            kwargs['ExclusiveStartKey'] = res['LastEvaluatedKey']
        else:
            break
    return items

def to_profile(p):
    role = p.get('role', 0)
    try:
        role = int(role)
    except (ValueError, TypeError):
        role = 0

    phone = p.get('phone')
    phone_str = str(phone) if phone is not None else ""

    magic_number = str(p.get('magic_number') or '').strip()

    team_code = extract_numbers(p.get('team_id')) if has_real_team(p) else ""
    room_number = extract_numbers(p.get('room_id')) if has_real_room(p) else ""

    leadersName = []
    if has_real_team(p):
        team_members = query_index('byTeam', 'team_id', p.get('team_id'))
        leadersName = [item.get('name', '') for item in team_members if int(item.get('role', 0) or 0) == ROLE_LEADER]

    roommatesName = []
    if has_real_room(p):
        room_members = query_index('byRoom', 'room_id', p.get('room_id'))
        roommatesName = [item.get('name', '') for item in room_members if item.get('id') != p.get('id')]

    return {
        'id': p.get('id'),
        'name': p.get('name', ''),
        'phone': phone_str,
        'churchName': p.get('church') or p.get('church_name') or '',
        'magicNumber': magic_number,
        'teamCode': team_code,
        'roomNumber': room_number,
        'leadersName': leadersName,
        'roommatesName': roommatesName,
        'isLeader': role == ROLE_LEADER,
        'isManager': role == ROLE_MAINTAINER,
        'role': role,
        'permissions': sorted(permissions_of(p)),
    }
