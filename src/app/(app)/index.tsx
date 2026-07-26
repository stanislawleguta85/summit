import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useAuth } from '@/context/auth-context';

export default function HomeScreen() {
  const { userProfile, session, signOut, isImpersonating } = useAuth();

  const handleLogout = async () => {
    Alert.alert('Abmelden', 'Möchtest du dich wirklich abmelden?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Abmelden',
        onPress: async () => {
          try {
            await signOut();
          } catch (err: any) {
            Alert.alert('Fehler', err.message || 'Abmeldung fehlgeschlagen');
          }
        },
        style: 'destructive',
      },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Willkommen! 👋</Text>
        <Text style={styles.subtitle}>
          {userProfile?.first_name} {userProfile?.last_name}
        </Text>
      </View>

      {/* Profil Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📌 Dein Profil</Text>
        <View style={styles.profileRow}>
          <Text style={styles.label}>Name:</Text>
          <Text style={styles.value}>
            {userProfile?.first_name} {userProfile?.last_name}
          </Text>
        </View>
        <View style={styles.profileRow}>
          <Text style={styles.label}>Email:</Text>
          <Text style={[styles.value, styles.emailValue]}>
            {isImpersonating ? 'In Vorschau nicht verfügbar' : session?.user?.email}
          </Text>
        </View>
        <View style={styles.profileRow}>
          <Text style={styles.label}>Rolle:</Text>
          <Text style={[styles.value, styles.roleTag]}>
            {userProfile?.role === 'owner'
              ? '👑 Owner'
              : userProfile?.role === 'trainer'
              ? '💪 Trainer'
              : '👤 Kunde'}
          </Text>
        </View>
        <View style={styles.profileRow}>
          <Text style={styles.label}>Status:</Text>
          <Text
            style={[
              styles.value,
              userProfile?.status === 'approved'
                ? styles.statusApproved
                : styles.statusPending,
            ]}
          >
            {userProfile?.status === 'approved' ? '✓ Genehmigt' : '⏳ Ausstehend'}
          </Text>
        </View>
      </View>

      {/* Studio Info Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🏋️ Studio Informationen</Text>
        <Text style={styles.cardText}>
          Hier werden bald Informationen über das Studio angezeigt.
        </Text>
      </View>

      {/* Status Info */}
      {userProfile?.status === 'approved' && (
        <View style={styles.successCard}>
          <Text style={styles.successText}>🎉 Du hast vollen Zugriff auf die App!</Text>
        </View>
      )}

      {/* In der Vorschau würde Abmelden den echten Owner ausloggen. */}
      {!isImpersonating && (
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Abmelden</Text>
        </TouchableOpacity>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Summit v1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#208AEF',
    padding: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#ddd',
    marginTop: 5,
  },
  card: {
    backgroundColor: '#fff',
    margin: 15,
    padding: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#208AEF',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#000',
  },
  cardText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  label: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    color: '#000',
    fontWeight: '600',
  },
  emailValue: {
    flex: 1,
    marginLeft: 12,
    textAlign: 'right',
  },
  roleTag: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    color: '#208AEF',
  },
  statusApproved: {
    color: '#4CAF50',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusPending: {
    color: '#FF9800',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  successCard: {
    backgroundColor: '#C8E6C9',
    margin: 15,
    padding: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  successText: {
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  logoutButton: {
    backgroundColor: '#f44336',
    marginHorizontal: 15,
    marginVertical: 10,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    color: '#999',
    fontSize: 12,
  },
});
