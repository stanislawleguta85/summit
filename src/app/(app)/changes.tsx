import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import {
  AdminCard,
  AdminHeader,
  AdminScrollScreen,
  EmptyState,
  FilterChip,
  InitialAvatar,
  SkeletonBlock,
} from '@/components/admin/admin-ui';
import { adminColors, adminHairline, adminRadius, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import { formatSpanishDay, formatSpanishDayWithYear, timeRange } from '@/lib/admin-data';
import {
  supabase,
  type BookingChangeAudit,
  type BookingChangeRequest,
} from '@/lib/supabase';

type RecoveredSession = { id: string; start_at: string; end_at: string };

export default function ChangesScreen() {
  const { hasRole } = useAuth();

  if (hasRole('trainer') && !hasRole('customer')) {
    return <TrainerChangesScreen />;
  }

  return <CustomerChangesScreen />;
}

function CustomerChangesScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [changes, setChanges] = useState<BookingChangeRequest[]>([]);
  const [recoveredSessions, setRecoveredSessions] = useState<
    Record<string, RecoveredSession>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (asRefresh = false) => {
    if (!userProfile) return;
    if (asRefresh) setRefreshing(true);
    setError(null);

    try {
      const changeResult = await supabase
        .from('booking_change_requests')
        .select('*')
        .eq('customer_id', userProfile.user_id)
        .order('created_at', { ascending: false });
      if (changeResult.error) throw changeResult.error;

      const nextChanges = (changeResult.data ?? []) as BookingChangeRequest[];
      setChanges(nextChanges);

      const sessionIds = nextChanges
        .map((change) => change.recovered_session_id)
        .filter((value): value is string => Boolean(value));
      if (sessionIds.length === 0) {
        setRecoveredSessions({});
      } else {
        const sessionResult = await supabase
          .from('course_sessions')
          .select('id,start_at,end_at')
          .in('id', sessionIds);
        if (sessionResult.error) throw sessionResult.error;

        setRecoveredSessions(
          ((sessionResult.data ?? []) as RecoveredSession[]).reduce<
            Record<string, RecoveredSession>
          >((result, session) => {
            result[session.id] = session;
            return result;
          }, {})
        );
      }
    } catch (loadError: any) {
      setError(loadError.message || 'Tus cambios no se pudieron cargar.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userProfile?.user_id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <AdminScrollScreen
      refreshControl={
        <RefreshControl
          onRefresh={() => void load(true)}
          refreshing={refreshing}
          tintColor={adminColors.amber}
        />
      }>
      <AdminHeader eyebrow="HISTORIAL" title="Mis cambios" />

      {loading ? (
        <>
          <SkeletonBlock height={126} />
          <SkeletonBlock height={126} style={styles.gap} />
        </>
      ) : error ? (
        <EmptyState
          actionLabel="Intentar de nuevo"
          message={error}
          onAction={() => void load()}
          title="No se pudo cargar"
        />
      ) : changes.length === 0 ? (
        <EmptyState
          message="Las solicitudes que hagas desde tu calendario aparecerán aquí."
          title="Todavía no tienes cambios"
        />
      ) : (
        <View style={styles.list}>
          {changes.map((change) => {
            const recoveredSession = change.recovered_session_id
              ? recoveredSessions[change.recovered_session_id]
              : undefined;
            const presentation = statusPresentation(change);
            const canOpenAlternatives =
              change.change_kind === 'group' &&
              change.status === 'lost' &&
              Date.now() <= new Date(change.recovery_deadline).getTime();

            return (
              <AdminCard key={change.id}>
                <View style={styles.cardHeading}>
                  <View style={styles.kindIcon}>
                    <Feather
                      color={adminColors.iconDefault}
                      name={change.change_kind === 'personal' ? 'user' : 'users'}
                      size={14}
                    />
                  </View>
                  <View style={styles.copy}>
                    <Text style={styles.date}>
                      {formatSpanishDay(new Date(change.original_start_at))}
                    </Text>
                    <Text style={styles.meta}>
                      {timeRange(change.original_start_at, change.original_end_at)} ·{' '}
                      {change.change_kind === 'personal' ? 'Individual' : 'Grupo'}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: presentation.background }]}>
                    <Text style={[styles.badgeText, { color: presentation.color }]}>
                      {presentation.label}
                    </Text>
                  </View>
                </View>

                <Text style={styles.reason}>“{change.reason}”</Text>

                {change.status === 'lost' &&
                Date.now() <= new Date(change.recovery_deadline).getTime() ? (
                  <Text style={styles.info}>
                    Puedes recuperar este entrenamiento hasta el{' '}
                    {formatSpanishDayWithYear(new Date(change.recovery_deadline))}.
                  </Text>
                ) : null}
                {change.status === 'pending' ? (
                  <Text style={styles.info}>
                    Tu cita original sigue reservada mientras el entrenador busca una alternativa.
                  </Text>
                ) : null}
                {change.status === 'rejected' ? (
                  <Text style={styles.info}>
                    No se encontró una alternativa. La cita original sigue siendo válida.
                  </Text>
                ) : null}
                {recoveredSession ? (
                  <View style={styles.recoveredRow}>
                    <Feather color={adminColors.available} name="check-circle" size={14} />
                    <Text style={styles.recoveredText}>
                      Recuperado el {formatSpanishDay(new Date(recoveredSession.start_at))},{' '}
                      {timeRange(recoveredSession.start_at, recoveredSession.end_at)}
                    </Text>
                  </View>
                ) : null}

                {canOpenAlternatives ? (
                  <Pressable
                    onPress={() => router.push(`/booking-change/${change.id}` as Href)}
                    style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                    <Text style={styles.actionText}>Ver horarios alternativos</Text>
                    <Feather color={adminColors.amber} name="chevron-right" size={15} />
                  </Pressable>
                ) : change.change_kind === 'personal' && change.status === 'pending' ? (
                  <Pressable
                    onPress={() => router.push('/courses')}
                    style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                    <Text style={styles.actionText}>Ver solicitud y propuestas</Text>
                    <Feather color={adminColors.amber} name="chevron-right" size={15} />
                  </Pressable>
                ) : null}
              </AdminCard>
            );
          })}
        </View>
      )}
    </AdminScrollScreen>
  );
}

