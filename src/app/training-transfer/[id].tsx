import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AdminCard,
  AdminScrollScreen,
  AdminTextInput,
  EmptyState,
  InitialAvatar,
  PrimaryButton,
  SkeletonBlock,
} from '@/components/admin/admin-ui';
import { adminColors, adminHairline, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import {
  supabase,
  type PersonalTrainingRequest,
  type PersonalTrainingRequestTransfer,
  type PersonalTrainingTransferCandidate,
  type UserProfile,
} from '@/lib/supabase';

export default function TrainingTransferScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { hasPermission, userProfile } = useAuth();
  const canTransfer = hasPermission('training_requests', 'transfer', 'assigned');
  const [request, setRequest] = useState<PersonalTrainingRequest | null>(null);
  const [customer, setCustomer] = useState<UserProfile | null>(null);
  const [candidates, setCandidates] = useState<PersonalTrainingTransferCandidate[]>([]);
  const [pendingTransfer, setPendingTransfer] =
    useState<PersonalTrainingRequestTransfer | null>(null);
  const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !userProfile || !canTransfer) {
      setLoading(false);
      return;
    }

    setError(null);
    try {
      const { data: requestData, error: requestError } = await supabase
        .from('personal_training_requests')
        .select('*')
        .eq('id', id)
        .eq('trainer_id', userProfile.user_id)
        .single();
      if (requestError) throw requestError;

      const loadedRequest = requestData as PersonalTrainingRequest;
      const [profileResult, candidateResult, transferResult] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', loadedRequest.customer_id)
          .single(),
        supabase.rpc('get_personal_training_transfer_candidates', {
          target_request_id: loadedRequest.id,
        }),
        supabase
          .from('personal_training_request_transfers')
          .select('*')
          .eq('request_id', loadedRequest.id)
          .eq('status', 'pending')
          .maybeSingle(),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (candidateResult.error) throw candidateResult.error;
      if (transferResult.error) throw transferResult.error;

      setRequest(loadedRequest);
      setCustomer(profileResult.data as UserProfile);
      setCandidates(
        (candidateResult.data ?? []) as PersonalTrainingTransferCandidate[]
      );
      setPendingTransfer(
        (transferResult.data as PersonalTrainingRequestTransfer | null) ?? null
      );
    } catch (loadError: any) {
      setError(loadError.message || 'La transferencia no se pudo cargar.');
    } finally {
      setLoading(false);
    }
  }, [canTransfer, id, userProfile?.user_id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!userProfile || !canTransfer) {
    return (
      <View style={styles.denied}>
        <Text style={styles.secondary}>No tienes permiso para transferir solicitudes.</Text>
      </View>
    );
  }

  const selectedTrainer = candidates.find(
    (candidate) => candidate.user_id === selectedTrainerId
  );
  const pendingTrainer = candidates.find(
    (candidate) => candidate.user_id === pendingTransfer?.to_trainer_id
  );

  const confirmTransfer = () => {
    if (!request || !selectedTrainer || submitting) return;

    Alert.alert(
      'Transferir solicitud',
      request.change_request_id
        ? `¿Enviar la búsqueda de un horario alternativo a ${formatName(selectedTrainer)}? La cita original seguirá reservada hasta que el cliente confirme otra.`
        : `¿Enviar la solicitud a ${formatName(selectedTrainer)}? Los horarios enviados actualmente se retirarán.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Transferir', onPress: () => void submitTransfer() },
      ]
    );
  };

  const submitTransfer = async () => {
    if (!request || !selectedTrainerId || submitting) return;
    setSubmitting(true);
    try {
      const { error: transferError } = await supabase.rpc(
        'request_personal_training_transfer',
        {
          target_request_id: request.id,
          target_trainer_id: selectedTrainerId,
          transfer_note: request.change_request_id
            ? ['CAMBIO DE CITA', note.trim()].filter(Boolean).join(' · ').slice(0, 500)
            : note.trim() || null,
        }
      );
      if (transferError) throw transferError;

      Alert.alert(
        'Transferencia enviada',
        'El otro entrenador debe aceptar antes de recibir la solicitud.',
        [{ text: 'Aceptar', onPress: () => router.back() }]
      );
    } catch (transferError: any) {
      Alert.alert(
        'No se pudo transferir',
        transferError.message || 'Inténtalo de nuevo.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const confirmCancellation = () => {
    if (!pendingTransfer || submitting) return;
    Alert.alert(
      'Cancelar transferencia',
      'La solicitud permanecerá contigo y podrás volver a proponer horarios.',
      [
        { text: 'Volver', style: 'cancel' },
        { text: 'Cancelar transferencia', style: 'destructive', onPress: () => void cancelTransfer() },
      ]
    );
  };

  const cancelTransfer = async () => {
    if (!pendingTransfer || submitting) return;
    setSubmitting(true);
    try {
      const { error: cancelError } = await supabase.rpc(
        'cancel_personal_training_transfer',
        { target_transfer_id: pendingTransfer.id }
      );
      if (cancelError) throw cancelError;

      Alert.alert('Transferencia cancelada', 'La solicitud vuelve a estar disponible para ti.', [
        { text: 'Aceptar', onPress: () => router.back() },
      ]);
    } catch (cancelError: any) {
      Alert.alert(
        'No se pudo cancelar',
        cancelError.message || 'Actualiza la pantalla e inténtalo de nuevo.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminScrollScreen includeTabInset={false}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Feather color={adminColors.textPrimary} name="arrow-left" size={18} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>ENTRENAMIENTO INDIVIDUAL</Text>
          <Text style={styles.title}>Transferir solicitud</Text>
        </View>
      </View>

      {loading ? (
        <>
          <SkeletonBlock height={82} />
          <SkeletonBlock height={180} />
        </>
      ) : error ? (
        <AdminCard>
          <Text style={styles.error}>{error}</Text>
        </AdminCard>
      ) : (
        <>
          <AdminCard style={styles.customerCard}>
            <InitialAvatar
              firstName={customer?.first_name}
              lastName={customer?.last_name}
            />
            <View style={styles.cardCopy}>
              {request?.change_request_id ? (
                <Text style={styles.replacementBadge}>CAMBIO DE CITA</Text>
              ) : null}
              <Text style={styles.cardTitle}>{formatName(customer)}</Text>
              <Text style={styles.secondary}>
                {request?.change_request_id
                  ? 'Se transfiere únicamente la búsqueda del horario alternativo. La cita original no cambia todavía.'
                  : 'Esta transferencia solo afecta a esta solicitud.'}
              </Text>
            </View>
          </AdminCard>

          {pendingTransfer ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Esperando respuesta</Text>
              <AdminCard>
                <Text style={styles.cardTitle}>
                  {pendingTrainer ? formatName(pendingTrainer) : 'Otro entrenador'}
                </Text>
                <Text style={styles.secondary}>
                  Enviada: {formatDateTime(pendingTransfer.requested_at)}
                </Text>
                {pendingTransfer.note ? (
                  <Text style={styles.note}>{pendingTransfer.note}</Text>
                ) : null}
              </AdminCard>
              <Text style={styles.warning}>
                Mientras la transferencia esté pendiente no se pueden enviar nuevos horarios.
              </Text>
              <PrimaryButton
                disabled={submitting}
                onPress={confirmCancellation}
                secondary>
                {submitting ? 'Cancelando…' : 'Cancelar transferencia'}
              </PrimaryButton>
            </View>
          ) : candidates.length === 0 ? (
            <View style={styles.section}>
              <EmptyState
                message="No hay otro entrenador aprobado con permisos para responder esta solicitud."
                title="No hay entrenadores disponibles"
              />
            </View>
          ) : (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Selecciona un entrenador</Text>
                {candidates.map((candidate) => {
                  const selected = candidate.user_id === selectedTrainerId;
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      key={candidate.user_id}
                      onPress={() => setSelectedTrainerId(candidate.user_id)}
                      style={({ pressed }) => [
                        styles.trainerRow,
                        selected && styles.trainerRowSelected,
                        pressed && styles.pressed,
                      ]}>
                      <InitialAvatar
                        firstName={candidate.first_name}
                        lastName={candidate.last_name}
                        staff
                      />
                      <Text style={styles.trainerName}>{formatName(candidate)}</Text>
                      <Feather
                        color={selected ? adminColors.amber : adminColors.textMuted}
                        name={selected ? 'check-circle' : 'circle'}
                        size={18}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.section}>
                <AdminTextInput
                  label="Nota para el entrenador (opcional)"
                  maxLength={500}
                  multiline
                  onChangeText={setNote}
                  placeholder="Por ejemplo: ya hemos hablado; el cliente prefiere las mañanas."
                  style={styles.noteInput}
                  value={note}
                />
                <Text style={styles.warning}>
                  Al solicitar la transferencia se retirarán los horarios que ya hayas enviado.
                </Text>
              </View>

              <PrimaryButton
                disabled={!selectedTrainerId || submitting}
                onPress={confirmTransfer}>
                {submitting ? 'Enviando…' : 'Solicitar transferencia'}
              </PrimaryButton>
            </>
          )}
        </>
      )}
    </AdminScrollScreen>
  );
}

function formatName(profile: {
  first_name?: string | null;
  last_name?: string | null;
} | null) {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Cliente';
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
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
    gap: 10,
    marginBottom: 20,
  },
  backButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    ...adminType.eyebrow,
  },
  title: {
    ...adminType.title,
    marginTop: 4,
  },
  customerCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    ...adminType.rowTitle,
  },
  replacementBadge: {
    ...adminType.eyebrow,
    marginBottom: 4,
  },
  secondary: {
    ...adminType.secondary,
    lineHeight: 17,
    marginTop: 3,
  },
  section: {
    gap: 8,
    marginVertical: 18,
  },
  sectionTitle: {
    ...adminType.section,
    marginBottom: 2,
  },
  trainerRow: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.border,
    borderRadius: 12,
    borderWidth: adminHairline,
    flexDirection: 'row',
    gap: 10,
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  trainerRowSelected: {
    backgroundColor: adminColors.amberTint,
    borderColor: adminColors.amber,
  },
  trainerName: {
    ...adminType.rowTitle,
    flex: 1,
  },
  noteInput: {
    minHeight: 92,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  note: {
    color: adminColors.textPrimary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  warning: {
    color: adminColors.warning,
    fontSize: 11,
    lineHeight: 16,
  },
  error: {
    color: adminColors.urgent,
    fontSize: 12,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
