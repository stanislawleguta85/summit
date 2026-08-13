import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import {
  AdminCard,
  AdminScrollScreen,
  EmptyState,
  SectionHeading,
  SkeletonBlock,
} from '@/components/admin/admin-ui';
import { adminColors, adminHairline, adminRadius, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import {
  supabase,
  type ManageablePersonalTrainingSession,
  type PersonalTrainingService,
} from '@/lib/supabase';

export default function PersonalTrainingServiceScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [service, setService] = useState<PersonalTrainingService | null>(null);
  const [sessions, setSessions] = useState<ManageablePersonalTrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canReadSessions = hasPermission('sessions', 'read');

  const load = useCallback(
    async (asRefresh = false) => {
      if (!id || !canReadSessions) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (asRefresh) setRefreshing(true);
      setError(null);
      try {
        const [serviceResult, sessionResult] = await Promise.all([
          supabase.from('personal_training_services').select('*').eq('id', id).single(),
          supabase.rpc('get_manageable_personal_training_sessions'),
        ]);

        if (serviceResult.error) throw serviceResult.error;
        if (sessionResult.error) throw sessionResult.error;

        setService(serviceResult.data as PersonalTrainingService);
        setSessions(
          ((sessionResult.data ?? []) as ManageablePersonalTrainingSession[]).filter(
            (session) => session.service_id === id
          )
        );
      } catch (loadError: any) {
        setError(loadError.message || 'El servicio individual no se pudo cargar.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canReadSessions, id]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!canReadSessions) {
    return (
      <View style={styles.denied}>
        <Text style={styles.secondary}>No tienes permiso para consultar estas sesiones.</Text>
      </View>
    );
  }

  return (
    <AdminScrollScreen
      includeTabInset={false}
      refreshControl={
        <RefreshControl
          onRefresh={() => void load(true)}
          refreshing={refreshing}
          tintColor={adminColors.amber}
        />
      }>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Feather color={adminColors.textPrimary} name="arrow-left" size={18} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>CLASE INDIVIDUAL</Text>
          <Text style={styles.title}>{service?.title ?? 'Entrenamiento individual'}</Text>
        </View>
      </View>

      {loading ? (
        <>
          <SkeletonBlock height={118} />
          <SkeletonBlock height={180} />
        </>
      ) : error ? (
        <AdminCard>
          <Text style={styles.error}>{error}</Text>
        </AdminCard>
      ) : service ? (
        <>
          <AdminCard muted={!service.active}>
            <View style={styles.serviceHeader}>
              <View style={styles.serviceCopy}>
                <Text style={styles.cardTitle}>{service.title}</Text>
                <Text style={styles.secondary}>
                  {service.description || 'Horarios coordinados mediante solicitudes.'}
                </Text>
              </View>
              <View style={[styles.statusBadge, service.active && styles.activeBadge]}>
                <Text style={[styles.statusText, service.active && styles.activeText]}>
                  {service.active ? 'Activo' : 'Inactivo'}
                </Text>
              </View>
            </View>
            <View style={styles.metaRow}>
              <Feather color={adminColors.iconDefault} name="clock" size={14} />
              <Text style={styles.secondary}>
                Duración estándar: {service.default_duration_minutes} minutos
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Feather color={adminColors.iconDefault} name="tag" size={14} />
              <Text style={styles.secondary}>{service.price}</Text>
            </View>
          </AdminCard>

          <SectionHeading title={`Próximas sesiones · ${sessions.length}`} />
          {sessions.length === 0 ? (
            <EmptyState
              message="Las citas confirmadas aparecerán aquí con cliente y entrenador."
              title="No hay sesiones programadas"
            />
          ) : (
            <View style={styles.list}>
              {sessions.map((session) => (
                <AdminCard key={session.session_id}>
                  <View style={styles.sessionHeader}>
                    <View style={styles.dateIcon}>
                      <Text style={styles.dateDay}>{formatDay(session.start_at)}</Text>
                      <Text style={styles.dateMonth}>{formatMonth(session.start_at)}</Text>
                    </View>
                    <View style={styles.sessionCopy}>
                      <Text style={styles.cardTitle}>{formatFullDate(session.start_at)}</Text>
                      <Text style={styles.timeText}>
                        {formatTimeRange(session.start_at, session.end_at)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.metaRow}>
                    <Feather color={adminColors.iconDefault} name="user" size={14} />
                    <Text style={styles.secondary}>
                      Cliente: {session.customer_name || 'Sin nombre'}
                    </Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Feather color={adminColors.iconDefault} name="activity" size={14} />
                    <Text style={styles.secondary}>
                      Entrenador: {session.trainer_name || 'Sin nombre'}
                    </Text>
                  </View>
                  {session.room || session.location ? (
                    <View style={styles.metaRow}>
                      <Feather color={adminColors.iconDefault} name="map-pin" size={14} />
                      <Text style={styles.secondary}>
                        {session.room || session.location}
                      </Text>
                    </View>
                  ) : null}
                </AdminCard>
              ))}
            </View>
          )}
        </>
      ) : null}
    </AdminScrollScreen>
  );
}

function formatDay(value: string) {
  return String(new Date(value).getDate()).padStart(2, '0');
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat('es-ES', { month: 'short' })
    .format(new Date(value))
    .replace('.', '')
    .toUpperCase();
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function formatTimeRange(startValue: string, endValue: string) {
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  const start = new Date(startValue).toLocaleTimeString('es-ES', options);
  const end = new Date(endValue).toLocaleTimeString('es-ES', options);
  return `${start}–${end}`;
}

const styles = StyleSheet.create({
  denied: {
    alignItems: 'center',
    backgroundColor: adminColors.bgPage,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  headerCopy: {
    flex: 1,
  },
  backButton: {
    alignItems: 'center',
    borderColor: adminColors.borderStrong,
    borderRadius: adminRadius.iconBox,
    borderWidth: adminHairline,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  eyebrow: {
    ...adminType.eyebrow,
  },
  title: {
    ...adminType.title,
    marginTop: 4,
  },
  serviceHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  serviceCopy: {
    flex: 1,
    gap: 5,
  },
  cardTitle: {
    ...adminType.rowTitle,
  },
  secondary: {
    ...adminType.secondary,
    flexShrink: 1,
  },
  statusBadge: {
    backgroundColor: adminColors.bgCardMuted,
    borderRadius: adminRadius.chip,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  activeBadge: {
    backgroundColor: adminColors.availableTint,
  },
  statusText: {
    ...adminType.badge,
    color: adminColors.textMuted,
  },
  activeText: {
    color: adminColors.available,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  list: {
    gap: 8,
  },
  sessionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    marginBottom: 8,
  },
  sessionCopy: {
    flex: 1,
  },
  dateIcon: {
    alignItems: 'center',
    backgroundColor: adminColors.amberTint,
    borderRadius: adminRadius.input,
    minWidth: 45,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  dateDay: {
    color: adminColors.amber,
    fontSize: 16,
    fontWeight: '600',
  },
  dateMonth: {
    color: adminColors.amber,
    fontSize: 8,
    fontWeight: '600',
    marginTop: 1,
  },
  timeText: {
    color: adminColors.amber,
    fontSize: 11,
    marginTop: 4,
  },
  error: {
    color: adminColors.urgent,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.7,
  },
});
