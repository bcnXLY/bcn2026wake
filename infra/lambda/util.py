import json
from decimal import Decimal

CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,GET,PUT,DELETE,OPTIONS',
}


def _encode(value):
    """DynamoDB hands back numbers as Decimal, which json.dumps refuses."""
    if isinstance(value, Decimal):
        as_float = float(value)
        return int(as_float) if as_float.is_integer() else as_float
    raise TypeError(f'Object of type {type(value).__name__} is not JSON serializable')


def json_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': CORS,
        'body': json.dumps(body, default=_encode)
    }


PERM_GLOBAL_CHAT = 1
PERM_GAME_MASTER = 2

PERM_OBSERVER = 6
PERM_WINNER = 7
PERM_PROTECTOR = 8


def _permission_ints(participant):
    for value in (participant or {}).get('permissions') or []:
        try:
            yield int(value)
        except (ValueError, TypeError):
            pass


def permissions_of(participant):
    return set(_permission_ints(participant))


def has_permission(participant, permission):
    return any(value == permission for value in _permission_ints(participant))


# ---- Spanish ID card details -------------------------------------------
# Support number + issue/expiry dates. The roster is missing them for part of
# the camp, so the app gates itself until the attendee fills them in. They are
# for the organisers only: nothing ever sends the values back to the client,
# only which of them are still blank.
DOCUMENT_FIELDS = (
    ('supportNumber', 'support_number'),
    ('emisionDate', 'emision_date'),
    ('expirationDate', 'expiration_date'),
)


def missing_document_fields(participant):
    """The document fields with no value on this roster row, in form order."""
    item = participant or {}
    return [
        api_name
        for api_name, attr_name in DOCUMENT_FIELDS
        if not str(item.get(attr_name) or '').strip()
    ]
