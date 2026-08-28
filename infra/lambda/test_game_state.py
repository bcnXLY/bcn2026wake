"""Tests for the parts of the game that have to be exactly right.

    cd infra/lambda && python -m unittest test_game_state -v

No dependencies beyond the standard library — game_state.py deliberately
imports nothing from boto3 so it can be tested on its own.
"""
import unittest
from decimal import Decimal

import game_state as gs

MINUTE = 60_000
T0 = 1_788_000_000_000


def running(health, pace, last_tick=T0, **extra):
    return dict(
        {
            'status': gs.STATUS_RUNNING,
            'world_health': Decimal(str(health)),
            'pace': Decimal(str(pace)),
            'last_tick_ms': last_tick,
        },
        **extra,
    )


class ProjectHealth(unittest.TestCase):
    def test_subtracts_pace_times_minutes(self):
        state = running(100, 1)
        self.assertEqual(gs.project_health(state, T0 + 10 * MINUTE), Decimal('90'))

    def test_pace_scales_the_rate(self):
        state = running(100, 1.6)
        self.assertEqual(gs.project_health(state, T0 + 10 * MINUTE), Decimal('84'))

    def test_pace_zero_freezes_the_meter(self):
        state = running(72.5, 0)
        self.assertEqual(gs.project_health(state, T0 + 45 * MINUTE), Decimal('72.5'))

    def test_partial_minutes_count(self):
        state = running(100, 1)
        self.assertEqual(gs.project_health(state, T0 + 30_000), Decimal('99.5'))

    def test_floors_at_zero(self):
        state = running(5, 1)
        self.assertEqual(gs.project_health(state, T0 + 90 * MINUTE), gs.MIN_HEALTH)

    def test_ceilings_at_one_hundred(self):
        # Sacrifices can push health past the starting value; the meter is a
        # percentage, so the surplus is absorbed rather than displayed.
        state = running(140, 1)
        self.assertEqual(gs.project_health(state, T0 + 10 * MINUTE), gs.MAX_HEALTH)

    def test_idle_game_does_not_decay(self):
        state = running(100, 1)
        state['status'] = gs.STATUS_IDLE
        self.assertEqual(gs.project_health(state, T0 + 40 * MINUTE), Decimal('100'))

    def test_ended_game_freezes_where_it_stopped(self):
        state = running(37.5, 1)
        state['status'] = gs.STATUS_ENDED
        self.assertEqual(gs.project_health(state, T0 + 40 * MINUTE), Decimal('37.5'))

    def test_clock_skew_backwards_does_not_refund_health(self):
        state = running(80, 1)
        self.assertEqual(gs.project_health(state, T0 - 5 * MINUTE), Decimal('80'))

    def test_missing_last_tick_does_not_charge_since_the_epoch(self):
        state = running(100, 1, last_tick=0)
        self.assertEqual(gs.project_health(state, T0), Decimal('100'))

    def test_a_pace_change_never_rewrites_survived_time(self):
        """What set_pace.py does: settle at the old pace, then switch."""
        state = running(100, 0.6)
        settled = gs.project_health(state, T0 + 40 * MINUTE)
        self.assertEqual(settled, Decimal('76'))

        faster = running(settled, 1.6, last_tick=T0 + 40 * MINUTE)
        # The meter bends from 76 — it does not jump to what a flat 1.6x
        # since t=0 would have produced (36).
        self.assertEqual(gs.project_health(faster, T0 + 40 * MINUTE), Decimal('76'))
        self.assertEqual(gs.project_health(faster, T0 + 50 * MINUTE), Decimal('60'))


class Leaderboard(unittest.TestCase):
    def test_orders_by_points_descending(self):
        ranked = gs.leaderboard({'1': 10, '2': 30, '3': 20})
        self.assertEqual([r['team'] for r in ranked], ['2', '3', '1'])

    def test_carries_each_team_points(self):
        ranked = gs.leaderboard({'1': 10, '2': 30})
        self.assertEqual(set(ranked[0].keys()), {'rank', 'team', 'points'})
        self.assertEqual([r['points'] for r in ranked], [30, 10])

    def test_points_are_plain_ints_not_decimals(self):
        # DynamoDB hands back Decimals; json_response cannot serialise them.
        ranked = gs.leaderboard({'1': Decimal('40'), '2': Decimal('12')})
        self.assertEqual([type(r['points']) for r in ranked], [int, int])

    def test_ties_share_a_rank(self):
        ranked = gs.leaderboard({'1': 30, '2': 30, '3': 10})
        self.assertEqual([r['rank'] for r in ranked], [1, 1, 3])
        self.assertEqual([r['points'] for r in ranked], [30, 30, 10])

    def test_tied_teams_order_by_number_not_arbitrarily(self):
        ranked = gs.leaderboard({'10': 5, '2': 5, '7': 5})
        self.assertEqual([r['team'] for r in ranked], ['2', '7', '10'])

    def test_empty_scores(self):
        self.assertEqual(gs.leaderboard({}), [])
        self.assertEqual(gs.leaderboard(None), [])


