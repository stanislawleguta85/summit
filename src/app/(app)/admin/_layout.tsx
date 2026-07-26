import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AdminColors } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';

export default function AdminLayout() {
  const { authenticatedUserProfile } = useAuth();
  const isOwner =
    authenticatedUserProfile?.role === 'owner' &&
    authenticatedUserProfile.status === 'approved';

  if (!isOwner) {
    return (
      <View style={styles.denied}>
        <Text style={styles.deniedTitle}>Zugriff verweigert</Text>
        <Text style={styles.deniedText}>Dieser Bereich ist nur für Studio-Owner verfügbar.</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: AdminColors.background },
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: AdminColors.background },
        headerTintColor: AdminColors.textPrimary,
        headerTitleStyle: { color: AdminColors.textPrimary, fontWeight: '700' },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="booking-requests" options={{ title: 'Buchungsanfragen' }} />
      <Stack.Screen name="pending-members" options={{ title: 'Neue Mitglieder' }} />
      <Stack.Screen name="courses" options={{ title: 'Kurse & Zeitslots' }} />
      <Stack.Screen name="members" options={{ title: 'Mitglieder & Trainer' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  denied: {
    alignItems: 'center',
    backgroundColor: AdminColors.background,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  deniedTitle: {
    color: AdminColors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  deniedText: {
    color: AdminColors.textSecondary,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});