type TrainerChangeFilter = 'all' | 'pending' | 'finished';

function TrainerChangesScreen() {
  const [changes, setChanges] = useState<BookingChangeRequest[]>([]);
  const [audits, setAudits] = useState<Record<string, BookingChangeAudit>>({});
  const [recoveredSessions, setRecoveredSessions] = useState<
    Record<string, RecoveredSession>
  >({});
  const [filter, setFilter] = useState<TrainerChangeFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true);
    setError(null);
    try {
      const changeResult = await supabase
        .from('booking_change_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (changeResult.error) throw changeResult.error;

      const nextChanges = (changeResult.data ?? []) as BookingChangeRequest[];
      setChanges(nextChanges);
      const sessionIds = [
        ...new Set(
          nextChanges
            .map((change) => change.recovered_session_id)
            .filter((value): value is string => Boolean(value))
        ),
      ];
      const [auditResult, sessionResult] = await Promise.all([
        supabase.rpc('get_my_booking_change_audit'),
        sessionIds.length
          ? supabase
              .from('course_sessions')
              .select('id,start_at,end_at')
              .in('id', sessionIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (auditResult.error) throw auditResult.error;
      if (sessionResult.error) throw sessionResult.error;

      setAudits(
        ((auditResult.data ?? []) as BookingChangeAudit[]).reduce<
          Record<string, BookingChangeAudit>
        >((result, audit) => {
          result[audit.change_id] = audit;
          return result;
        }, {})
      );
      setRecoveredSessions(
        ((sessionResult.data ?? []) as RecoveredSession[]).reduce<
          Record<string, RecoveredSession>
        >((result, session) => {
          result[session.id] = session;
          return result;
        }, {})
      );
    } catch (loadError: any) {
      setError(loadError.message || 'Los cambios no se pudieron cargar.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const filteredChanges = changes.filter((change) => {
    const finished = isTrainerChangeFinished(change);
    if (filter === 'pending') return !finished;
    if (filter === 'finished') return finished;
    return true;
  });

  return (
    <AdminScrollScreen
      refreshControl={
        <RefreshControl
          onRefresh={() => void load(true)}
          refreshing={refreshing}
          tintColor={adminColors.amber}
        />
      }>
      <AdminHeader eyebrow="ENTRENADOR" title="Mis cambios" />

      <View style={styles.trainerFilters}>
        <FilterChip active={filter === 'all'} label="Todos" onPress={() => setFilter('all')} />
        <FilterChip
          active={filter === 'pending'}
          label="Pendientes"
          onPress={() => setFilter('pending')}
        />
        <FilterChip
          active={filter === 'finished'}
          label="Finalizados"
          onPress={() => setFilter('finished')}
        />
      </View>

      {loading ? (
        <>
          <SkeletonBlock height={130} />
          <SkeletonBlock height={130} style={styles.gap} />
        </>
      ) : error ? (
        <EmptyState
          actionLabel="Intentar de nuevo"
          message={error}
          onAction={() => void load()}
          title="No se pudo cargar"
        />
      ) : filteredChanges.length === 0 ? (
        <EmptyState
          message={
            changes.length === 0
              ? 'Los cambios de tus clientes aparecerán aquí.'
              : 'No hay cambios que coincidan con este filtro.'
          }
          title={changes.length === 0 ? 'Todavía no hay cambios' : 'Sin resultados'}
        />
      ) : (
        <View style={styles.list}>
          {filteredChanges.map((change) => {
            const audit = audits[change.id];
            const presentation = trainerStatusPresentation(change);
            const recovered = change.recovered_session_id
              ? recoveredSessions[change.recovered_session_id]
              : undefined;

            return (
              <AdminCard key={change.id}>
                <View style={styles.cardHeading}>
                  <InitialAvatar
                    firstName={audit?.customer_first_name}
                    lastName={audit?.customer_last_name}
                  />
                  <View style={styles.copy}>
                    <Text style={styles.date}>
                      {[audit?.customer_first_name, audit?.customer_last_name]
                        .filter(Boolean)
                        .join(' ') || 'Cliente'}
                    </Text>
                    <Text style={styles.meta}>
                      {change.change_kind === 'personal' ? 'Individual' : 'Grupo'}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: presentation.background }]}>
                    <Text style={[styles.badgeText, { color: presentation.color }]}>
                      {presentation.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.trainerOriginal}>
                  <Text style={styles.trainerOriginalLabel}>CITA ORIGINAL</Text>
                  <Text style={styles.trainerOriginalValue}>
                    {formatSpanishDay(new Date(change.original_start_at))} ·{' '}
                    {timeRange(change.original_start_at, change.original_end_at)}
                  </Text>
                </View>
                <Text style={styles.reason}>“{change.reason}”</Text>

                {audit ? (
                  <View style={styles.auditTrail}>
                    <Text style={styles.auditText}>
                      Entrenador original: {audit.original_trainer_name}
                    </Text>
                    <Text style={styles.auditText}>
                      Responsable: {audit.responsible_trainer_name}
                    </Text>
                    {audit.rejected_by_name ? (
                      <Text style={styles.auditRejected}>
                        Rechazado por: {audit.rejected_by_name}
                        {audit.rejected_at ? ` · ${formatAuditDateTime(audit.rejected_at)}` : ''}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {recovered ? (
                  <View style={styles.recoveredRow}>
                    <Feather color={adminColors.available} name="check-circle" size={14} />
                    <Text style={styles.recoveredText}>
                      Recuperado el {formatSpanishDay(new Date(recovered.start_at))},{' '}
                      {timeRange(recovered.start_at, recovered.end_at)}
                    </Text>
                  </View>
                ) : null}
              </AdminCard>
            );
          })}
        </View>
      )}
    </AdminScrollScreen>
  );
}

function isTrainerChangeFinished(change: BookingChangeRequest) {
  return (
    change.status === 'recovered' ||
    change.status === 'rejected' ||
    (change.status === 'lost' && Date.now() > new Date(change.recovery_deadline).getTime())
  );
}

function trainerStatusPresentation(change: BookingChangeRequest) {
  if (change.status === 'recovered') {
    return {
      background: adminColors.availableTint,
      color: adminColors.available,
      label: 'RECUPERADO',
    };
  }
  if (change.status === 'rejected') {
    return {
      background: adminColors.urgentTint,
      color: adminColors.urgent,
      label: 'CAMBIO RECHAZADO',
    };
  }
  if (change.status === 'lost' && Date.now() > new Date(change.recovery_deadline).getTime()) {
    return {
      background: adminColors.urgentTint,
      color: adminColors.urgent,
      label: 'PERDIDO',
    };
  }
  return {
    background: adminColors.amberTint,
    color: adminColors.amber,
    label: change.change_kind === 'group' ? 'PENDIENTE RECUPERAR' : 'CAMBIO PENDIENTE',
  };
}

function formatAuditDateTime(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusPresentation(change: BookingChangeRequest) {
  if (change.status === 'recovered') {
    return {
      background: adminColors.availableTint,
      color: adminColors.available,
      label: 'RECUPERADO',
    };
  }
  if (change.status === 'pending') {
    return {
      background: adminColors.amberTint,
      color: adminColors.amber,
      label: 'CAMBIO PENDIENTE',
    };
  }
  if (change.status === 'rejected' && Date.now() < new Date(change.original_end_at).getTime()) {
    return {
      background: adminColors.amberTint,
      color: adminColors.amber,
      label: 'NO CAMBIADO',
    };
  }
  if (change.status === 'lost' && Date.now() <= new Date(change.recovery_deadline).getTime()) {
    return {
      background: adminColors.amberTint,
      color: adminColors.amber,
      label: 'PENDIENTE DE RECUPERAR',
    };
  }
  return {
    background: adminColors.urgentTint,
    color: adminColors.urgent,
    label: 'PERDIDO',
  };
}

const styles = StyleSheet.create({
  gap: { marginTop: 10 },
  trainerFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 18,
  },
  list: { gap: 9 },
  cardHeading: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  kindIcon: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCardMuted,
    borderColor: adminColors.border,
    borderRadius: 17,
    borderWidth: adminHairline,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  copy: { flex: 1, flexShrink: 1 },
  date: { ...adminType.rowTitle },
  meta: { ...adminType.secondary, marginTop: 3 },
  badge: { borderRadius: adminRadius.pill, paddingHorizontal: 8, paddingVertical: 5 },
  badgeText: { ...adminType.badge },
  reason: { color: adminColors.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 12 },
  info: { color: adminColors.textFaint, fontSize: 10, lineHeight: 15, marginTop: 8 },
  recoveredRow: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 10 },
  recoveredText: { color: adminColors.available, flex: 1, fontSize: 10, lineHeight: 15 },
  trainerOriginal: {
    backgroundColor: adminColors.bgCardMuted,
    borderColor: adminColors.border,
    borderRadius: 8,
    borderWidth: adminHairline,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  trainerOriginalLabel: { ...adminType.eyebrow, fontSize: 9 },
  trainerOriginalValue: {
    color: adminColors.textPrimary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  auditTrail: {
    borderTopColor: adminColors.border,
    borderTopWidth: adminHairline,
    gap: 4,
    marginTop: 11,
    paddingTop: 10,
  },
  auditText: {
    color: adminColors.textSecondary,
    fontSize: 10,
    lineHeight: 15,
  },
  auditRejected: {
    color: adminColors.urgent,
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 15,
  },
  action: {
    alignItems: 'center',
    borderTopColor: adminColors.border,
    borderTopWidth: adminHairline,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 11,
  },
  actionText: { color: adminColors.amber, fontSize: 11, fontWeight: '500' },
  pressed: { opacity: 0.7 },
});
