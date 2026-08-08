import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';

export function ImpersonationBanner() {
  const insets = useSafeAreaInsets();
  const { impersonatedProfile, stopImpersonation } = useAuth();

  if (!impersonatedProfile) {
    return null;
  }

  const fullName =
    [impersonatedProfile.first_name, impersonatedProfile.last_name].filter(Boolean).join(' ') ||
    'Usuario desconocido';

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.description}>
        <Text style={styles.eyebrow}>VISTA DE DESARROLLO</Text>
        <Text style={styles.name} numberOfLines={1}>
          Vista como {fullName}
        </Text>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Cerrar vista de usuario"
        onPress={stopImpersonation}
        style={styles.button}>
        <Text style={styles.buttonText}>Cerrar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#7C2D12',
    paddingBottom: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  description: {
    flex: 1,
  },
  eyebrow: {
    color: '#FED7AA',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  button: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  buttonText: {
    color: '#7C2D12',
    fontSize: 13,
    fontWeight: '800',
  },
});
