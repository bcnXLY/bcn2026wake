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
