import { TabList, TabSlot, Tabs, TabTrigger } from 'expo-router/ui';

import { TabBar } from '@/components/TabBar';

export default function TabsLayout() {
  return (
    <Tabs>
      <TabSlot />
      {/* Declares the routes; the visible bar is the custom <TabBar/>. */}
      <TabList style={{ display: 'none' }}>
        <TabTrigger name="index" href="/" />
        <TabTrigger name="circles" href="/circles" />
        <TabTrigger name="activity" href="/activity" />
        <TabTrigger name="profile" href="/profile" />
      </TabList>
      <TabBar />
    </Tabs>
  );
}
