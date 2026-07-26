import React, { useEffect, useMemo, useState } from 'react';
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

type MemberFilter = 'all' | 'trainer' | 'customer';

export default function MembersScreen() {
  const insets = useSafeAreaInsets();
  const { authenticatedUserProfile } = useAuth();
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [filter, setFilter] = useState<MemberFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMembers = async () => {
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
        .eq('status', 'approved')
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true });

      if (error) throw error;
      setMembers((data ?? []) as UserProfile[]);
    } catch (error) {
      console.error('Error loading members:', error);
      Alert.alert('Fehler', 'Die Mitglieder konnten nicht geladen werden.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadMembers();
  }, [authenticatedUserProfile?.company_id]);

  const filteredMembers = useMemo(() => {
    if (filter === 'all') return members;
    return members.filter((member) => member.role === filter);
  }, [filter, members]);

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
        filteredMembers.length === 0 && styles.emptyContent,
      ]}
      data={filteredMembers}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={AdminColors.primary}
          onRefresh={() => {
            setRefreshing(true);
            void loadMembers();
          }}
        />
      }
      ListHeaderComponent={
        <View>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>STUDIO-TEAM</Text>
            <Text style={styles.title}>{members.length} aktive Profile</Text>
            <Text style={styles.subtitle}>
              Überblick über freigegebene Mitglieder, Trainer und Owner.
            </Text>
          </View>

          <View style={styles.filters}>
            <FilterButton
              active={filter === 'all'}
              label="Alle"
              onPress={() => setFilter('all')}
            />
            <FilterButton
              active={filter === 'trainer'}
              label="Trainer"
              onPress={() => setFilter('trainer')}
            />
            <FilterButton
              active={filter === 'customer'}
              label="Mitglieder"
              onPress={() => setFilter('customer')}
            />
          </View>
        </View>
      }
      renderItem={({ item }) => {
        const name =
          [item.first_name, item.last_name].filter(Boolean).join(' ') ||
          'Unbekannter Benutzer';

        return (
          <View style={styles.memberRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {getInitials(item.first_name, item.last_name)}
              </Text>
            </View>
            <View style={styles.memberCopy}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.meta}>
                Seit {new Date(item.created_at).toLocaleDateString('de-DE')}
              </Text>
            </View>
            <View style={[styles.roleBadge, item.role === 'owner' && styles.ownerBadge]}>
              <Text style={[styles.roleText, item.role === 'owner' && styles.ownerText]}>
                {formatRole(item.role)}
              </Text>
            </View>
          </View>
        );
      }}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Keine Profile gefunden</Text>
          <Text style={styles.emptyText}>Für diesen Filter gibt es aktuell keine Einträge.</Text>
        </View>
      }
      style={styles.screen}
    />
  );
}

function FilterButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterButton,
        active && styles.filterButtonActive,
        pressed && styles.filterButtonPressed,
      ]}>
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </Pressable>
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
  return 'Mitglied';
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
    marginBottom: 18,
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
  filters: {
    backgroundColor: AdminColors.surface,
    borderColor: AdminColors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 18,
    padding: 4,
  },
  filterButton: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
  },
  filterButtonActive: {
    backgroundColor: AdminColors.primary,
  },
  filterButtonPressed: {
    opacity: 0.8,
  },
  filterText: {
    color: AdminColors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  filterTextActive: {
    color: AdminColors.background,
    fontWeight: '800',
  },
  memberRow: {
    alignItems: 'center',
    backgroundColor: AdminColors.surface,
    borderColor: AdminColors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 10,
    minHeight: 76,
    padding: 13,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: AdminColors.surfaceRaised,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginRight: 12,
    width: 44,
  },
  avatarText: {
    color: AdminColors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  memberCopy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: AdminColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    color: AdminColors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  roleBadge: {
    backgroundColor: AdminColors.surfaceRaised,
    borderRadius: 999,
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ownerBadge: {
    backgroundColor: AdminColors.primaryMuted,
  },
  roleText: {
    color: AdminColors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  ownerText: {
    color: AdminColors.primary,
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
