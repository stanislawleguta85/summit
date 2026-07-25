import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View, ActivityIndicator } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import DevSignOut from '@/components/dev-signout';
import DevAdminToggle from '@/components/dev-admin-toggle';
import AppTabs from '@/components/app-tabs';
import { AuthProvider, useAuth } from '@/context/auth-context';
import PendingScreen from './pending';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, loading, userProfile } = useAuth();

  if (loading) {
    return <AnimatedSplashOverlay />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {!session ? (
        // Auth Screens (Login/Signup)
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="auth" options={{ animationEnabled: false }} />
        </Stack>
      ) : userProfile?.status === 'pending' ? (
        // Pending Screen - User wartet auf Bestätigung
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="pending" options={{ animationEnabled: false }} />
        </Stack>
      ) : (
        // App Screens (Tabs + andere Screens) - nur für approved Users
        <>
          <AnimatedSplashOverlay />
          <DevSignOut />
          <DevAdminToggle onChange={() => { /* noop - AuthContext reads storage */ }} />
          <AppTabs />
        </>
      )}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
