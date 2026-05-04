import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../src/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.cyan,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.glassBorder,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 8,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
        tabBarIcon: ({ color, size }) => {
          const icon: any = {
            dashboard: 'pulse',
            schedule: 'time',
            history: 'analytics',
            profile: 'person-circle',
          }[route.name] || 'ellipse';
          return <Ionicons name={icon} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'LIVE' }} />
      <Tabs.Screen name="schedule" options={{ title: 'SCHEDULE' }} />
      <Tabs.Screen name="history" options={{ title: 'HISTORY' }} />
      <Tabs.Screen name="profile" options={{ title: 'PROFILE' }} />
    </Tabs>
  );
}
