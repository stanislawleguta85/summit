import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import {
  AdminCard,
  AdminHeader,
  AdminScrollScreen,
  EmptyState,
  FilterChip,
  InitialAvatar,
  SectionHeading,
  SkeletonBlock,
} from '@/components/admin/admin-ui';
import { adminColors, adminHairline, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import {
  supabase,
  type BookingChangeRequest,
  type IncomingPersonalTrainingTransfer,
  type PersonalTrainingRequest,
  type UserProfile,
} from '@/lib/supabase';

type RequestFilter = 'all' | 'todo' | 'sent' | 'transfer';

export default function TrainingRequestsScreen() {
  const router = useRouter();
  const { hasPermission, userProfile } = useAuth();
  const canReadAssignedRequests = hasPermission(
    'training_requests',
    'read',
    'assigned'
  );
  const canTransferRequests = hasPermission(
    'training_requests',
    'transfer',
    'assigned'
  );
  const [requests, setRequests] = useState<PersonalTrainingRequest[]>([]);
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [bookingChanges, setBookingChanges] = useState<
    Record<string, BookingChangeRequest>
  >({});
  const [incomingTransfers, setIncomingTransfers] = useState<
    IncomingPersonalTrainingTransfer[]
  >([]);
  const [outgoingTransferRequestIds, setOutgoingTransferRequestIds] = useState<string[]>([]);
  const [respondingTransferId, setRespondingTransferId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RequestFilter>('todo');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (asRefresh = false) => {
      if (!userProfile || !canReadAssignedRequests) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (asRefresh) setRefreshing(true);
      setError(null);

      try {
        const [requestResult, transferResult, outgoingTransferResult] = await Promise.all([
          supabase
            .from('personal_training_requests')
            .select('*')
            .eq('trainer_id', userProfile.user_id)
            .in('status', ['requested', 'proposed'])
            .order('requested_at', { ascending: true }),
          canTransferRequests
            ? supabase.rpc('get_incoming_personal_training_transfers')
            : Promise.resolve({ data: [], error: null }),
          canTransferRequests
            ? supabase
                .from('personal_training_request_transfers')
                .select('request_id')
                .eq('from_trainer_id', userProfile.user_id)
                .eq('status', 'pending')
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (requestResult.error) throw requestResult.error;
        if (transferResult.error) throw transferResult.error;
        if (outgoingTransferResult.error) throw outgoingTransferResult.error;

        const loadedRequests = (requestResult.data ?? []) as PersonalTrainingRequest[];
        const customerIds = [...new Set(loadedRequests.map((request) => request.customer_id))];
        const changeIds = loadedRequests
          .map((request) => request.change_request_id)
          .filter((value): value is string => Boolean(value));
        const [profileResult, changeResult] = await Promise.all([
          customerIds.length > 0
            ? supabase.from('user_profiles').select('*').in('user_id', customerIds)
            : Promise.resolve({ data: [], error: null }),
          changeIds.length > 0
            ? supabase.from('booking_change_requests').select('*').in('id', changeIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (profileResult.error) throw profileResult.error;
        if (changeResult.error) throw changeResult.error;

        setRequests(loadedRequests);
        setCustomers((profileResult.data ?? []) as UserProfile[]);
        setBookingChanges(
          ((changeResult.data ?? []) as BookingChangeRequest[]).reduce<
            Record<string, BookingChangeRequest>
          >((result, change) => {
            result[change.id] = change;
            return result;
          }, {})
        );
        setIncomingTransfers(
          (transferResult.data ?? []) as IncomingPersonalTrainingTransfer[]
        );
        setOutgoingTransferRequestIds(
          (outgoingTransferResult.data ?? []).map((transfer) => transfer.request_id)
        );
      } catch (loadError: any) {
        setError(loadError.message || 'Las solicitudes no se pudieron cargar.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canReadAssignedRequests, canTransferRequests, userProfile?.user_id]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const confirmTransferResponse = (
    transfer: IncomingPersonalTrainingTransfer,
    response: 'accepted' | 'declined'
  ) => {
    const accepting = response === 'accepted';
    Alert.alert(
      accepting ? 'Aceptar solicitud' : 'Rechazar transferencia',
      accepting
        ? `Pasarás a ser responsable de la solicitud de ${transfer.customer_name}.`
        : `La solicitud permanecerá con ${transfer.from_trainer_name}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: accepting ? 'Aceptar' : 'Rechazar',
          style: accepting ? 'default' : 'destructive',
          onPress: () => void respondToTransfer(transfer.transfer_id, response),
        },
      ]
    );
  };

  const respondToTransfer = async (
    transferId: string,
    response: 'accepted' | 'declined'
  ) => {
    if (respondingTransferId) return;
    setRespondingTransferId(transferId);
    try {
      const { error: responseError } = await supabase.rpc(
        'respond_personal_training_transfer',
        {
          target_transfer_id: transferId,
          new_status: response,
        }
      );
      if (responseError) throw responseError;

      Alert.alert(
        response === 'accepted' ? 'Solicitud aceptada' : 'Transferencia rechazada',
        response === 'accepted'
          ? 'Ya puedes abrir la solicitud y proponer tus horarios.'
          : 'El entrenador anterior ha sido informado.'
      );
      await load(true);
    } catch (responseError: any) {
      Alert.alert(
        'No se pudo responder',
        responseError.message || 'Actualiza la pantalla e inténtalo de nuevo.'
      );
    } finally {
      setRespondingTransferId(null);
    }
  };

  if (!userProfile || !canReadAssignedRequests) {
    return (
      <View style={styles.denied}>
        <Text style={styles.secondary}>Esta sección está disponible para entrenadores.</Text>
      </View>
    );
  }

  const filteredRequests = requests.filter((request) => {
    const transferPending = outgoingTransferRequestIds.includes(request.id);
    if (filter === 'transfer') return transferPending;
    if (filter === 'todo') return request.status === 'requested' && !transferPending;
    if (filter === 'sent') return request.status === 'proposed' && !transferPending;
    return true;
  });
  const visibleIncomingTransfers = filter === 'all' || filter === 'transfer';
  const visibleRequestCount = filteredRequests.length +
    (visibleIncomingTransfers ? incomingTransfers.length : 0);

  return (
    <AdminScrollScreen
      refreshControl={
        <RefreshControl
          onRefresh={() => void load(true)}
          refreshing={refreshing}
          tintColor={adminColors.amber}
        />
      }>
      <AdminHeader
        eyebrow="SOLICITUDES"
        title={`${requests.length} entrenamiento(s) · ${incomingTransfers.length} transferencia(s)`}
      />

      <View style={styles.filters}>
        <FilterChip
          active={filter === 'todo'}
          label="Por gestionar"
          onPress={() => setFilter('todo')}
        />
        <FilterChip
          active={filter === 'sent'}
          label="Enviadas"
          onPress={() => setFilter('sent')}
        />
        <FilterChip
          active={filter === 'transfer'}
          label="Traspasos"
          onPress={() => setFilter('transfer')}
        />
        <FilterChip active={filter === 'all'} label="Todos" onPress={() => setFilter('all')} />
      </View>

      {loading ? (
        <View>
          <SkeletonBlock height={88} />
          <SkeletonBlock height={88} />
        </View>
      ) : error ? (
        <AdminCard>
          <Text style={styles.error}>{error}</Text>
        </AdminCard>
      ) : visibleRequestCount === 0 ? (
        <EmptyState
          message={
            filter === 'all'
              ? 'Las nuevas solicitudes de tus clientes aparecerán aquí.'
              : 'No hay solicitudes que coincidan con este filtro.'
          }
          title={filter === 'all' ? 'No hay solicitudes pendientes' : 'Sin resultados'}
        />
      ) : (
        <View style={styles.list}>
          {visibleIncomingTransfers && incomingTransfers.length > 0 ? (
            <View style={styles.transferSection}>
              <SectionHeading title="Transferencias para ti" />
              {incomingTransfers.map((transfer) => {
                const responding = respondingTransferId === transfer.transfer_id;
                return (
                  <AdminCard key={transfer.transfer_id} style={styles.transferCard}>
                    <View style={styles.transferHeading}>
                      <InitialAvatar />
                      <View style={styles.requestCopy}>
                        <Text style={styles.requestName}>{transfer.customer_name}</Text>
                        <Text style={styles.secondary}>
                          Enviada por {transfer.from_trainer_name} ·{' '}
                          {formatDateTime(transfer.requested_at)}
                        </Text>
                      </View>
                    </View>
                    {transfer.note ? (
                      <Text style={styles.transferNote}>{transfer.note}</Text>
                    ) : null}
                    <View style={styles.transferActions}>
                      <Pressable
                        disabled={Boolean(respondingTransferId)}
                        onPress={() => confirmTransferResponse(transfer, 'declined')}
                        style={({ pressed }) => [
                          styles.transferAction,
                          styles.declineAction,
                          pressed && styles.pressed,
                          respondingTransferId && styles.disabled,
                        ]}>
                        <Text style={styles.declineActionText}>Rechazar</Text>
                      </Pressable>
                      <Pressable
                        disabled={Boolean(respondingTransferId)}
                        onPress={() => confirmTransferResponse(transfer, 'accepted')}
                        style={({ pressed }) => [
                          styles.transferAction,
                          styles.acceptAction,
                          pressed && styles.pressed,
                          respondingTransferId && styles.disabled,
                        ]}>
                        <Text style={styles.acceptActionText}>
                          {responding ? 'Guardando…' : 'Aceptar'}
                        </Text>
                      </Pressable>
                    </View>
                  </AdminCard>
                );
              })}
            </View>
          ) : null}

          {filteredRequests.length > 0 && visibleIncomingTransfers && incomingTransfers.length > 0 ? (
            <SectionHeading title="Tus solicitudes" />
          ) : null}
          {filteredRequests.map((request) => {
            const customer = customers.find(
              (profile) => profile.user_id === request.customer_id
            );
            const transferPending = outgoingTransferRequestIds.includes(request.id);
            const bookingChange = request.change_request_id
              ? bookingChanges[request.change_request_id]
              : undefined;
            return (
              <Pressable
                key={request.id}
                onPress={() =>
                  router.push(`/training-request/${request.id}` as Href)
                }
                style={({ pressed }) => pressed && styles.pressed}>
                <AdminCard style={styles.requestCard}>
                  <InitialAvatar
                    firstName={customer?.first_name}
                    lastName={customer?.last_name}
                  />
                  <View style={styles.requestCopy}>
                    <Text style={styles.requestName}>
                      {[customer?.first_name, customer?.last_name]
                        .filter(Boolean)
                        .join(' ') || 'Cliente'}
                    </Text>
                    <Text style={styles.secondary}>
                      {request.change_request_id
                        ? request.status === 'proposed'
                          ? 'Alternativas enviadas al cliente'
                          : 'Solicita un horario alternativo para una cita existente'
                        : transferPending
                        ? 'Esperando respuesta del otro entrenador'
                        : request.status === 'requested'
                        ? 'Necesita propuestas de horario'
                        : 'Horarios enviados al cliente'}
                    </Text>
                    {bookingChange ? (
                      <Text style={styles.changeAppointment}>
                        {formatOriginalAppointment(
                          bookingChange.original_start_at,
                          bookingChange.original_end_at
                        )}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      request.status === 'requested' && !transferPending && styles.statusBadgeUrgent,
                    ]}>
                    <Text
                      style={[
                        styles.statusText,
                        request.status === 'requested' && !transferPending && styles.statusTextUrgent,
                      ]}>
                      {transferPending
                        ? 'TRASPASO'
                        : request.change_request_id
                          ? request.status === 'proposed'
                            ? 'CAMBIO ENVIADO'
                            : 'CAMBIO PENDIENTE'
                        : request.status === 'requested'
                          ? 'NUEVA'
                          : 'ENVIADA'}
                    </Text>
                  </View>
                  <Feather color={adminColors.textMuted} name="chevron-right" size={16} />
                </AdminCard>
              </Pressable>
            );
          })}
        </View>
      )}
    </AdminScrollScreen>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatOriginalAppointment(startValue: string, endValue: string) {
  const start = new Date(startValue);
  const date = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    year: 'numeric',
  }).format(start);
  const time = new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const normalizedDate = date.charAt(0).toLocaleUpperCase('es-ES') + date.slice(1);
  return `Cita original: ${normalizedDate} · ${time.format(start)}–${time.format(
    new Date(endValue)
  )}`;
}

const styles = StyleSheet.create({
  denied: {
    alignItems: 'center',
    backgroundColor: adminColors.bgPage,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  list: {
    gap: 8,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 18,
  },
  transferSection: {
    gap: 8,
    marginBottom: 14,
  },
  transferCard: {
    gap: 12,
  },
  transferHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  transferNote: {
    color: adminColors.textPrimary,
    fontSize: 12,
    lineHeight: 18,
  },
  transferActions: {
    flexDirection: 'row',
    gap: 8,
  },
  transferAction: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  declineAction: {
    backgroundColor: adminColors.bgCardMuted,
    borderColor: adminColors.borderStrong,
    borderWidth: adminHairline,
  },
  declineActionText: {
    color: adminColors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  acceptAction: {
    backgroundColor: adminColors.amber,
  },
  acceptActionText: {
    color: adminColors.amberOn,
    fontSize: 12,
    fontWeight: '600',
  },
  requestCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  requestCopy: {
    flex: 1,
  },
  requestName: {
    ...adminType.rowTitle,
  },
  secondary: {
    ...adminType.secondary,
    marginTop: 3,
  },
  changeAppointment: {
    color: adminColors.amber,
    fontSize: 10,
    fontWeight: '500',
    marginTop: 5,
  },
  statusBadge: {
    backgroundColor: adminColors.amberTint,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  statusBadgeUrgent: {
    backgroundColor: adminColors.urgentTint,
  },
  statusText: {
    color: adminColors.amber,
    fontSize: 8,
    fontWeight: '500',
  },
  statusTextUrgent: {
    color: adminColors.urgent,
  },
  error: {
    color: adminColors.urgent,
    fontSize: 12,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.55,
  },
});
