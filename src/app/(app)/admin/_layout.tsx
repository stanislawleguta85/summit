import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AdminColors } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';

export default function AdminLayout() {
  const { hasPermission, userProfile } = useAuth();
  const canReadMembers =
    hasPermission('members', 'read', 'all') && userProfile?.status === 'approved';

  if (!canReadMembers) {
    return (
      <View style={styles.denied}>
        <Text style={styles.deniedTitle}>Acceso restringido</Text>
        <Text style={styles.deniedText}>Esta sección solo está disponible para admins.</Text>
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
        headerTitleStyle: { color: AdminColors.textPrimary, fontWeight: '500' },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="booking-requests" options={{ title: 'Solicitudes' }} />
      <Stack.Screen name="pending-members" options={{ title: 'Nuevas membresías' }} />
      <Stack.Screen name="courses" options={{ title: 'Clases' }} />
      <Stack.Screen name="members" options={{ title: 'Personal y clientes' }} />
      <Stack.Screen name="trainers" options={{ title: 'Entrenadores' }} />
      <Stack.Screen name="clients" options={{ title: 'Clientes' }} />
      <Stack.Screen name="new-staff" options={{ title: 'Nueva cuenta' }} />
      <Stack.Screen name="changes" options={{ title: 'Mis cambios' }} />
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
