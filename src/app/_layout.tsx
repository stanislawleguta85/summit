import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { AuthProvider, useAuth } from '@/context/auth-context';

void SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { isImpersonating, session, loading, userProfile } = useAuth();

  if (loading) {
    return <AnimatedSplashOverlay />;
  }

  const mustChangePassword =
    session !== null &&
    userProfile?.status === 'approved' &&
    userProfile.must_change_password === true &&
    !isImpersonating;
  const isApproved =
    session !== null && userProfile?.status === 'approved' && !mustChangePassword;
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

          <Stack.Protected guard={mustChangePassword}>
            <Stack.Screen name="change-password" options={{ animation: 'none' }} />
          </Stack.Protected>

          <Stack.Protected guard={isApproved}>
            <Stack.Screen name="(app)" options={{ animation: 'none' }} />
            <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="new-course" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="create-member" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="client/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="course/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen
              name="personal-training-service/[id]"
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="training-request/[id]"
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="training-transfer/[id]"
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="booking-change/[id]"
              options={{ animation: 'slide_from_right' }}
            />
          </Stack.Protected>
        </Stack>
      </View>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
