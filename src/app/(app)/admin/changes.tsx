import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import {
  AdminCard,
  AdminHeader,
  AdminScrollScreen,
  EmptyState,
  InitialAvatar,
  SkeletonBlock,
} from '@/components/admin/admin-ui';
import { adminColors, adminRadius, adminType } from '@/constants/admin-theme';
import { formatSpanishDay, timeRange } from '@/lib/admin-data';
import { supabase, type BookingChangeRequest } from '@/lib/supabase';

type ChangeCustomer = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
};

type RecoveredSession = { id: string; start_at: string; end_at: string };

export default function AdminChangesScreen() {
  const [changes, setChanges] = useState<BookingChangeRequest[]>([]);
  const [customers, setCustomers] = useState<Record<string, ChangeCustomer>>({});
  const [sessions, setSessions] = useState<Record<string, RecoveredSession>>({});
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
      const customerIds = [...new Set(nextChanges.map((change) => change.customer_id))];
      const sessionIds = [
        ...new Set(
          nextChanges
            .map((change) => change.recovered_session_id)
            .filter((value): value is string => Boolean(value))
        ),
      ];

      const [customerResult, sessionResult] = await Promise.all([
        customerIds.length
          ? supabase
              .from('user_profiles')
              .select('user_id,first_name,last_name')
              .in('user_id', customerIds)
          : Promise.resolve({ data: [], error: null }),
        sessionIds.length
          ? supabase
              .from('course_sessions')
              .select('id,start_at,end_at')
              .in('id', sessionIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (customerResult.error) throw customerResult.error;
      if (sessionResult.error) throw sessionResult.error;

      setCustomers(
        ((customerResult.data ?? []) as ChangeCustomer[]).reduce<Record<string, ChangeCustomer>>(
          (result, customer) => {
            result[customer.user_id] = customer;
            return result;
          },
          {}
        )
      );
      setSessions(
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
      <AdminHeader eyebrow="ADMIN" title="Mis cambios" />

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
      ) : changes.length === 0 ? (
        <EmptyState title="Todavía no hay solicitudes de cambio" />
      ) : (
        <View style={styles.list}>
          {changes.map((change) => {
            const customer = customers[change.customer_id];
            const recovered = change.recovered_session_id
              ? sessions[change.recovered_session_id]
              : undefined;
            const status = adminStatus(change);

            return (
              <AdminCard key={change.id}>
                <View style={styles.heading}>
                  <InitialAvatar
                    firstName={customer?.first_name}
                    lastName={customer?.last_name}
                  />
                  <View style={styles.copy}>
                    <Text style={styles.name}>
                      {[customer?.first_name, customer?.last_name]
                        .filter(Boolean)
                        .join(' ') || 'Cliente'}
                    </Text>
                    <Text style={styles.meta}>
                      {change.change_kind === 'personal' ? 'Individual' : 'Grupo'}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: status.background }]}>
                    <Text style={[styles.badgeText, { color: status.color }]}>
                      {status.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.dateBlock}>
                  <Text style={styles.label}>CITA ORIGINAL</Text>
                  <Text style={styles.date}>
                    {formatSpanishDay(new Date(change.original_start_at))} ·{' '}
                    {timeRange(change.original_start_at, change.original_end_at)}
                  </Text>
                </View>
                <Text style={styles.reason}>Motivo: {change.reason}</Text>

                {recovered ? (
                  <View style={styles.recoveredRow}>
                    <Feather color={adminColors.available} name="check-circle" size={14} />
                    <Text style={styles.recoveredText}>
                      Recuperado: {formatSpanishDay(new Date(recovered.start_at))} ·{' '}
                      {timeRange(recovered.start_at, recovered.end_at)}
                    </Text>
                  </View>
                ) : change.status === 'rejected' ? (
                  <Text style={styles.note}>
                    No se encontró una alternativa; la cita original sigue reservada.
                  </Text>
                ) : null}
              </AdminCard>
            );
          })}
        </View>
      )}
    </AdminScrollScreen>
  );
}

function adminStatus(change: BookingChangeRequest) {
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
  list: { gap: 9 },
  heading: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  copy: { flex: 1, flexShrink: 1 },
  name: { ...adminType.rowTitle },
  meta: { ...adminType.secondary, marginTop: 2 },
  badge: { borderRadius: adminRadius.pill, paddingHorizontal: 8, paddingVertical: 5 },
  badgeText: { ...adminType.badge },
  dateBlock: { marginTop: 13 },
  label: { ...adminType.eyebrow, fontSize: 9 },
  date: { color: adminColors.textPrimary, fontSize: 11, marginTop: 5 },
  reason: { color: adminColors.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 9 },
  recoveredRow: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 10 },
  recoveredText: { color: adminColors.available, flex: 1, fontSize: 10, lineHeight: 15 },
  note: { color: adminColors.textFaint, fontSize: 10, lineHeight: 15, marginTop: 9 },
});
