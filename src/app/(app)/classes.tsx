import { AdminClassesScreen } from '@/components/admin/admin-classes-screen';
import { useAuth } from '@/context/auth-context';
import { StyleSheet, Text, View } from 'react-native';

export default function ClassesScreen() {
  const { hasPermission } = useAuth();

  if (!hasPermission('courses', 'read')) {
    return (
      <View style={styles.denied}>
        <Text style={styles.deniedText}>Esta sección está disponible para admins y entrenadores.</Text>
      </View>
    );
  }

  return <AdminClassesScreen />;
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
