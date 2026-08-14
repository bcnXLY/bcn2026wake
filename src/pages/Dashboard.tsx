import { useCallback, useEffect, useState } from 'react';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import PushBanner from '../components/PushBanner';
import ProfileTab from '../components/tabs/ProfileTab';
import ScheduleTab from '../components/tabs/ScheduleTab';
import MessagesTab from '../components/tabs/MessagesTab';
import GalleryTab from '../components/tabs/GalleryTab';
import ContactsTab from '../components/tabs/ContactsTab';
import FiniteOne from '../game/FiniteOne';
import type { TabKey } from '../types';

/** Survives a reload, and an iOS PWA swapped out and back mid-game. */
const GAME_OPEN_KEY = 'bcn2026-game-open';

export default function Dashboard() {
  const [tab, setTab] = useState<TabKey>('schedule');
  const [gameOpen, setGameOpen] = useState(
    () => sessionStorage.getItem(GAME_OPEN_KEY) === '1',
  );

  useEffect(() => {
    if (gameOpen) sessionStorage.setItem(GAME_OPEN_KEY, '1');
    else sessionStorage.removeItem(GAME_OPEN_KEY);
  }, [gameOpen]);

  const closeGame = useCallback(() => setGameOpen(false), []);

  if (gameOpen) return <FiniteOne onExit={closeGame} />;

  return (
    <div className="app-shell">
      <Header />
      <main className="app-body">
        <PushBanner />
        {tab === 'schedule' && <ScheduleTab onEnterGame={() => setGameOpen(true)} />}
        {tab === 'messages' && <MessagesTab />}
        {tab === 'profile' && <ProfileTab />}
        {tab === 'gallery' && <GalleryTab />}
        {tab === 'contacts' && <ContactsTab />}
      </main>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
