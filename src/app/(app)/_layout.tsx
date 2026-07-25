import React from 'react';
import { Stack } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@/context/auth-context';

export default function AppLayout() {
  const { loading, userProfile } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#208AEF" />
      </View>
    );
  }

  // Wenn User pending ist, nur Pending Screen anzeigen
  if (userProfile?.status === 'pending') {
    return (
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="pending" options={{ animationEnabled: false }} />
      </Stack>
    );
  }

  // Wenn User approved ist, normale App Navigation
  if (userProfile?.status === 'approved') {
    return (
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animationEnabled: false }} />
        <Stack.Screen name="admin-panel" options={{ presentation: 'modal' }} />
      </Stack>
    );
  }

  // Fallback für rejected oder andere Status
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="pending" options={{ animationEnabled: false }} />
    </Stack>
  );
}
