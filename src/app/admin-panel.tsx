import React, { useEffect, useState } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAuth } from '@/context/auth-context';
import { supabase, UserProfile } from '@/lib/supabase';

export default function AdminPanelScreen() {
  const { userProfile, approveUser, rejectUser, isDevAdmin } = useAuth();
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPendingUsers = async () => {
    try {
      if (!userProfile?.company_id) return;

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('company_id', userProfile.company_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingUsers(data || []);
    } catch (err) {
      console.error('Error fetching pending users:', err);
      Alert.alert('Fehler', 'Konnte Benutzer nicht laden');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPendingUsers();
  }, [userProfile]);

  const handleApprove = async (userId: string) => {
    Alert.alert('Bestätigen', 'Möchtest du diesen Benutzer genehmigen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Genehmigen',
        onPress: async () => {
          try {
            await approveUser(userId);
            Alert.alert('Erfolg', 'Benutzer genehmigt');
            await fetchPendingUsers();
          } catch (err: any) {
            Alert.alert('Fehler', err.message || 'Genehmigung fehlgeschlagen');
          }
        },
      },
    ]);
  };

  const handleReject = async (userId: string) => {
    Alert.alert('Ablehnen', 'Möchtest du diesen Benutzer ablehnen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Ablehnen',
        onPress: async () => {
          try {
            await rejectUser(userId);
            Alert.alert('Erfolg', 'Benutzer abgelehnt');
            await fetchPendingUsers();
          } catch (err: any) {
            Alert.alert('Fehler', err.message || 'Ablehnung fehlgeschlagen');
          }
        },
        style: 'destructive',
      },
    ]);
  };

  if (!userProfile || (userProfile.role !== 'owner' && !isDevAdmin)) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Zugriff verweigert</Text>
        <Text style={styles.text}>Du hast keine Berechtigung für diesen Bereich</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#208AEF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Benutzer Verwaltung</Text>
      <Text style={styles.subtitle}>
        {pendingUsers.length} Benutzer warten auf Bestätigung
      </Text>

      <FlatList
        data={pendingUsers}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchPendingUsers();
            }}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.userName}>
              {item.first_name} {item.last_name}
            </Text>
            <Text style={styles.userRole}>Rolle: {item.role}</Text>
            <Text style={styles.userDate}>
              Registriert: {new Date(item.created_at).toLocaleDateString('de-DE')}
            </Text>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.approveButton]}
                onPress={() => handleApprove(item.user_id)}
              >
                <Text style={styles.buttonText}>✓ Genehmigen</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.rejectButton]}
                onPress={() => handleReject(item.user_id)}
              >
                <Text style={styles.buttonText}>✕ Ablehnen</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Keine ausstehenden Benutzer 🎉</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#000',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#208AEF',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  userRole: {
    fontSize: 14,
    color: '#666',
    marginBottom: 3,
  },
  userDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 50,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  text: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