class SacrificePrice(unittest.TestCase):
    """World health is bought with score, at WORLD_POINT_COST per point."""

    def test_cost_is_negative_and_proportional(self):
        self.assertEqual(gs.sacrifice_cost(1), -gs.WORLD_POINT_COST)
        self.assertEqual(gs.sacrifice_cost(3), -3 * gs.WORLD_POINT_COST)

    def test_no_world_points_costs_nothing(self):
        self.assertEqual(gs.sacrifice_cost(0), 0)
        self.assertEqual(gs.sacrifice_cost(-5), 0)

    def test_exact_payment_is_accepted(self):
        self.assertTrue(gs.is_paid_sacrifice(-2 * gs.WORLD_POINT_COST, 2))

    def test_unpaid_or_underpaid_world_points_are_refused(self):
        for points in (0, 5, -1, -gs.WORLD_POINT_COST):
            self.assertFalse(gs.is_paid_sacrifice(points, 2))

    def test_overpaying_is_refused_too(self):
        # The price is exact, so the history reads the same for every sacrifice.
        self.assertFalse(gs.is_paid_sacrifice(-3 * gs.WORLD_POINT_COST, 2))

    def test_awards_without_world_points_are_unaffected(self):
        for points in (0, 40, -40):
            self.assertTrue(gs.is_paid_sacrifice(points, 0))

    def test_the_ceiling_is_derived_from_what_a_team_can_be_charged(self):
        # World points carry no clamp of their own: MAX_POINTS is the only
        # per-award ceiling, and the price turns it into one for sacrifices.
        self.assertEqual(gs.max_world_points(), gs.MAX_POINTS // gs.WORLD_POINT_COST)

    def test_the_biggest_sacrifice_is_payable_within_the_points_clamp(self):
        cost = gs.sacrifice_cost(gs.max_world_points())
        self.assertLessEqual(abs(cost), gs.MAX_POINTS)

    def test_one_world_point_past_the_ceiling_cannot_be_paid_for(self):
        # read_award reads the score against MAX_POINTS before it checks the
        # price, so an over-large sacrifice has no payable score to carry.
        cost = gs.sacrifice_cost(gs.max_world_points() + 1)
        self.assertGreater(abs(cost), gs.MAX_POINTS)


class TeamsAndViews(unittest.TestCase):
    def test_player_team_parsed_from_roster_id(self):
        self.assertEqual(gs.playing_team_of({'team_id': 'team_7'}), '7')
        self.assertEqual(gs.playing_team_of({'team_id': 'team_30'}), '30')

    def test_staff_team_and_unassigned_have_no_playing_team(self):
        self.assertEqual(gs.playing_team_of({'team_id': 'team_0'}), '')
        self.assertEqual(gs.playing_team_of({'team_id': 'unassigned'}), '')
        self.assertEqual(gs.playing_team_of({}), '')

    def test_is_team_number(self):
        self.assertTrue(gs.is_team_number('7'))
        self.assertFalse(gs.is_team_number('0'))
        self.assertFalse(gs.is_team_number('-1'))
        self.assertFalse(gs.is_team_number('abc'))

    def test_members_and_leaders_on_a_team_are_players(self):
        self.assertEqual(gs.view_for({'role': 0, 'team_id': 'team_3'}), gs.VIEW_PLAYER)
        self.assertEqual(gs.view_for({'role': 1, 'team_id': 'team_3'}), gs.VIEW_PLAYER)

    def test_game_master_view(self):
        self.assertEqual(
            gs.view_for({'role': 0, 'team_id': 'team_0', 'permissions': [2]}), gs.VIEW_GM
        )

    def test_permission_two_outranks_a_playing_team(self):
        self.assertEqual(
            gs.view_for({'role': 1, 'team_id': 'team_3', 'permissions': [1, 2]}),
            gs.VIEW_GM,
        )

    def test_role_eight_alone_is_no_longer_a_game_master(self):
        self.assertEqual(gs.view_for({'role': 8, 'team_id': 'team_0'}), gs.VIEW_SPECTATOR)

    def test_other_permissions_do_not_grant_the_gm_view(self):
        self.assertEqual(
            gs.view_for({'role': 8, 'team_id': 'team_0', 'permissions': [1, 3]}),
            gs.VIEW_SPECTATOR,
        )

    def test_staff_are_spectators(self):
        for role in (2, 3, 4, 5, 6, 7, 8, 9, 10):
            self.assertEqual(
                gs.view_for({'role': role, 'team_id': 'team_0'}), gs.VIEW_SPECTATOR
            )

    def test_unassigned_players_are_spectators_not_broken_players(self):
        # Four people on the roster sit in `unassigned` with a player role.
        self.assertEqual(
            gs.view_for({'role': 0, 'team_id': 'unassigned'}), gs.VIEW_SPECTATOR
        )
        self.assertEqual(
            gs.view_for({'role': 1, 'team_id': 'unassigned'}), gs.VIEW_SPECTATOR
        )

    def test_role_stored_as_a_string_still_resolves(self):
        self.assertEqual(gs.view_for({'role': '1', 'team_id': 'team_3'}), gs.VIEW_PLAYER)

    def test_permissions_stored_as_strings_or_decimals_still_resolve(self):
        self.assertEqual(
            gs.view_for({'role': 0, 'team_id': 'team_0', 'permissions': ['2']}),
            gs.VIEW_GM,
        )
        self.assertEqual(
            gs.view_for(
                {'role': 0, 'team_id': 'team_0', 'permissions': [Decimal('2')]}
            ),
            gs.VIEW_GM,
        )

    def test_missing_or_junk_permissions_are_not_game_masters(self):
        for permissions in (None, [], ['abc'], [{}]):
            self.assertFalse(gs.is_game_master({'permissions': permissions}))
        self.assertFalse(gs.is_game_master({}))


if __name__ == '__main__':
    unittest.main()
