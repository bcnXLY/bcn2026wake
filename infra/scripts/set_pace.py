#!/usr/bin/env python3
"""Steer how fast the world dies.

`pace` is life points lost per minute. It is a private attribute: it lives only
in DynamoDB and never appears in an API response or in the client bundle.

    python set_pace.py 1.6      # from now on, 1.6 life points per minute
    python set_pace.py 0        # freeze the meter
    python set_pace.py --status # where things stand right now

Changing the pace is always safe mid-game. The tick charges for the minutes
since it last ran before the new pace applies, so the meter bends rather than
jumping.
"""
import argparse
import sys
import time
from decimal import Decimal

import boto3

REGION = 'eu-west-3'
GAME_ID = 'finite-one'
STATE_TABLE = 'GameState'

ddb = boto3.resource('dynamodb', region_name=REGION)


def now_ms():
    return int(time.time() * 1000)


def fetch_state():
    item = ddb.Table(STATE_TABLE).get_item(Key={'game_id': GAME_ID}).get('Item')
    if not item:
        sys.exit('No game found. Run start_game.py first.')
    return item


def projected_health(state, now):
    """Mirrors game_state.project_health so --status matches what players see."""
    health = Decimal(str(state.get('world_health', 100)))
    if state.get('status') != 'running':
        return health
    last_tick = int(state.get('last_tick_ms') or 0)
    if not last_tick or now <= last_tick:
        return health
    pace = Decimal(str(state.get('pace', 1)))
    elapsed = Decimal(now - last_tick) / Decimal(60000)
    return max(Decimal(0), min(Decimal(100), health - pace * elapsed))


def show_status(state):
    now = now_ms()
    health = projected_health(state, now)
    pace = Decimal(str(state.get('pace', 1)))
    status = state.get('status', 'idle')
    started = int(state.get('started_at_ms') or 0)

    print(f'\n  status       : {status}')
    print(f'  world health : {health:.1f}')
    print(f'  pace         : {pace} per minute')

    if started:
        print(f'  elapsed      : {(now - started) / 60000:.0f} min')

    if status == 'running':
        if pace > 0:
            print(f'  collapse in  : {health / pace:.0f} min at this pace')
        else:
            print('  collapse in  : never — the meter is frozen')

    scores = state.get('scores') or {}
    if scores:
        top = sorted(scores.items(), key=lambda kv: (-int(kv[1]), int(kv[0])))[:3]
        leaders = ', '.join(f'team {team} ({int(pts)})' for team, pts in top)
        print(f'  leading      : {leaders}')
    print()


def set_pace(state, pace):
    now = now_ms()

    # Settle the minutes owed at the OLD pace before the new one starts, so a
    # pace change never retroactively rewrites time already survived.
    ddb.Table(STATE_TABLE).update_item(
        Key={'game_id': GAME_ID},
        UpdateExpression=(
            'SET world_health = :h, last_tick_ms = :now, #pace = :pace, '
            '#v = #v + :one'
        ),
        ExpressionAttributeNames={'#pace': 'pace', '#v': 'version'},
        ExpressionAttributeValues={
            ':h': projected_health(state, now),
            ':now': now,
            ':pace': Decimal(str(pace)),
            ':one': 1,
        },
    )

    updated = fetch_state()
    print(f'\nPace is now {pace} life points per minute.')
    show_status(updated)


def main():
    parser = argparse.ArgumentParser(description='Set the world decay pace.')
    parser.add_argument('pace', type=float, nargs='?',
                        help='life points lost per minute (0 freezes the meter)')
    parser.add_argument('--status', action='store_true',
                        help='show health, pace and time to collapse')
    args = parser.parse_args()

    state = fetch_state()

    if args.status or args.pace is None:
        show_status(state)
        return

    if args.pace < 0:
        sys.exit('Pace cannot be negative. Use 0 to freeze the meter.')

    set_pace(state, args.pace)


if __name__ == '__main__':
    main()
