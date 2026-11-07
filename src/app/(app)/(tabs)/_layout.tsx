import { TabList, TabSlot, Tabs, TabTrigger } from 'expo-router/ui';

import { TabBar } from '@/components/TabBar';
import { useIsDesktop } from '@/lib/prefs';

export default function TabsLayout() {
  const desktop = useIsDesktop();
  return (
    <Tabs>
      {/* expo-router/ui gives the slot flexShrink:0, which lets it grow past the window and breaks scrolling on web. */}
      <TabSlot style={{ flex: 1, flexShrink: 1, minHeight: 0 }} />
      {/* Declares the routes; the visible navigation is <TabBar/> (mobile) or <Sidebar/> (desktop). */}
      <TabList style={{ display: 'none' }}>
        <TabTrigger name="index" href="/" />
        <TabTrigger name="ipon" href="/ipon" />
        <TabTrigger name="circles" href="/circles" />
        <TabTrigger name="activity" href="/activity" />
        <TabTrigger name="profile" href="/profile" />
      </TabList>
      {!desktop && <TabBar />}
    </Tabs>
  );
}
