import json
import logging
import os
import re
from datetime import datetime

import boto3
from botocore.exceptions import ClientError

from util import DOCUMENT_FIELDS, json_response, missing_document_fields

ddb = boto3.resource('dynamodb')
PARTICIPANTS_TABLE = os.environ.get('ATTENDEES_TABLE', '')

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SUPPORT_NUMBER_RE = re.compile(r'^[A-Z0-9]{5,12}$')
STORED_DATE_FORMAT = '%d/%m/%Y'
ACCEPTED_DATE_FORMATS = (STORED_DATE_FORMAT, '%Y-%m-%d')
MIN_YEAR, MAX_YEAR = 1900, 2100


def clean_support_number(raw):
    """Uppercase, unspaced support number, or None if it cannot be one."""
    value = re.sub(r'[\s.-]', '', str(raw)).upper()
    return value if SUPPORT_NUMBER_RE.match(value) else None


def clean_date(raw):
    """A DD/MM/YYYY date string, or None if the value is not a plausible date."""
    value = str(raw).strip()
    for date_format in ACCEPTED_DATE_FORMATS:
        try:
            parsed = datetime.strptime(value, date_format).date()
        except ValueError:
            continue
        if MIN_YEAR <= parsed.year <= MAX_YEAR:
            return parsed.strftime(STORED_DATE_FORMAT)
        return None
    return None


CLEANERS = {
    'supportNumber': clean_support_number,
    'emisionDate': clean_date,
    'expirationDate': clean_date,
}


def lambda_handler(event, context):
    if (event.get('httpMethod') or 'PUT').upper() == 'GET':
        return handle_get(event)
    return handle_put(event)


def handle_get(event):
    """Which ID card details are still missing — the values themselves never leave.

    The app re-checks this on every start, so a session that logged in before
    the details were asked for is still gated.
    """
    query_params = event.get('queryStringParameters') or {}
    user_id = (query_params.get('id') or '').strip()
    if not user_id:
        return json_response(400, {'code': 'missingId', 'message': 'Missing id'})

    try:
        item = ddb.Table(PARTICIPANTS_TABLE).get_item(Key={'id': user_id}).get('Item')
    except Exception:
        logger.exception('Could not read the roster row for id=%s', user_id)
        return json_response(500, {'code': 'genericError', 'message': 'Server error'})

    if not item:
        return json_response(404, {'code': 'unknownId', 'message': 'Unknown id'})
    return json_response(200, {'missingDocumentFields': missing_document_fields(item)})


def handle_put(event):
    try:
        body = json.loads(event.get('body') or '{}')
    except ValueError:
        return json_response(400, {'code': 'badRequest', 'message': 'Invalid JSON'})

    user_id = (body.get('id') or '').strip()
    if not user_id:
        return json_response(400, {'code': 'missingId', 'message': 'Missing id'})

    updates = {}

    phone = str(body.get('phone') or '').strip()
    if phone:
        updates['phone'] = phone

    for api_name, attr_name in DOCUMENT_FIELDS:
        raw = str(body.get(api_name) or '').strip()
        if not raw:
            continue
        cleaned = CLEANERS[api_name](raw)
        if cleaned is None:
            return json_response(400, {
                'code': 'invalidDocument',
                'field': api_name,
                'message': f'Invalid {api_name}',
            })
        updates[attr_name] = cleaned

    if not updates:
        return json_response(400, {'code': 'nothingToUpdate', 'message': 'Nothing to update'})

    entries = list(updates.items())
    names = {f'#f{i}': attr_name for i, (attr_name, _) in enumerate(entries)}
    values = {f':v{i}': value for i, (_, value) in enumerate(entries)}
    expression = 'SET ' + ', '.join(f'#f{i} = :v{i}' for i in range(len(entries)))

    try:
        res = ddb.Table(PARTICIPANTS_TABLE).update_item(
            Key={'id': user_id},
            UpdateExpression=expression,
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
            ConditionExpression='attribute_exists(id)',
            ReturnValues='ALL_NEW',
        )
    except ClientError as err:
        if err.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return json_response(404, {'code': 'unknownId', 'message': 'Unknown id'})
        logger.exception('Could not update id=%s', user_id)
        return json_response(500, {'code': 'genericError', 'message': 'Server error'})
    except Exception:
        logger.exception('Could not update id=%s', user_id)
        return json_response(500, {'code': 'genericError', 'message': 'Server error'})

    return json_response(200, {
        'message': 'Profile updated',
        'missingDocumentFields': missing_document_fields(res.get('Attributes')),
    })
