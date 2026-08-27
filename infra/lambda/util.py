import json
from decimal import Decimal

CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,GET,PUT,OPTIONS',
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
