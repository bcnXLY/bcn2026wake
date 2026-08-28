"""Shared rules for "The Finite ONE".

World health is life points: one float the backend owns. tick.py is the only
writer; game.py projects the same formula forward on read. `pace` never leaves
the backend.
"""
import os
from decimal import Decimal

from util import PERM_GAME_MASTER, has_permission

GAME_ID = 'finite-one'

MAX_HEALTH = Decimal('100')
MIN_HEALTH = Decimal('0')
DEFAULT_PACE = Decimal('1')

STATUS_IDLE = 'idle'
STATUS_RUNNING = 'running'
STATUS_ENDED = 'ended'

ROLE_MEMBER = 0
ROLE_LEADER = 1
PLAYER_ROLES = (ROLE_MEMBER, ROLE_LEADER)

VIEW_PLAYER = 'player'
VIEW_SPECTATOR = 'spectator'
VIEW_GM = 'gm'

# The per-award ceiling, so a slip of the thumb cannot end the game: the score
# one submission may move. World points have no ceiling of their own — the
# price below turns this one into theirs.
MAX_POINTS = int(os.environ.get('MAX_POINTS', '1000'))
WORLD_POINT_COST = int(os.environ.get('WORLD_POINT_COST', '10'))

# team_0 is the staff team and does not play.
NO_TEAM = {'unassigned', 'team_0', ''}

MS_PER_MINUTE = Decimal('60000')


def to_decimal(value, fallback):
    if value is None:
        return fallback
    try:
        return Decimal(str(value))
    except Exception:
        return fallback


def clamp_health(value):
    return max(MIN_HEALTH, min(MAX_HEALTH, value))


def project_health(state, now_ms):
    """Stored health minus pace × minutes since the last tick."""
    health = to_decimal(state.get('world_health'), MAX_HEALTH)
    if state.get('status') != STATUS_RUNNING:
        return clamp_health(health)

    last_tick_ms = int(state.get('last_tick_ms') or 0)
    if not last_tick_ms or now_ms <= last_tick_ms:
        return clamp_health(health)

    pace = to_decimal(state.get('pace'), DEFAULT_PACE)
    elapsed_minutes = Decimal(now_ms - last_tick_ms) / MS_PER_MINUTE
    return clamp_health(health - pace * elapsed_minutes)


def get_role(participant):
    try:
        return int(participant.get('role', 0))
    except (ValueError, TypeError):
        return 0


def playing_team_of(participant):
    """The team this person plays for, or '' for staff and unassigned."""
    team_id = participant.get('team_id') or ''
    if team_id in NO_TEAM:
        return ''
    return ''.join(c for c in team_id if c.isdigit())


def is_team_number(team):
    try:
        return int(team) > 0
    except (ValueError, TypeError):
        return False


def is_game_master(participant):
    return has_permission(participant, PERM_GAME_MASTER)


def view_for(participant):
    """Which dashboard this person gets. From the roster, never the request."""
    if is_game_master(participant):
        return VIEW_GM
    if get_role(participant) in PLAYER_ROLES and playing_team_of(participant):
        return VIEW_PLAYER
    return VIEW_SPECTATOR


def max_world_points():
    """The biggest sacrifice one award can pay for. Derived, not configured."""
    return MAX_POINTS // WORLD_POINT_COST


def sacrifice_cost(world_points):
    """What a team pays for `world_points` of world health. Never positive."""
    if world_points <= 0:
        return 0
    return -int(world_points) * WORLD_POINT_COST


def is_paid_sacrifice(points, world_points):
    """World health is bought, never given, and the price is exact."""
    return world_points <= 0 or points == sacrifice_cost(world_points)


def leaderboard(scores):
    rows = sorted(
        ((team, int(score)) for team, score in (scores or {}).items()),
        key=lambda row: (-row[1], int(row[0])),
    )

    ranked = []
    previous_score = None
    shared_rank = 0
    for position, (team, score) in enumerate(rows, start=1):
        if score != previous_score:
            shared_rank = position
            previous_score = score
        ranked.append({'rank': shared_rank, 'team': team, 'points': score})
    return ranked
