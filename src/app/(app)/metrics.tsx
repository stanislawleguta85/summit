import { StyleSheet, Text, View } from 'react-native';

import { AdminMetricsScreen } from '@/components/admin/admin-metrics-screen';
import { useAuth } from '@/context/auth-context';

export default function MetricsScreen() {
  const { hasPermission } = useAuth();

  if (!hasPermission('metrics', 'read', 'all')) {
    return (
      <View style={styles.denied}>
        <Text style={styles.deniedText}>Esta sección solo está disponible para admins.</Text>
      </View>
    );
  }

  return <AdminMetricsScreen />;
}

const styles = StyleSheet.create({
  denied: {
    alignItems: 'center',
    backgroundColor: '#0b0b0c',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  deniedText: {
    color: '#8f8e88',
    fontSize: 13,
    textAlign: 'center',
  },
});
