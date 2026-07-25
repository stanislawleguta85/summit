import React from 'react';
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animationEnabled: true,
      }}
    >
      <Stack.Screen name="login" options={{ title: 'Anmelden' }} />
      <Stack.Screen name="signup" options={{ title: 'Registrieren' }} />
    </Stack>
  );
}
