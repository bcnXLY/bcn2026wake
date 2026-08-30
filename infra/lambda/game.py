"""The Finite ONE — read the world, award points.

Team points apply immediately and transactionally. World points go to SQS and
are applied by tick.py, so one writer owns world health.
"""
import os
import json
import time
import logging
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError

from util import json_response
import game_state as gs

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ddb = boto3.resource('dynamodb')
ddb_client = boto3.client('dynamodb')
sqs = boto3.client('sqs')
serializer = TypeSerializer()

PARTICIPANTS_TABLE = os.environ.get('ATTENDEES_TABLE', '')
STATE_TABLE = os.environ.get('GAME_STATE_TABLE', '')
AWARDS_TABLE = os.environ.get('GAME_AWARDS_TABLE', '')
WORLD_POINTS_QUEUE_URL = os.environ.get('WORLD_POINTS_QUEUE_URL', '')

AWARD_TTL_DAYS = 7
HISTORY_LIMIT = 50
MAX_AWARD_ID_LENGTH = 64


def lambda_handler(event, context):
    route = event.get('resource') or event.get('path') or '/game'
    method = (event.get('httpMethod') or 'GET').upper()

    try:
        if route.endswith('/awards') and method == 'GET':
            return handle_history(event)
        if route.endswith('/award') and method == 'POST':
            return handle_award(event)
        if method == 'GET':
            return handle_get(event)
        return json_response(405, {'message': 'Method not allowed'})
    except Exception:
        logger.exception('Game request failed: %s %s', method, route)
        return json_response(500, {'message': 'Server error'})


def handle_get(event):
    query = event.get('queryStringParameters') or {}
    my_id = (query.get('id') or '').strip()
    if not my_id:
        return json_response(401, {'message': 'Unauthorized'})

    me = fetch_participant(my_id)
    if not me:
        return json_response(404, {'message': 'Participant not found'})

    state = fetch_state() or {}
    scores = state.get('scores') or {}
    view = gs.view_for(me)

    body = {
        'status': state.get('status', gs.STATUS_IDLE),
        'worldHealth': gs.project_health(state, now_ms()),
        'view': view,
        'leaderboard': gs.leaderboard(scores),
    }

    if view == gs.VIEW_PLAYER:
        team = gs.playing_team_of(me)
        body['team'] = team
        body['teamPoints'] = int(scores.get(team, 0))

    if view == gs.VIEW_GM:
        body['teams'] = sorted(scores.keys(), key=int)
        body['limits'] = {
            'points': gs.MAX_POINTS,
            'worldPoints': gs.MAX_WORLD_POINTS,
        }

    return json_response(200, body)


def handle_award(event):
    body = parse_body(event)
    if body is None:
        return json_response(400, {'message': 'Invalid JSON'})

    my_id = (body.get('id') or '').strip()
    if not my_id:
        return json_response(401, {'message': 'Unauthorized'})

    me = fetch_participant(my_id)
    if not me:
        return json_response(404, {'message': 'Participant not found'})
    if not gs.is_game_master(me):
        return json_response(403, {'message': 'Forbidden'})

    award, error = read_award(body)
    if error:
        return json_response(400, {'status': 'rejected', 'reason': error})

    now = now_ms()
    item = {
        'award_id': award['award_id'],
        'game_id': gs.GAME_ID,
        'team': award['team'],
        'points': award['points'],
        'world_points': award['world_points'],
        'gm_id': me.get('id'),
        'gm_name': me.get('name', ''),
        'source': award['source'],
        'created_at_ms': award['created_at_ms'] or now,
        'received_at_ms': now,
        'status': 'applied',
        'ttl': int(time.time()) + AWARD_TTL_DAYS * 86400,
    }

    # A negative award may not take a team below zero.
    floor = -award['points'] if award['points'] < 0 else 0

    try:
        ddb_client.transact_write_items(TransactItems=[
            {
                'Put': {
                    'TableName': AWARDS_TABLE,
                    'Item': to_ddb(item),
                    # Idempotency: a lost response must not award twice.
                    'ConditionExpression': 'attribute_not_exists(award_id)',
                },
            },
            {
                'Update': {
                    'TableName': STATE_TABLE,
                    'Key': to_ddb({'game_id': gs.GAME_ID}),
                    'UpdateExpression': (
                        'SET scores.#t = scores.#t + :p, #v = #v + :one'
                    ),
                    'ConditionExpression': (
                        '#s = :running AND scores.#t >= :floor'
                    ),
                    'ExpressionAttributeNames': {
                        '#t': award['team'],
                        '#s': 'status',
                        '#v': 'version',
                    },
                    'ExpressionAttributeValues': to_ddb({
                        ':p': award['points'],
                        ':one': 1,
                        ':running': gs.STATUS_RUNNING,
                        ':floor': floor,
                    }),
                },
            },
        ])
    except ClientError as err:
        if err.response['Error']['Code'] != 'TransactionCanceledException':
            raise
        reasons = err.response.get('CancellationReasons') or []
        return handle_cancelled(reasons, award, item)

    enqueue_world_points(award)
    return json_response(201, {'status': 'applied', 'duplicate': False})


