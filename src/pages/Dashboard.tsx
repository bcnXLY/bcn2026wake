import { useState } from 'react';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import PushBanner from '../components/PushBanner';
import ProfileTab from '../components/tabs/ProfileTab';
import ScheduleTab from '../components/tabs/ScheduleTab';
import GalleryTab from '../components/tabs/GalleryTab';
import ContactsTab from '../components/tabs/ContactsTab';
import type { TabKey } from '../types';

export default function Dashboard() {
  const [tab, setTab] = useState<TabKey>('profile');

  return (
    <div className="app-shell">
      <Header />
      <main className="app-body">
        <PushBanner />
        {tab === 'profile' && <ProfileTab />}
        {tab === 'schedule' && <ScheduleTab />}
        {tab === 'gallery' && <GalleryTab />}
        {tab === 'contacts' && <ContactsTab />}
      </main>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
