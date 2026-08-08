import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AdminCard,
  AdminHeader,
  AdminScrollScreen,
  HeaderIconButton,
  InitialAvatar,
  SkeletonBlock,
} from '@/components/admin/admin-ui';
import { MonthCalendar } from '@/components/admin/month-calendar';
import { adminColors, adminHairline, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import { useAdminData } from '@/hooks/use-admin-data';
import {
  formatSpanishDay,
  localDateKey,
  timeRange,
} from '@/lib/admin-data';

const PREVIEW_BOOKING_REQUESTS = __DEV__ ? 2 : 0;

export function AdminHomeScreen() {
  const router = useRouter();
  const { hasRole, isImpersonating, signOut } = useAuth();
  const isOwner = hasRole('owner');
  const {
    bookings,
    courses,
    courseOccurrences,
    profiles,
    sessions,
    loading,
    refreshing,
    error,
    reload,
  } = useAdminData();
  const today = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [expandedAgendaId, setExpandedAgendaId] = useState<string | null>(null);

  const pendingMembers = profiles.filter((profile) => profile.status === 'pending').length;
  const eventDateKeys = useMemo(
    () =>
      new Set(
        [
          ...courseOccurrences.map((occurrence) =>
            localDateKey(new Date(occurrence.start_at))
          ),
          ...sessions.map((session) => localDateKey(new Date(session.start_at))),
        ]
      ),
    [courseOccurrences, sessions]
  );
  const selectedAgenda = useMemo(
    () =>
      [
        ...courseOccurrences
          .filter(
            (occurrence) =>
              localDateKey(new Date(occurrence.start_at)) === localDateKey(selectedDate)
          )
          .flatMap((occurrence) => {
            const course = courses.find(
              (candidate) => candidate.id === occurrence.course_id
            );
            return course
              ? [
                  {
                    id: `group-${occurrence.session_id}`,
                    kind: 'group' as const,
                    startAt: occurrence.start_at,
                    course,
                    occurrence,
                  },
                ]
              : [];
          }),
        ...sessions
          .filter(
            (session) =>
              localDateKey(new Date(session.start_at)) === localDateKey(selectedDate)
          )
          .map((session) => ({
            id: `session-${session.id}`,
            kind: 'personal' as const,
            startAt: session.start_at,
            session,
          })),
      ].sort((left, right) => left.startAt.localeCompare(right.startAt)),
    [courseOccurrences, courses, selectedDate, sessions]
  );

  const confirmSignOut = () => {
    Alert.alert('Cerrar sesión', '¿Quieres cerrar la sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: () => {
          void signOut().catch((signOutError: any) => {
            Alert.alert(
              'No se pudo cerrar la sesión',
              signOutError.message || 'Inténtalo de nuevo.'
            );
          });
        },
      },
    ]);
  };

  return (
    <AdminScrollScreen
      refreshControl={
        <RefreshControl
          onRefresh={reload}
          refreshing={refreshing}
          tintColor={adminColors.amber}
        />
      }>
      <AdminHeader
        eyebrow={isOwner ? 'SUMMIT ADMIN' : 'SUMMIT TRAINER'}
        title={`Hoy, ${new Intl.DateTimeFormat('es-ES', {
          day: 'numeric',
          month: 'long',
        }).format(today)}`}
        right={
          isOwner ? (
            <>
              <HeaderIconButton
                accessibilityLabel="Solicitudes de cursos"
                badge={PREVIEW_BOOKING_REQUESTS}
                badgeTone="urgent"
                icon="calendar"
                onPress={() => router.push('/admin/booking-requests')}
              />
              <HeaderIconButton
                accessibilityLabel="Nuevas membresías"
                badge={pendingMembers}
                icon="user-plus"
                onPress={() => router.push('/admin/pending-members')}
              />
              <HeaderIconButton
                accessibilityLabel="Mensajes"
                icon="message-circle"
                onPress={() => Alert.alert('Mensajes', 'No hay mensajes nuevos.')}
              />
            </>
          ) : !isImpersonating ? (
            <>
              <HeaderIconButton
                accessibilityLabel="Mi perfil"
                icon="user"
                onPress={() => router.push('/profile')}
              />
              <HeaderIconButton
                accessibilityLabel="Cerrar sesión"
                icon="log-out"
                onPress={confirmSignOut}
              />
            </>
          ) : undefined
        }
      />

      {loading ? (
        <>
          <SkeletonBlock height={310} />
          <SkeletonBlock height={46} style={styles.skeletonAgenda} />
          <SkeletonBlock height={80} />
        </>
      ) : (
        <>
          <MonthCalendar
            eventDateKeys={eventDateKeys}
            month={visibleMonth}
            onChangeMonth={(month) => {
              setVisibleMonth(month);
              setSelectedDate(new Date(month.getFullYear(), month.getMonth(), 1));
            }}
            onSelectDate={setSelectedDate}
            selectedDate={selectedDate}
          />

          <View style={styles.dayHeading}>
            <Feather color={adminColors.amber} name="calendar" size={14} />
            <Text style={styles.dayHeadingText}>{formatSpanishDay(selectedDate)}</Text>
          </View>

          {error ? (
            <AdminCard>
              <Text style={styles.errorText}>{error}</Text>
            </AdminCard>
          ) : selectedAgenda.length === 0 ? (
            <AdminCard style={styles.emptyAgenda}>
              <Text style={styles.emptyText}>No hay clases ni entrenamientos este día</Text>
            </AdminCard>
          ) : (
            <AdminCard style={styles.agendaCard}>
              {selectedAgenda.map((item, index) => {
                const expanded = expandedAgendaId === item.id;

                if (item.kind === 'personal') {
                  const sessionBookings = bookings.filter(
                    (booking) => booking.session_id === item.session.id
                  );
                  const participantNames = sessionBookings.map((booking) => {
                    const profile = profiles.find(
                      (candidate) => candidate.user_id === booking.user_id
                    );
                    return (
                      [profile?.first_name, profile?.last_name]
                        .filter(Boolean)
                        .join(' ') || 'Cliente confirmado'
                    );
                  });
                  const clientName = participantNames[0] || 'Cliente confirmado';
                  const location = [item.session.room, item.session.location]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <View
                      key={item.id}
                      style={[styles.agendaItem, index > 0 && styles.agendaItemBorder]}>
                      <View style={styles.statusRow}>
                        <Text style={styles.time}>
                          {timeRange(item.session.start_at, item.session.end_at).split('–')[0]}
                        </Text>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: adminColors.available },
                          ]}
                        />
                        <View style={styles.statusCopy}>
                          <Text style={styles.courseName} numberOfLines={2}>
                            ET - Individual
                          </Text>
                          <Text style={[styles.statusText, { color: adminColors.available }]}>
                            {`${clientName} · Confirmado${location ? ` · ${location}` : ''}`}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                }

                const course = item.course;
                const occurrenceBookings = bookings.filter(
                  (booking) => booking.session_id === item.occurrence.session_id
                );
                const occupancyColor = getCalendarOccupancyColor(
                  item.occurrence.confirmed_count,
                  item.occurrence.capacity
                );
                const participants = occurrenceBookings
                  .map((booking) =>
                    profiles.find((profile) => profile.user_id === booking.user_id)
                  )
                  .filter(Boolean);

                return (
                  <View
                    key={item.id}
                    style={[styles.agendaItem, index > 0 && styles.agendaItemBorder]}>
                    <Pressable
                      onPress={() => setExpandedAgendaId(expanded ? null : item.id)}
                      style={({ pressed }) => [
                        styles.statusRow,
                        pressed && styles.pressed,
                      ]}>
                      <Text style={styles.time}>
                        {timeRange(
                          item.occurrence.start_at,
                          item.occurrence.end_at
                        ).split('–')[0]}
                      </Text>
                      <View
                        style={[styles.statusDot, { backgroundColor: occupancyColor }]}
                      />
                      <View style={styles.statusCopy}>
                        <Text style={styles.courseName} numberOfLines={2}>
                          {course.title} - Grupo
                        </Text>
                        <Text style={[styles.statusText, { color: occupancyColor }]}>
                          Ocupación {item.occurrence.confirmed_count}/
                          {item.occurrence.capacity}
                        </Text>
                      </View>
                      <Feather
                        color={adminColors.textMuted}
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={15}
                      />
                    </Pressable>

                    {expanded ? (
                      <View style={styles.participants}>
                        {participants.length === 0 ? (
                          <Text style={styles.participantName}>
                            Todavía no hay reservas.
                          </Text>
                        ) : (
                          participants.map((profile) => (
                            <View key={profile?.id} style={styles.participantRow}>
                              <InitialAvatar
                                firstName={profile?.first_name}
                                imageUrl={profile?.avatar_url}
                                lastName={profile?.last_name}
                              />
                              <Text style={styles.participantName}>
                                {[profile?.first_name, profile?.last_name]
                                  .filter(Boolean)
                                  .join(' ')}
                              </Text>
                            </View>
                          ))
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </AdminCard>
          )}
        </>
      )}
    </AdminScrollScreen>
  );
}

function getCalendarOccupancyColor(taken: number, capacity: number) {
  if (capacity <= 0 || taken >= capacity) return adminColors.urgent;
  if (taken / capacity >= 0.5) return adminColors.amber;
  return adminColors.available;
}

const styles = StyleSheet.create({
  skeletonAgenda: {
    marginTop: 20,
  },
  dayHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    marginTop: 18,
  },
  dayHeadingText: {
    color: adminColors.amber,
    fontSize: 13,
    fontWeight: '500',
  },
  agendaCard: {
    paddingVertical: 2,
  },
  agendaItem: {
    paddingVertical: 10,
  },
  agendaItemBorder: {
    borderTopColor: adminColors.border,
    borderTopWidth: adminHairline,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 42,
  },
  time: {
    color: adminColors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
    minWidth: 44,
  },
  statusDot: {
    borderRadius: 3,
    height: 6,
    marginRight: 10,
    width: 6,
  },
  statusCopy: {
    flex: 1,
    flexShrink: 1,
  },
  courseName: {
    ...adminType.rowTitle,
  },
  statusText: {
    fontSize: 11,
    marginTop: 2,
  },
  participants: {
    borderLeftColor: adminColors.borderStrong,
    borderLeftWidth: 2,
    marginLeft: 47,
    marginTop: 6,
    paddingLeft: 16,
  },
  participantName: {
    ...adminType.secondary,
    lineHeight: 18,
  },
  participantRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    minHeight: 34,
  },
  emptyAgenda: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyText: {
    color: adminColors.textMuted,
    fontSize: 12,
  },
  errorText: {
    color: adminColors.urgent,
    fontSize: 12,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
