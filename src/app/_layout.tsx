import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { AuthProvider, useAuth } from '@/context/auth-context';

void SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, loading, userProfile } = useAuth();

  if (loading) {
    return <AnimatedSplashOverlay />;
  }

  const isApproved = session !== null && userProfile?.status === 'approved';
  const needsReview = session !== null && userProfile?.status !== 'approved';

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
        <ImpersonationBanner />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={session === null}>
            <Stack.Screen name="auth" options={{ animation: 'none' }} />
          </Stack.Protected>

          <Stack.Protected guard={needsReview}>
            <Stack.Screen name="pending" options={{ animation: 'none' }} />
          </Stack.Protected>

          <Stack.Protected guard={isApproved}>
            <Stack.Screen name="(app)" options={{ animation: 'none' }} />
          </Stack.Protected>
        </Stack>
      </View>
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
