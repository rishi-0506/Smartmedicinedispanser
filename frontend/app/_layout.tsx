import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/auth';
import { PatientProvider } from '../src/patient';
import { theme } from '../src/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <PatientProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.bg },
            animation: 'fade',
          }}
        />
      </PatientProvider>
    </AuthProvider>
  );
}
