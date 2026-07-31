import { useState } from 'react';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import PushBanner from '../components/PushBanner';
import ProfileTab from '../components/tabs/ProfileTab';
import ScheduleTab from '../components/tabs/ScheduleTab';
import MessagesTab from '../components/tabs/MessagesTab';
import GalleryTab from '../components/tabs/GalleryTab';
import ContactsTab from '../components/tabs/ContactsTab';
import type { TabKey } from '../types';

export default function Dashboard() {
  const [tab, setTab] = useState<TabKey>('schedule');

  return (
    <div className="app-shell">
      <Header />
      <main className="app-body">
        <PushBanner />
        {tab === 'schedule' && <ScheduleTab />}
        {tab === 'messages' && <MessagesTab />}
        {tab === 'profile' && <ProfileTab />}
        {tab === 'gallery' && <GalleryTab />}
        {tab === 'contacts' && <ContactsTab />}
      </main>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
