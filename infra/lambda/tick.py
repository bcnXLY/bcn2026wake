"""The Finite ONE — the clock that kills the world.

Runs once a minute: drain the world-points queue, then subtract pace × minutes
since the last tick. Sacrifices apply first and the state is re-read in between,
so one landing in the same tick is not overwritten by the decay.
"""
import os
import json
import time
import logging
from decimal import Decimal

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError

import game_state as gs

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ddb = boto3.resource('dynamodb')
ddb_client = boto3.client('dynamodb')
sqs = boto3.client('sqs')
serializer = TypeSerializer()

STATE_TABLE = os.environ.get('GAME_STATE_TABLE', '')
AWARDS_TABLE = os.environ.get('GAME_AWARDS_TABLE', '')
WORLD_POINTS_QUEUE_URL = os.environ.get('WORLD_POINTS_QUEUE_URL', '')

RECEIVE_ROUNDS = 12
RECEIVE_BATCH = 10


def lambda_handler(event, context):
    state = fetch_state()
    if not state or state.get('status') != gs.STATUS_RUNNING:
        return {'skipped': 'not_running'}

    applied = drain_world_points()
    result = apply_decay()
    result['worldPointsApplied'] = applied
    logger.info('tick %s', result)
    return result


def drain_world_points():
    total = 0

    for _ in range(RECEIVE_ROUNDS):
        res = sqs.receive_message(
            QueueUrl=WORLD_POINTS_QUEUE_URL,
            MaxNumberOfMessages=RECEIVE_BATCH,
            WaitTimeSeconds=0,
            VisibilityTimeout=60,
        )
        messages = res.get('Messages') or []
        if not messages:
            break

        for message in messages:
            try:
                total += apply_one(message)
            except Exception:
                logger.exception('Could not apply world points, leaving queued')
                continue
            sqs.delete_message(
                QueueUrl=WORLD_POINTS_QUEUE_URL,
                ReceiptHandle=message['ReceiptHandle'],
            )

        if len(messages) < RECEIVE_BATCH:
            break

    return total


def apply_one(message):
    body = json.loads(message['Body'])
    award_id = body.get('award_id')
    points = int(body.get('world_points') or 0)
    if not award_id or points <= 0:
        return 0

    try:
        ddb_client.transact_write_items(TransactItems=[
            {
                'Update': {
                    'TableName': AWARDS_TABLE,
                    'Key': to_ddb({'award_id': award_id}),
                    'UpdateExpression': 'SET world_applied = :true',
                    # Exactly-once even if SQS redelivers. attribute_exists
                    # stops an Update conjuring a row a --reset just removed.
                    'ConditionExpression': (
                        'attribute_exists(award_id) AND attribute_not_exists(world_applied)'
                    ),
                    'ExpressionAttributeValues': to_ddb({':true': True}),
                },
            },
            {
                'Update': {
                    'TableName': STATE_TABLE,
                    'Key': to_ddb({'game_id': gs.GAME_ID}),
                    # Atomic increment: cannot collide with the decay write.
                    'UpdateExpression': (
                        'SET world_health = world_health + :p, #v = #v + :one'
                    ),
                    'ExpressionAttributeNames': {'#v': 'version'},
                    'ExpressionAttributeValues': to_ddb({':p': points, ':one': 1}),
                },
            },
        ])
    except ClientError as err:
        if err.response['Error']['Code'] == 'TransactionCanceledException':
            logger.info('World points for %s already applied', award_id)
            return 0
        raise

    return points


def apply_decay():
    # Re-read so a sacrifice applied moments ago is part of the base.
    state = fetch_state()
    if not state or state.get('status') != gs.STATUS_RUNNING:
        return {'skipped': 'not_running'}

    last_tick_ms = int(state.get('last_tick_ms') or 0)
    if not last_tick_ms:
        # Never started cleanly — anchor the clock rather than bill the epoch.
        ddb.Table(STATE_TABLE).update_item(
            Key={'game_id': gs.GAME_ID},
            UpdateExpression='SET last_tick_ms = :now',
            ExpressionAttributeValues={':now': now_ms()},
        )
        return {'skipped': 'no_last_tick'}

    now = now_ms()
    health = gs.project_health(state, now)
    collapsed = health <= gs.MIN_HEALTH

    update = 'SET world_health = :h, last_tick_ms = :now, #v = #v + :one'
    names = {'#v': 'version'}
    values = {':h': health, ':now': now, ':one': 1, ':last': last_tick_ms}

    if collapsed:
        update += ', #s = :ended, collapsed_at_ms = :now'
        names['#s'] = 'status'
        values[':ended'] = gs.STATUS_ENDED

    try:
        ddb.Table(STATE_TABLE).update_item(
            Key={'game_id': gs.GAME_ID},
            UpdateExpression=update,
            # Optimistic lock: if another tick already charged for these
            # minutes, this one does nothing rather than charging twice.
            ConditionExpression='last_tick_ms = :last',
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
        )
    except ClientError as err:
        if err.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return {'skipped': 'already_ticked'}
        raise

    return {'worldHealth': float(health), 'collapsed': collapsed}


def to_ddb(mapping):
    return {key: serializer.serialize(value) for key, value in mapping.items()}


def now_ms():
    return int(time.time() * 1000)


def fetch_state():
    res = ddb.Table(STATE_TABLE).get_item(Key={'game_id': gs.GAME_ID})
    return res.get('Item')
