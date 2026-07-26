import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdminColors } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import { supabase, type UserProfile } from '@/lib/supabase';

export default function PendingMembersScreen() {
  const insets = useSafeAreaInsets();
  const { authenticatedUserProfile, approveUser, rejectUser } = useAuth();
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewingUserId, setReviewingUserId] = useState<string | null>(null);

  const loadPendingUsers = async () => {
    if (!authenticatedUserProfile?.company_id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('company_id', authenticatedUserProfile.company_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingUsers((data ?? []) as UserProfile[]);
    } catch (error) {
      console.error('Error loading pending users:', error);
      Alert.alert('Fehler', 'Die ausstehenden Mitglieder konnten nicht geladen werden.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadPendingUsers();
  }, [authenticatedUserProfile?.company_id]);

  const reviewUser = async (userId: string, decision: 'approved' | 'rejected') => {
    setReviewingUserId(userId);

    try {
      if (decision === 'approved') {
        await approveUser(userId);
      } else {
        await rejectUser(userId);
      }
      await loadPendingUsers();
    } catch (error: any) {
      Alert.alert('Fehler', error.message || 'Die Entscheidung konnte nicht gespeichert werden.');
    } finally {
      setReviewingUserId(null);
    }
  };

  const confirmDecision = (profile: UserProfile, decision: 'approved' | 'rejected') => {
    const fullName =
      [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'diesen Benutzer';
    const approve = decision === 'approved';

    Alert.alert(
      approve ? 'Mitglied freigeben' : 'Registrierung ablehnen',
      `Möchtest du ${fullName} wirklich ${approve ? 'freigeben' : 'ablehnen'}?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: approve ? 'Freigeben' : 'Ablehnen',
          style: approve ? 'default' : 'destructive',
          onPress: () => void reviewUser(profile.user_id, decision),
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={AdminColors.primary} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 110 },
        pendingUsers.length === 0 && styles.emptyContent,
      ]}
      data={pendingUsers}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={AdminColors.primary}
          onRefresh={() => {
            setRefreshing(true);
            void loadPendingUsers();
          }}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.eyebrow}>FREIGABEN</Text>
          <Text style={styles.title}>{pendingUsers.length} neue Mitglieder</Text>
          <Text style={styles.subtitle}>
            Prüfe neue Registrierungen und erteile den Zugang zum Studio.
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const isReviewing = reviewingUserId === item.user_id;
        const fullName =
          [item.first_name, item.last_name].filter(Boolean).join(' ') ||
          'Unbekannter Benutzer';

        return (
          <View style={styles.card}>
            <View style={styles.memberRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {getInitials(item.first_name, item.last_name)}
                </Text>
              </View>
              <View style={styles.memberCopy}>
                <Text style={styles.name}>{fullName}</Text>
                <Text style={styles.role}>{formatRole(item.role)}</Text>
                <Text style={styles.date}>
                  Registriert am {new Date(item.created_at).toLocaleDateString('de-DE')}
                </Text>
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable
                disabled={isReviewing}
                onPress={() => confirmDecision(item, 'approved')}
                style={({ pressed }) => [
                  styles.button,
                  styles.approveButton,
                  pressed && styles.buttonPressed,
                  isReviewing && styles.buttonDisabled,
                ]}>
                <Text style={styles.approveText}>
                  {isReviewing ? 'Wird gespeichert …' : '✓  Freigeben'}
                </Text>
              </Pressable>
              <Pressable
                disabled={isReviewing}
                onPress={() => confirmDecision(item, 'rejected')}
                style={({ pressed }) => [
                  styles.button,
                  styles.rejectButton,
                  pressed && styles.rejectPressed,
                  isReviewing && styles.buttonDisabled,
                ]}>
                <Text style={styles.rejectText}>×  Ablehnen</Text>
              </Pressable>
            </View>
          </View>
        );
      }}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Alles erledigt</Text>
          <Text style={styles.emptyText}>Aktuell wartet niemand auf eine Freigabe.</Text>
        </View>
      }
      style={styles.screen}
    />
  );
}

function getInitials(firstName: string | null, lastName: string | null) {
  return (
    [firstName, lastName]
      .filter(Boolean)
      .map((name) => name?.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2) || '?'
  );
}

function formatRole(role: UserProfile['role']) {
  if (role === 'owner') return 'Owner';
  if (role === 'trainer') return 'Trainer';
  return 'Kunde';
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: AdminColors.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  emptyContent: {
    flexGrow: 1,
  },
  loading: {
    alignItems: 'center',
    backgroundColor: AdminColors.background,
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 22,
  },
  eyebrow: {
    color: AdminColors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    color: AdminColors.textPrimary,
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginTop: 7,
  },
  subtitle: {
    color: AdminColors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  card: {
    backgroundColor: AdminColors.surface,
    borderColor: AdminColors.border,
    borderLeftColor: AdminColors.primary,
    borderLeftWidth: 2,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  memberRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: AdminColors.surfaceRaised,
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    marginRight: 12,
    width: 46,
  },
  avatarText: {
    color: AdminColors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  memberCopy: {
    flex: 1,
  },
  name: {
    color: AdminColors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  role: {
    color: AdminColors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  date: {
    color: AdminColors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 17,
  },
  button: {
    alignItems: 'center',
    borderRadius: 11,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  approveButton: {
    backgroundColor: AdminColors.primary,
    marginRight: 8,
  },
  rejectButton: {
    borderColor: '#444444',
    borderWidth: 1,
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  rejectPressed: {
    backgroundColor: AdminColors.surfaceRaised,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  approveText: {
    color: AdminColors.background,
    fontSize: 12,
    fontWeight: '800',
  },
  rejectText: {
    color: AdminColors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    alignItems: 'center',
    backgroundColor: AdminColors.surface,
    borderColor: AdminColors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 28,
  },
  emptyTitle: {
    color: AdminColors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  emptyText: {
    color: AdminColors.textMuted,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
});
