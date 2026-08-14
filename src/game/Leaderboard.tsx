import { useTranslation } from 'react-i18next';
import type { LeaderboardEntry } from '../types';

/** Standings without points, for everyone — game masters included. */
export default function Leaderboard({
  entries,
  highlightTeam,
}: {
  entries: LeaderboardEntry[];
  highlightTeam?: string;
}) {
  const { t } = useTranslation();

  if (entries.length === 0) {
    return <p className="fo-empty">{t('game.leaderboard.empty')}</p>;
  }

  return (
    <ol className="fo-board" aria-label={t('game.leaderboard.title')}>
      {entries.map((entry, index) => {
        const isMine = entry.team === highlightTeam;
        const showsRank = index === 0 || entries[index - 1].rank !== entry.rank;
        return (
          <li
            key={entry.team}
            className={`fo-board-row${isMine ? ' mine' : ''}${
              entry.rank <= 3 ? ` top top-${entry.rank}` : ''
            }`}
          >
            <span className="fo-board-rank">{showsRank ? entry.rank : ''}</span>
            <span className="fo-board-team">
              {t('game.team', { number: entry.team })}
              {isMine && <span className="fo-board-you">{t('game.leaderboard.you')}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
