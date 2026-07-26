import { Link, useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdminDashboardTile } from '@/components/admin-dashboard-tile';
import { AdminColors } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import { supabase, type UserProfile } from '@/lib/supabase';

type DashboardCounts = {
  pendingMembers: number;
  courses: number;
  members: number;
  trainers: number;
};

const EMPTY_COUNTS: DashboardCounts = {
  pendingMembers: 0,
  courses: 0,
  members: 0,
  trainers: 0,
};

const RECENT_REQUESTS = [
  { id: 'preview-1', time: '08:00–09:00', name: 'Alex López', status: '4 / 10 Plätze' },
  { id: 'preview-2', time: '18:00–19:00', name: 'Marta Ruiz', status: '8 / 10 Plätze' },
] as const;

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {
    authenticatedUserProfile,
    canImpersonate,
    loadImpersonatableProfiles,
    startImpersonation,
  } = useAuth();
  const [counts, setCounts] = useState<DashboardCounts>(EMPTY_COUNTS);
  const [countsLoading, setCountsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profilePickerVisible, setProfilePickerVisible] = useState(false);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);

  const loadCounts = async () => {
    if (!authenticatedUserProfile?.company_id) {
      setCountsLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const [profilesResult, coursesResult] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('status, role')
          .eq('company_id', authenticatedUserProfile.company_id),
        supabase
          .from('courses')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', authenticatedUserProfile.company_id),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (coursesResult.error) throw coursesResult.error;

      const companyProfiles = profilesResult.data ?? [];
      setCounts({
        pendingMembers: companyProfiles.filter((profile) => profile.status === 'pending').length,
        members: companyProfiles.filter((profile) => profile.status === 'approved').length,
        trainers: companyProfiles.filter(
          (profile) => profile.status === 'approved' && profile.role === 'trainer'
        ).length,
        courses: coursesResult.count ?? 0,
      });
    } catch (error) {
      console.error('Error loading admin dashboard:', error);
      Alert.alert('Fehler', 'Die Dashboard-Zahlen konnten nicht geladen werden.');
    } finally {
      setCountsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadCounts();
  }, [authenticatedUserProfile?.company_id]);

  const openProfilePicker = async () => {
    setProfilePickerVisible(true);
    setProfilesLoading(true);

    try {
      setProfiles(await loadImpersonatableProfiles());
    } catch (error: any) {
      setProfilePickerVisible(false);
      Alert.alert('Fehler', error.message || 'Benutzer konnten nicht geladen werden.');
    } finally {
      setProfilesLoading(false);
    }
  };

  const handleStartImpersonation = (profile: UserProfile) => {
    try {
      navigation.getParent()?.navigate('index' as never);
      startImpersonation(profile);
      setProfilePickerVisible(false);
    } catch (error: any) {
      Alert.alert('Fehler', error.message || 'Benutzeransicht konnte nicht gestartet werden.');
    }
  };

  const firstName = authenticatedUserProfile?.first_name?.trim() || 'Admin';
  const bookingRequestCount = __DEV__ ? RECENT_REQUESTS.length : 0;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 110 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={AdminColors.primary}
            onRefresh={() => {
              setRefreshing(true);
              void loadCounts();
            }}
          />
        }>
        <Text style={styles.eyebrow}>SUMMIT ADMIN</Text>
        <Text style={styles.title}>Guten Abend, {firstName}</Text>
        <Text style={styles.subtitle}>Was braucht heute deine Aufmerksamkeit?</Text>

        <View style={styles.summary}>
          <SummaryItem
            label="Anfragen"
            loading={countsLoading}
            value={bookingRequestCount}
          />
          <View style={styles.summaryDivider} />
          <SummaryItem
            label="Neue Mitglieder"
            loading={countsLoading}
            value={counts.pendingMembers}
          />
          <View style={styles.summaryDivider} />
          <SummaryItem label="Kurse" loading={countsLoading} value={counts.courses} />
        </View>

        <Text style={styles.sectionTitle}>Verwaltung</Text>
        <View style={styles.tileGrid}>
          <AdminDashboardTile
            count={bookingRequestCount}
            countLabel="offen"
            description="Anfragen prüfen und beantworten"
            fallbackIcon="▣"
            href="/admin/booking-requests"
            icon="calendar.badge.clock"
            title="Buchungsanfragen"
            urgent={bookingRequestCount > 0}
          />
          <AdminDashboardTile
            count={counts.pendingMembers}
            countLabel="neu"
            description="Registrierungen freigeben"
            fallbackIcon="＋"
            href="/admin/pending-members"
            icon="person.badge.plus"
            title="Neue Mitglieder"
          />
          <AdminDashboardTile
            count={counts.courses}
            countLabel="Kurse"
            description="Kurse und Zeiten überblicken"
            fallbackIcon="◷"
            href="/admin/courses"
            icon="calendar"
            title="Kurse & Zeitslots"
          />
          <AdminDashboardTile
            count={counts.members}
            countLabel={counts.trainers > 0 ? `gesamt · ${counts.trainers} Trainer` : 'gesamt'}
            description="Mitglieder und Rollen ansehen"
            fallbackIcon="●"
            href="/admin/members"
            icon="person.2"
            title="Mitglieder & Trainer"
          />
        </View>

        {__DEV__ && bookingRequestCount > 0 && (
          <View style={styles.recentSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Dringend</Text>
              <Link href="/admin/booking-requests" asChild>
                <Pressable>
                  <Text style={styles.sectionLink}>Alle anzeigen</Text>
                </Pressable>
              </Link>
            </View>

            <View style={styles.recentList}>
              {RECENT_REQUESTS.map((request, index) => (
                <Link key={request.id} href="/admin/booking-requests" asChild>
                  <Pressable
                    style={({ pressed }) => [
                      styles.recentRow,
                      index > 0 && styles.recentRowBorder,
                      pressed && styles.recentRowPressed,
                    ]}>
                    <View style={styles.recentTime}>
                      <Text style={styles.recentTimeText}>{request.time}</Text>
                    </View>
                    <View style={styles.recentCopy}>
                      <Text style={styles.recentName}>{request.name}</Text>
                      <Text style={styles.recentStatus}>{request.status}</Text>
                    </View>
                    <SymbolView
                      fallback={<Text style={styles.chevron}>›</Text>}
                      name="chevron.right"
                      size={12}
                      tintColor={AdminColors.textMuted}
                      weight="bold"
                    />
                  </Pressable>
                </Link>
              ))}
            </View>
          </View>
        )}

        {canImpersonate && (
          <View style={styles.developmentCard}>
            <View style={styles.developmentIcon}>
              <SymbolView
                fallback={<Text style={styles.developmentFallback}>◉</Text>}
                name="eye"
                size={22}
                tintColor={AdminColors.primary}
                weight="semibold"
              />
            </View>
            <View style={styles.developmentCopy}>
              <Text style={styles.developmentEyebrow}>NUR ENTWICKLUNG</Text>
              <Text style={styles.developmentTitle}>Ansicht als Benutzer</Text>
              <Text style={styles.developmentText}>
                Prüfe die App aus Sicht eines Mitglieds oder Trainers.
              </Text>
            </View>
            <TouchableOpacity style={styles.developmentButton} onPress={openProfilePicker}>
              <Text style={styles.developmentButtonText}>Auswählen</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => setProfilePickerVisible(false)}
        presentationStyle="pageSheet"
        visible={profilePickerVisible}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeading}>
              <Text style={styles.modalTitle}>Ansicht auswählen</Text>
              <Text style={styles.modalSubtitle}>
                Anmeldung und Datenbankrechte bleiben unverändert.
              </Text>
            </View>
            <TouchableOpacity onPress={() => setProfilePickerVisible(false)}>
              <Text style={styles.modalClose}>Schließen</Text>
            </TouchableOpacity>
          </View>

          {profilesLoading ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator color={AdminColors.primary} size="large" />
            </View>
          ) : (
            <FlatList
              contentContainerStyle={styles.profileList}
              data={profiles}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const ownProfile = item.user_id === authenticatedUserProfile?.user_id;
                const name =
                  [item.first_name, item.last_name].filter(Boolean).join(' ') ||
                  'Unbekannter Benutzer';

                return (
                  <TouchableOpacity
                    onPress={() => handleStartImpersonation(item)}
                    style={styles.profileRow}>
                    <View style={styles.profileAvatar}>
                      <Text style={styles.profileAvatarText}>
                        {getInitials(item.first_name, item.last_name)}
                      </Text>
                    </View>
                    <View style={styles.profileCopy}>
                      <Text style={styles.profileName}>{name}</Text>
                      <Text style={styles.profileMeta}>
                        {formatRole(item.role)} · {formatStatus(item.status)}
                      </Text>
                    </View>
                    <Text style={styles.profileAction}>
                      {ownProfile ? 'Eigene Ansicht' : 'Anzeigen'}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

function SummaryItem({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{loading ? '–' : value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
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

function formatStatus(status: UserProfile['status']) {
  if (status === 'approved') return 'Genehmigt';
  if (status === 'rejected') return 'Abgelehnt';
  return 'Ausstehend';
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: AdminColors.background,
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
  },
  eyebrow: {
    color: AdminColors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: AdminColors.textPrimary,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginTop: 8,
  },
  subtitle: {
    color: AdminColors.textMuted,
    fontSize: 15,
    marginTop: 7,
  },
  summary: {
    alignItems: 'center',
    backgroundColor: AdminColors.surface,
    borderColor: AdminColors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 24,
    paddingVertical: 16,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 5,
  },
  summaryValue: {
    color: AdminColors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  summaryLabel: {
    color: AdminColors.textMuted,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  summaryDivider: {
    backgroundColor: AdminColors.border,
    height: 32,
    width: 1,
  },
  sectionTitle: {
    color: AdminColors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 30,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 15,
  },
  recentSection: {
    marginTop: 2,
  },
  sectionHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionLink: {
    color: AdminColors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  recentList: {
    backgroundColor: AdminColors.surface,
    borderColor: AdminColors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 14,
    overflow: 'hidden',
  },
  recentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 76,
    paddingHorizontal: 14,
  },
  recentRowBorder: {
    borderTopColor: AdminColors.border,
    borderTopWidth: 1,
  },
  recentRowPressed: {
    backgroundColor: AdminColors.surfaceRaised,
  },
  recentTime: {
    alignItems: 'center',
    backgroundColor: AdminColors.primaryMuted,
    borderRadius: 10,
    justifyContent: 'center',
    marginRight: 12,
    minHeight: 38,
    paddingHorizontal: 9,
  },
  recentTimeText: {
    color: AdminColors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  recentCopy: {
    flex: 1,
  },
  recentName: {
    color: AdminColors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  recentStatus: {
    color: AdminColors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  chevron: {
    color: AdminColors.textMuted,
    fontSize: 20,
  },
  developmentCard: {
    alignItems: 'center',
    backgroundColor: AdminColors.surface,
    borderColor: '#423A00',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 28,
    padding: 14,
  },
  developmentIcon: {
    alignItems: 'center',
    backgroundColor: AdminColors.primaryMuted,
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    marginRight: 12,
    width: 42,
  },
  developmentFallback: {
    color: AdminColors.primary,
    fontSize: 20,
  },
  developmentCopy: {
    flex: 1,
    paddingRight: 8,
  },
  developmentEyebrow: {
    color: AdminColors.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  developmentTitle: {
    color: AdminColors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 3,
  },
  developmentText: {
    color: AdminColors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3,
  },
  developmentButton: {
    borderColor: AdminColors.primary,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  developmentButtonText: {
    color: AdminColors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  modal: {
    backgroundColor: AdminColors.background,
    flex: 1,
    paddingTop: 24,
  },
  modalHeader: {
    alignItems: 'flex-start',
    borderBottomColor: AdminColors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    padding: 20,
  },
  modalHeading: {
    flex: 1,
    paddingRight: 12,
  },
  modalTitle: {
    color: AdminColors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: AdminColors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  modalClose: {
    color: AdminColors.primary,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 5,
  },
  modalLoading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  profileList: {
    gap: 10,
    padding: 16,
  },
  profileRow: {
    alignItems: 'center',
    backgroundColor: AdminColors.surface,
    borderColor: AdminColors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 14,
  },
  profileAvatar: {
    alignItems: 'center',
    backgroundColor: AdminColors.surfaceRaised,
    borderRadius: 19,
    height: 38,
    justifyContent: 'center',
    marginRight: 11,
    width: 38,
  },
  profileAvatarText: {
    color: AdminColors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  profileCopy: {
    flex: 1,
  },
  profileName: {
    color: AdminColors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  profileMeta: {
    color: AdminColors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  profileAction: {
    color: AdminColors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
});
