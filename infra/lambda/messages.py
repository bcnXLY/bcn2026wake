import os
import json
import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from util import PERM_GLOBAL_CHAT, has_permission, json_response

ddb = boto3.resource('dynamodb')
PARTICIPANTS_TABLE = os.environ.get('ATTENDEES_TABLE', '')
MESSAGES_TABLE = os.environ.get('MESSAGES_TABLE', '')

ROLE_MEMBER = 0

GLOBAL_TEAM_ID = 'global'

# Team 0 is the staff team and gets its own board, so `unassigned` is the only
# team_id that means "no team yet".
NO_TEAM = {'unassigned', '', GLOBAL_TEAM_ID}

MAX_TEXT_LENGTH = 2000


def lambda_handler(event, context):
    method = (event.get('httpMethod') or 'GET').upper()

    try:
        if method == 'GET':
            return handle_get(event)
        if method == 'POST':
            return handle_post(event)
        if method == 'DELETE':
            return handle_delete(event)
        return json_response(405, {'message': 'Method not allowed'})
    except Exception as err:
        print(err)
        return json_response(500, {'message': 'Server error'})


def handle_get(event):
    query_params = event.get('queryStringParameters') or {}
    my_id = (query_params.get('id') or '').strip()

    if not my_id:
        return json_response(401, {'message': 'Unauthorized'})

    me = fetch_participant(my_id)
    if not me:
        return json_response(404, {'message': 'Participant not found'})

    board_id, may_post = board_for(me, query_params.get('scope'))
    if not board_id:
        return json_response(200, {'teamCode': '', 'canPost': False, 'messages': []})

    return json_response(200, {
        'teamCode': board_id if is_global(query_params.get('scope')) else extract_numbers(board_id),
        'canPost': may_post,
        'messages': fetch_messages(board_id),
    })


def handle_post(event):
    body = parse_body(event)
    if body is None:
        return json_response(400, {'message': 'Invalid JSON'})

    my_id = (body.get('id') or '').strip()
    if not my_id:
        return json_response(401, {'message': 'Unauthorized'})

    text, error = clean_text(body.get('text'))
    if error:
        return json_response(400, {'message': error})

    me = fetch_participant(my_id)
    if not me:
        return json_response(404, {'message': 'Participant not found'})

    # The board is resolved from the roster record — never trusted from the client,
    # so nobody can post onto another team's board.
    board_id, may_post = board_for(me, body.get('scope'))
    if not may_post:
        return json_response(403, {'message': 'Forbidden'})

    now = utc_now()
    item = {
        'team_id': board_id,
        'message_id': f'{now}#{uuid.uuid4().hex[:8]}',
        'text': text,
        'sender_id': me.get('id'),
        # Sender name/role are denormalised so reading a board never needs a
        # second lookup per message.
        'sender_name': me.get('name', ''),
        'sender_role': get_role(me),
        'created_at': now,
    }
    ddb.Table(MESSAGES_TABLE).put_item(Item=item)

    return json_response(201, {'message': to_message(item)})


def handle_delete(event):
    query_params = event.get('queryStringParameters') or {}

    my_id = (query_params.get('id') or '').strip()
    message_id = (query_params.get('messageId') or '').strip()
    if not my_id:
        return json_response(401, {'message': 'Unauthorized'})
    if not message_id:
        return json_response(400, {'message': 'Missing messageId'})

    me = fetch_participant(my_id)
    if not me:
        return json_response(404, {'message': 'Participant not found'})

    board_id, may_post = board_for(me, query_params.get('scope'))
    if not may_post:
        return json_response(403, {'message': 'Forbidden'})

    try:
        ddb.Table(MESSAGES_TABLE).delete_item(
            Key={'team_id': board_id, 'message_id': message_id},
            # Only the author can delete their own message.
            ConditionExpression='sender_id = :uid',
            ExpressionAttributeValues={':uid': me.get('id')},
        )
    except ClientError as err:
        if err.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return json_response(403, {'message': 'Forbidden'})
        raise

    return json_response(200, {'messageId': message_id})


def parse_body(event):
    try:
        return json.loads(event.get('body') or '{}')
    except Exception:
        return None


def clean_text(raw):
    text = (raw or '').strip() if isinstance(raw, str) else ''
    if not text:
        return '', 'Missing text'
    if len(text) > MAX_TEXT_LENGTH:
        return '', 'Message too long'
    return text, None


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def get_role(item):
    role = item.get('role', 0)
    try:
        return int(role)
    except (ValueError, TypeError):
        return 0


def has_real_team(p):
    team_id = p.get('team_id')
    return bool(team_id) and team_id not in NO_TEAM


def can_post(p):
    """Members (role 0) read their board; everyone else on the team may post."""
    return has_real_team(p) and get_role(p) != ROLE_MEMBER


def is_global(scope):
    return scope == 'global'


def board_for(p, scope):
    """(board id, may post) for the requested board — '' when there is none."""
    if is_global(scope):
        return GLOBAL_TEAM_ID, has_permission(p, PERM_GLOBAL_CHAT)
    return (p.get('team_id'), can_post(p)) if has_real_team(p) else ('', False)


def extract_numbers(id_str):
    if not id_str:
        return ''
    return ''.join(c for c in id_str if c.isdigit())


def to_message(item):
    return {
        'id': item.get('message_id'),
        'text': item.get('text', ''),
        'senderId': item.get('sender_id'),
        'senderName': item.get('sender_name', ''),
        'senderRole': get_sender_role(item),
        'createdAt': item.get('created_at'),
    }


def get_sender_role(item):
    role = item.get('sender_role', 0)
    try:
        return int(role)
    except (ValueError, TypeError):
        return 0


def fetch_participant(user_id):
    table = ddb.Table(PARTICIPANTS_TABLE)
    res = table.get_item(Key={'id': user_id})
    return res.get('Item')


def fetch_messages(team_id):
    table = ddb.Table(MESSAGES_TABLE)
    items = []
    kwargs = {
        'KeyConditionExpression': Key('team_id').eq(team_id),
        # message_id is timestamp-prefixed, so the sort key orders chronologically.
        'ScanIndexForward': True,
    }

    while True:
        res = table.query(**kwargs)
        items.extend(res.get('Items', []))
        if 'LastEvaluatedKey' in res:
            kwargs['ExclusiveStartKey'] = res['LastEvaluatedKey']
        else:
            break
    return [to_message(item) for item in items]
