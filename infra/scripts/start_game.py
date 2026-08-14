#!/usr/bin/env python3
"""Start, reset or end "The Finite ONE".

No fixed duration — the game runs until you end it or the world reaches zero.
Talks to DynamoDB directly, never through the API.

    python start_game.py                 # world at 100, pace 1.0, running
    python start_game.py --pace 0.6      # start slower
    python start_game.py --reset         # zero the scores, clear the ledger
    python start_game.py --end           # stop the game

--reset also purges the world-points queue, so a rehearsal cannot leak
sacrifices into the real run.
"""
import argparse
import sys
import time
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

REGION = 'eu-west-3'
GAME_ID = 'finite-one'
STATE_TABLE = 'GameState'
AWARDS_TABLE = 'GameAwards'
PARTICIPANTS_TABLE = 'Participants'
QUEUE_NAME = 'FiniteOneWorldPoints.fifo'

# team_0 is the staff team and does not play.
NOT_PLAYING = {'unassigned', 'team_0', ''}

ddb = boto3.resource('dynamodb', region_name=REGION)
sqs = boto3.client('sqs', region_name=REGION)


def playing_teams():
    """The teams on the roster — the only place that knows who plays."""
    table = ddb.Table(PARTICIPANTS_TABLE)
    teams = set()
    kwargs = {'ProjectionExpression': 'team_id'}

    while True:
        res = table.scan(**kwargs)
        for item in res.get('Items', []):
            team_id = item.get('team_id') or ''
            if team_id in NOT_PLAYING:
                continue
            number = ''.join(c for c in team_id if c.isdigit())
            if number:
                teams.add(str(int(number)))
        if 'LastEvaluatedKey' in res:
            kwargs['ExclusiveStartKey'] = res['LastEvaluatedKey']
        else:
            break

    if not teams:
        sys.exit('No teams found on the roster. Seed Participants first.')
    return sorted(teams, key=int)


def now_ms():
    return int(time.time() * 1000)


def queue_url():
    try:
        return sqs.get_queue_url(QueueName=QUEUE_NAME)['QueueUrl']
    except Exception as err:
        print(f'  ! could not resolve the world-points queue: {err}')
        return None


def purge_queue():
    url = queue_url()
    if not url:
        return
    try:
        sqs.purge_queue(QueueUrl=url)
        print('  · world-points queue purged')
    except sqs.exceptions.PurgeQueueInProgress:
        print('  · queue purge already in progress (once per 60s), skipped')


def clear_ledger():
    table = ddb.Table(AWARDS_TABLE)
    deleted = 0
    kwargs = {
        'IndexName': 'byGame',
        'KeyConditionExpression': Key('game_id').eq(GAME_ID),
        'ProjectionExpression': 'award_id',
    }
    while True:
        res = table.query(**kwargs)
        with table.batch_writer() as batch:
            for item in res.get('Items', []):
                batch.delete_item(Key={'award_id': item['award_id']})
                deleted += 1
        if 'LastEvaluatedKey' in res:
            kwargs['ExclusiveStartKey'] = res['LastEvaluatedKey']
        else:
            break
    print(f'  · {deleted} ledger entries deleted')


def end_game():
    ddb.Table(STATE_TABLE).update_item(
        Key={'game_id': GAME_ID},
        UpdateExpression='SET #s = :ended, ended_at_ms = :now',
        ExpressionAttributeNames={'#s': 'status'},
        ExpressionAttributeValues={':ended': 'ended', ':now': now_ms()},
    )
    print('Game ended. The meter is frozen where it stands.')


def start_game(health, pace, reset):
    if reset:
        print('Resetting:')
        clear_ledger()
        purge_queue()

    teams = playing_teams()
    now = now_ms()
    ddb.Table(STATE_TABLE).put_item(Item={
        'game_id': GAME_ID,
        'status': 'running',
        'world_health': Decimal(str(health)),
        'pace': Decimal(str(pace)),
        'last_tick_ms': now,
        'started_at_ms': now,
        # Seeded to 0 so the "may not go below zero" condition has something
        # to compare against, and so this map is the authority on who plays.
        'scores': {team: 0 for team in teams},
        'version': 0,
    })

    print('\nThe Finite ONE is running.')
    print(f'  world health : {health}')
    print(f'  pace         : {pace} per minute  ({minutes_left(health, pace)})')
    print(f'  teams        : {len(teams)} from the roster, all at 0 points')
    print('\nChange the pace at any time:  python set_pace.py <pace>')


def minutes_left(health, pace):
    if pace <= 0:
        return 'frozen'
    return f'{health / pace:.0f} min to collapse if nothing changes'


def main():
    parser = argparse.ArgumentParser(description='Start "The Finite ONE".')
    parser.add_argument('--health', type=float, default=100.0,
                        help='starting life points (default 100)')
    parser.add_argument('--pace', type=float, default=1.0,
                        help='life points lost per minute (default 1.0)')
    parser.add_argument('--reset', action='store_true',
                        help='zero the scores, clear the ledger, purge the queue')
    parser.add_argument('--end', action='store_true',
                        help='stop the game, leaving scores intact')
    parser.add_argument('--force', action='store_true',
                        help='restart even if a game is already running')
    args = parser.parse_args()

    if args.end:
        end_game()
        return

    if args.pace < 0:
        sys.exit('Pace cannot be negative. Use 0 to freeze the meter.')
    if not 0 < args.health <= 100:
        sys.exit('Health must be between 0 and 100.')

    # Starting writes a fresh item, which zeroes every score.
    current = ddb.Table(STATE_TABLE).get_item(Key={'game_id': GAME_ID}).get('Item')
    if current and current.get('status') == 'running' and not args.force:
        sys.exit(
            'The game is already running — starting again would reset every '
            'score to 0.\nUse --force if that is what you want, or --end to '
            'stop it first.'
        )

    if args.reset:
        confirm = input('This wipes every score and the award history. Type "reset": ')
        if confirm.strip().lower() != 'reset':
            sys.exit('Cancelled.')

    start_game(args.health, args.pace, args.reset)


if __name__ == '__main__':
    main()