def handle_cancelled(reasons, award, item):
    award_failed = reason_code(reasons, 0) == 'ConditionalCheckFailed'
    state_failed = reason_code(reasons, 1) == 'ConditionalCheckFailed'

    if award_failed:
        # Already applied. Re-send the world points anyway: recovers them if the
        # first send failed, and dedup refuses the copy if it did not.
        enqueue_world_points(award)
        return json_response(200, {'status': 'applied', 'duplicate': True})

    if state_failed:
        reason = classify_rejection(fetch_state(), award)
        record_rejection(item, reason)
        return json_response(409, {'status': 'rejected', 'reason': reason})

    logger.error('Unexpected transaction cancellation: %s', reasons)
    return json_response(500, {'message': 'Server error'})


def classify_rejection(state, award):
    if not state or state.get('status') != gs.STATUS_RUNNING:
        return 'not_running'

    scores = state.get('scores') or {}
    if award['team'] not in scores:
        return 'invalid_team'
    if award['points'] < 0 and int(scores[award['team']]) < -award['points']:
        return 'insufficient_points'
    return 'rejected'


def record_rejection(item, reason):
    item = dict(item, status='rejected', reject_reason=reason)
    try:
        ddb.Table(AWARDS_TABLE).put_item(
            Item=item,
            ConditionExpression='attribute_not_exists(award_id)',
        )
    except ClientError as err:
        if err.response['Error']['Code'] != 'ConditionalCheckFailedException':
            raise


def enqueue_world_points(award):
    if award['world_points'] <= 0:
        return
    sqs.send_message(
        QueueUrl=WORLD_POINTS_QUEUE_URL,
        MessageBody=json.dumps({
            'award_id': award['award_id'],
            'world_points': award['world_points'],
        }),
        MessageGroupId='world',
        MessageDeduplicationId=award['award_id'],
    )


def handle_history(event):
    query = event.get('queryStringParameters') or {}
    my_id = (query.get('id') or '').strip()
    if not my_id:
        return json_response(401, {'message': 'Unauthorized'})

    me = fetch_participant(my_id)
    if not me:
        return json_response(404, {'message': 'Participant not found'})
    if not gs.is_game_master(me):
        return json_response(403, {'message': 'Forbidden'})

    res = ddb.Table(AWARDS_TABLE).query(
        IndexName='byGame',
        KeyConditionExpression=Key('game_id').eq(gs.GAME_ID),
        ScanIndexForward=False,
        Limit=HISTORY_LIMIT,
    )

    return json_response(200, {
        'awards': [to_award(item) for item in res.get('Items', [])],
    })


def to_award(item):
    award = {
        'awardId': item.get('award_id'),
        'team': item.get('team'),
        'points': int(item.get('points', 0)),
        'worldPoints': int(item.get('world_points', 0)),
        'gmId': item.get('gm_id'),
        'gmName': item.get('gm_name', ''),
        'source': item.get('source', 'manual'),
        'createdAt': int(item.get('created_at_ms', 0)),
        'receivedAt': int(item.get('received_at_ms', 0)),
        'status': item.get('status', 'applied'),
    }
    if item.get('reject_reason'):
        award['reason'] = item['reject_reason']
    return award


def read_award(body):
    award_id = (body.get('awardId') or '').strip()
    if not award_id or len(award_id) > MAX_AWARD_ID_LENGTH:
        return None, 'invalid_award_id'

    team = str(body.get('team') or '').strip()
    if not gs.is_team_number(team):
        return None, 'invalid_team'
    # Whether the team exists is settled by the update condition; the scores
    # map is the only authority on who is playing.
    team = str(int(team))

    points, error = read_int(body.get('points'), gs.MAX_POINTS, allow_negative=True)
    if error:
        return None, 'invalid_points'

    world_points, error = read_int(body.get('worldPoints'), gs.MAX_WORLD_POINTS)
    if error:
        return None, 'invalid_world_points'

    source = body.get('source') if body.get('source') in ('qr', 'manual') else 'manual'

    created_at_ms = 0
    try:
        created_at_ms = int(body.get('createdAt') or 0)
    except (ValueError, TypeError):
        created_at_ms = 0

    return {
        'award_id': award_id,
        'team': team,
        'points': points,
        'world_points': world_points,
        'source': source,
        'created_at_ms': created_at_ms,
    }, None


def read_int(raw, limit, allow_negative=False):
    if raw is None or raw == '':
        return 0, None
    try:
        value = int(raw)
    except (ValueError, TypeError):
        return 0, 'invalid'
    if not allow_negative and value < 0:
        return 0, 'invalid'
    if abs(value) > limit:
        return 0, 'invalid'
    return value, None


def reason_code(reasons, index):
    if index >= len(reasons):
        return None
    return (reasons[index] or {}).get('Code')


def to_ddb(mapping):
    """The low-level shapes transact_write_items needs."""
    return {key: serializer.serialize(value) for key, value in mapping.items()}


def parse_body(event):
    try:
        return json.loads(event.get('body') or '{}')
    except Exception:
        return None


def now_ms():
    return int(time.time() * 1000)


def fetch_participant(user_id):
    res = ddb.Table(PARTICIPANTS_TABLE).get_item(Key={'id': user_id})
    return res.get('Item')


def fetch_state():
    res = ddb.Table(STATE_TABLE).get_item(Key={'game_id': gs.GAME_ID})
    return res.get('Item')
