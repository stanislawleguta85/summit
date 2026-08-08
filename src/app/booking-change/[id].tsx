import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import {
  AdminCard,
  AdminHeader,
  AdminScrollScreen,
  EmptyState,
  HeaderIconButton,
  PrimaryButton,
  SkeletonBlock,
} from '@/components/admin/admin-ui';
import { adminColors, adminHairline, adminType } from '@/constants/admin-theme';
import { formatSpanishDay, formatSpanishDayWithYear, timeRange } from '@/lib/admin-data';
import {
  supabase,
  type BookingChangeAlternative,
  type BookingChangeRequest,
} from '@/lib/supabase';

export default function BookingChangeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [change, setChange] = useState<BookingChangeRequest | null>(null);
  const [alternatives, setAlternatives] = useState<BookingChangeAlternative[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (asRefresh = false) => {
    if (!id) return;
    if (asRefresh) setRefreshing(true);
    setError(null);

    try {
      const changeResult = await supabase
        .from('booking_change_requests')
        .select('*')
        .eq('id', id)
        .single();
      if (changeResult.error) throw changeResult.error;

      const nextChange = changeResult.data as BookingChangeRequest;
      setChange(nextChange);

      if (nextChange.change_kind === 'group' && nextChange.status === 'lost') {
        const alternativeResult = await supabase.rpc('get_booking_change_alternatives_v2', {
          target_change_id: id,
        });
        if (alternativeResult.error) throw alternativeResult.error;
        setAlternatives((alternativeResult.data ?? []) as BookingChangeAlternative[]);
      } else {
        setAlternatives([]);
      }
    } catch (loadError: any) {
      setError(loadError.message || 'La solicitud de cambio no se pudo cargar.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const confirmAlternative = (alternative: BookingChangeAlternative) => {
    Alert.alert(
      'Confirmar recuperación',
      `${formatSpanishDay(new Date(alternative.start_at))}, ${timeRange(
        alternative.start_at,
        alternative.end_at
      )}. Esta elección es definitiva.`,
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: () => void recover(alternative),
        },
      ]
    );
  };

  const recover = async (alternative: BookingChangeAlternative) => {
    if (!id || submittingId) return;
    setSubmittingId(alternative.session_id);
    try {
      const { error: recoverError } = await supabase.rpc('recover_group_booking', {
        target_change_id: id,
        target_session_id: alternative.session_id,
      });
      if (recoverError) throw recoverError;

      Alert.alert('Horario recuperado', 'La nueva reserva aparece ya en tu calendario.', [
        { text: 'Ver calendario', onPress: () => router.replace('/') },
      ]);
    } catch (recoverError: any) {
      Alert.alert(
        'No se pudo reservar',
        recoverError.message || 'La plaza puede haberse ocupado. Actualiza la lista.'
      );
      await load(true);
    } finally {
      setSubmittingId(null);
    }
  };

  const joinWaitlist = async () => {
    if (!id || joiningWaitlist) return;
    setJoiningWaitlist(true);
    try {
      const { error: waitlistError } = await supabase.rpc(
        'join_booking_change_waitlist',
        { target_change_id: id }
      );
      if (waitlistError) throw waitlistError;
      await load();
      Alert.alert(
        'Aviso activado',
        'Te avisaremos si se libera una plaza compatible dentro del plazo de cuatro semanas.'
      );
    } catch (waitlistError: any) {
      Alert.alert(
        'No se pudo activar el aviso',
        waitlistError.message || 'Actualiza la lista e inténtalo de nuevo.'
      );
      await load(true);
    } finally {
      setJoiningWaitlist(false);
    }
  };

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
      <AdminHeader
        eyebrow="ALTERNATIVAS"
        title="Recuperar entrenamiento"
        right={
          <HeaderIconButton
            accessibilityLabel="Volver"
            icon="x"
            onPress={() => router.back()}
          />
        }
      />

      {loading ? (
        <>
          <SkeletonBlock height={90} />
          <SkeletonBlock height={90} style={styles.gap} />
        </>
      ) : error ? (
        <EmptyState
          actionLabel="Intentar de nuevo"
          message={error}
          onAction={() => void load()}
          title="No se pudo cargar"
        />
      ) : !change ? (
        <EmptyState title="Solicitud no encontrada" />
      ) : change.status === 'recovered' ? (
        <EmptyState
          actionLabel="Ver calendario"
          message="Ya elegiste y confirmaste un horario alternativo."
          onAction={() => router.replace('/')}
          title="Entrenamiento recuperado"
        />
      ) : change.status !== 'lost' || change.change_kind !== 'group' ? (
        <EmptyState
          actionLabel="Ver mis cambios"
          message="Este cambio se gestiona con las propuestas de tu entrenador."
          onAction={() => router.replace('/changes' as Href)}
          title="Cambio individual"
        />
      ) : (
        <>
          <AdminCard muted>
            <Text style={styles.originalLabel}>ENTRENAMIENTO ORIGINAL</Text>
            <Text style={styles.originalDate}>
              {formatSpanishDay(new Date(change.original_start_at))}
            </Text>
            <Text style={styles.meta}>
              {timeRange(change.original_start_at, change.original_end_at)}
            </Text>
            <Text style={styles.reason}>Motivo: {change.reason}</Text>
            <Text style={styles.deadline}>
              Puedes recuperar el entrenamiento hasta el{' '}
              {formatSpanishDayWithYear(new Date(change.recovery_deadline))}.
            </Text>
          </AdminCard>

          <View style={styles.headingRow}>
            <Text style={styles.heading}>Horarios disponibles</Text>
            <Text style={styles.count}>{alternatives.length}</Text>
          </View>

          {alternatives.length > 0 ? (
            <View style={styles.list}>
              {alternatives.map((alternative) => (
                <AdminCard key={alternative.session_id}>
                  <View style={styles.alternativeRow}>
                    <View style={styles.copy}>
                      <Text style={styles.date}>
                        {formatSpanishDay(new Date(alternative.start_at))}
                      </Text>
                      <Text style={styles.title}>{alternative.title}</Text>
                      <Text style={styles.meta}>
                        {timeRange(alternative.start_at, alternative.end_at)}
                        {alternative.room ? ` · ${alternative.room}` : ''}
                      </Text>
                      <Text style={styles.trainer}>
                        Entrenador: {alternative.trainer_name || 'Por confirmar'}
                      </Text>
                      <Text style={styles.places}>
                        {alternative.available_places}{' '}
                        {alternative.available_places === 1 ? 'plaza libre' : 'plazas libres'}
                      </Text>
                    </View>
                    <Pressable
                      disabled={submittingId !== null}
                      onPress={() => confirmAlternative(alternative)}
                      style={({ pressed }) => [
                        styles.selectButton,
                        pressed && styles.pressed,
                        submittingId !== null && styles.disabled,
                      ]}>
                      <Text style={styles.selectButtonText}>Elegir</Text>
                      <Feather color={adminColors.amber} name="chevron-right" size={15} />
                    </Pressable>
                  </View>
                </AdminCard>
              ))}
            </View>
          ) : (
            <>
              <EmptyState
                message="Ahora mismo no hay un entrenamiento compatible con plaza libre dentro de las próximas cuatro semanas."
                title="No hay horarios disponibles"
              />
              <PrimaryButton
                disabled={joiningWaitlist || change.waitlist_status === 'waiting'}
                onPress={() => void joinWaitlist()}>
                {change.waitlist_status === 'waiting'
                  ? 'Aviso activado'
                  : joiningWaitlist
                    ? 'Activando…'
                    : 'Avisarme si se libera una plaza'}
              </PrimaryButton>
              {change.waitlist_status === 'waiting' ? (
                <Text style={styles.waitlistHint}>
                  Si se libera una plaza, recibirás una notificación que te traerá de vuelta a
                  esta pantalla. La plaza no queda reservada hasta que la confirmes.
                </Text>
              ) : null}
            </>
          )}
        </>
      )}
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 10 },
  originalLabel: { ...adminType.eyebrow },
  originalDate: { ...adminType.rowTitle, marginTop: 8 },
  reason: { ...adminType.secondary, lineHeight: 17, marginTop: 10 },
  deadline: { color: adminColors.textFaint, fontSize: 10, lineHeight: 15, marginTop: 8 },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 20,
  },
  heading: { ...adminType.section },
  count: { color: adminColors.amber, fontSize: 12, fontWeight: '600' },
  list: { gap: 8 },
  alternativeRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  copy: { flex: 1, flexShrink: 1 },
  date: { color: adminColors.amber, fontSize: 11, fontWeight: '600' },
  title: { ...adminType.rowTitle, marginTop: 4 },
  meta: { ...adminType.secondary, lineHeight: 17, marginTop: 3 },
  places: { color: adminColors.available, fontSize: 10, marginTop: 5 },
  trainer: { color: adminColors.textSecondary, fontSize: 10, marginTop: 4 },
  selectButton: {
    alignItems: 'center',
    backgroundColor: adminColors.amberTint,
    borderColor: adminColors.amber,
    borderRadius: 8,
    borderWidth: adminHairline,
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectButtonText: { color: adminColors.amber, fontSize: 11, fontWeight: '600' },
  waitlistHint: {
    color: adminColors.textSecondary,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 10,
    textAlign: 'center',
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
});
