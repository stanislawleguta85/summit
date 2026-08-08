import Feather from '@expo/vector-icons/Feather';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AdminCard,
  AdminScrollScreen,
  AdminTextInput,
  PrimaryButton,
  SkeletonBlock,
} from '@/components/admin/admin-ui';
import { MonthCalendar } from '@/components/admin/month-calendar';
import { adminColors, adminHairline, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import {
  supabase,
  type BookingChangeRequest,
  type PersonalTrainingProposal,
  type PersonalTrainingRequest,
  type PersonalTrainingRequestTransfer,
  type UserProfile,
} from '@/lib/supabase';

type DraftSlot = {
  id: string;
  start_at: string;
  end_at: string;
};

type PickerTarget = 'startTime' | 'endTime';

type ProposalConflict = {
  created_at: string;
  end_at: string;
  id: string;
  personal_training_requests:
    | { customer_id: string }
    | { customer_id: string }[]
    | null;
  start_at: string;
};

const EMPTY_DATE_KEYS = new Set<string>();

export default function TrainingRequestDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { hasPermission, userProfile } = useAuth();
  const canRespond = hasPermission('training_requests', 'respond', 'assigned');
  const canTransfer = hasPermission('training_requests', 'transfer', 'assigned');
  const [request, setRequest] = useState<PersonalTrainingRequest | null>(null);
  const [bookingChange, setBookingChange] = useState<BookingChangeRequest | null>(null);
  const [customer, setCustomer] = useState<UserProfile | null>(null);
  const [existingProposals, setExistingProposals] = useState<PersonalTrainingProposal[]>([]);
  const [pendingTransfer, setPendingTransfer] =
    useState<PersonalTrainingRequestTransfer | null>(null);
  const [draftSlots, setDraftSlots] = useState<DraftSlot[]>([]);
  const [date, setDate] = useState(getTomorrowDateInput);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const tomorrow = getTomorrowDate();
    return new Date(tomorrow.getFullYear(), tomorrow.getMonth(), 1);
  });
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>('startTime');
  const [pickerVisible, setPickerVisible] = useState(false);
  const pickerCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [checkingSlot, setCheckingSlot] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !userProfile || !canRespond) {
      setLoading(false);
      return;
    }

    setError(null);
    try {
      const { data, error: requestError } = await supabase
        .from('personal_training_requests')
        .select('*')
        .eq('id', id)
        .eq('trainer_id', userProfile.user_id)
        .single();
      if (requestError) throw requestError;

      const loadedRequest = data as PersonalTrainingRequest;
      const [profileResult, proposalResult, transferResult, changeResult] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', loadedRequest.customer_id)
          .single(),
        supabase
          .from('personal_training_proposals')
          .select('*')
          .eq('request_id', loadedRequest.id)
          .eq('status', 'proposed')
          .order('start_at', { ascending: true }),
        canTransfer
          ? supabase
              .from('personal_training_request_transfers')
              .select('*')
              .eq('request_id', loadedRequest.id)
              .eq('status', 'pending')
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        loadedRequest.change_request_id
          ? supabase
              .from('booking_change_requests')
              .select('*')
              .eq('id', loadedRequest.change_request_id)
              .single()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (proposalResult.error) throw proposalResult.error;
      if (transferResult.error) throw transferResult.error;
      if (changeResult.error) throw changeResult.error;

      setRequest(loadedRequest);
      setCustomer(profileResult.data as UserProfile);
      setExistingProposals((proposalResult.data ?? []) as PersonalTrainingProposal[]);
      setBookingChange(
        (changeResult.data as BookingChangeRequest | null) ?? null
      );
      setPendingTransfer(
        (transferResult.data as PersonalTrainingRequestTransfer | null) ?? null
      );
    } catch (loadError: any) {
      setError(loadError.message || 'La solicitud no se pudo cargar.');
    } finally {
      setLoading(false);
    }
  }, [canRespond, canTransfer, id, userProfile?.user_id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(
    () => () => {
      if (pickerCloseTimer.current) clearTimeout(pickerCloseTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!bookingChange) return;

    const earliestDate = new Date(bookingChange.original_start_at);
    setDate(formatDateInput(earliestDate));
    setVisibleMonth(
      new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1)
    );
    setStartTime((currentStart) => {
      const automaticEnd = addMinutesToTime(
        currentStart,
        getChangeDurationMinutes(bookingChange)
      );
      if (automaticEnd) setEndTime(automaticEnd);
      return currentStart;
    });
  }, [bookingChange?.id]);

  if (!userProfile || !canRespond) {
    return (
      <View style={styles.denied}>
        <Text style={styles.secondary}>Esta sección está disponible para entrenadores.</Text>
      </View>
    );
  }

  const addSlot = async () => {
    if (!request || pendingTransfer || checkingSlot) return;

    const startAt = buildLocalDateTime(date, startTime);
    let endAt = buildLocalDateTime(date, endTime);
    if (!startAt || !endAt) {
      Alert.alert('Horario incorrecto', 'Revisa la fecha y las horas introducidas.');
      return;
    }

    const start = new Date(startAt);
    let end = new Date(endAt);
    if (end <= start) {
      end.setDate(end.getDate() + 1);
      endAt = end.toISOString();
    }

    const durationMinutes = (end.getTime() - start.getTime()) / 60_000;
    if (durationMinutes < 30 || durationMinutes > 240) {
      Alert.alert(
        'Duración incorrecta',
        'El entrenamiento debe durar entre 30 minutos y 4 horas.'
      );
      return;
    }

    if (bookingChange) {
      const expectedDuration = getChangeDurationMinutes(bookingChange);
      if (durationMinutes !== expectedDuration) {
        Alert.alert(
          'Duración incorrecta',
          `El horario alternativo debe durar ${formatDuration(expectedDuration)}, igual que la cita original.`
        );
        return;
      }
      if (
        start.getTime() < new Date(bookingChange.original_start_at).getTime() ||
        start.getTime() > new Date(bookingChange.recovery_deadline).getTime()
      ) {
        Alert.alert(
          'Fecha no válida',
          'El horario debe estar entre la cita original y el final del plazo de cuatro semanas.'
        );
        return;
      }
    }

    if (start <= new Date()) {
      Alert.alert(
        'Fecha no válida',
        'Selecciona una fecha y una hora futuras.'
      );
      return;
    }

    const overlaps = draftSlots.some((slot) => {
      const existingStart = new Date(slot.start_at);
      const existingEnd = new Date(slot.end_at);
      return start < existingEnd && end > existingStart;
    });
    if (overlaps) {
      Alert.alert('Horario duplicado', 'Este horario se solapa con otro de la selección.');
      return;
    }

    setCheckingSlot(true);
    try {
      const [sessionResult, proposalResult] = await Promise.all([
        supabase
          .from('course_sessions')
          .select('id, start_at, end_at')
          .eq('trainer_id', request.trainer_id)
          .eq('status', 'scheduled')
          .lt('start_at', endAt)
          .gt('end_at', startAt)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('personal_training_proposals')
          .select(
            'id, created_at, start_at, end_at, personal_training_requests!inner(trainer_id, customer_id)'
          )
          .eq('personal_training_requests.trainer_id', request.trainer_id)
          .neq('request_id', request.id)
          .eq('status', 'proposed')
          .lt('start_at', endAt)
          .gt('end_at', startAt)
          .limit(1)
          .maybeSingle(),
      ]);

      if (sessionResult.error) throw sessionResult.error;
      if (proposalResult.error) throw proposalResult.error;

      const selectedSlot = `${formatDate(startAt)}, ${formatTimeRange(startAt, endAt)}`;
      if (sessionResult.data) {
        const conflictingSession = sessionResult.data;
        Alert.alert(
          'Horario no disponible',
          `No puedes añadir ${selectedSlot}.\n\nYa existe una sesión planificada: ${formatDate(conflictingSession.start_at)}, ${formatTimeRange(conflictingSession.start_at, conflictingSession.end_at)}.`
        );
        return;
      }

      const conflictingProposal = proposalResult.data as ProposalConflict | null;
      if (conflictingProposal) {
        const relatedRequest = Array.isArray(conflictingProposal.personal_training_requests)
          ? conflictingProposal.personal_training_requests[0]
          : conflictingProposal.personal_training_requests;
        let clientName = 'otro cliente';

        if (relatedRequest?.customer_id) {
          const { data: conflictingClient } = await supabase
            .from('user_profiles')
            .select('first_name, last_name')
            .eq('user_id', relatedRequest.customer_id)
            .maybeSingle();
          const profileName = [conflictingClient?.first_name, conflictingClient?.last_name]
            .filter(Boolean)
            .join(' ');
          if (profileName) clientName = profileName;
        }

        Alert.alert(
          'Horario no disponible',
          `No puedes añadir ${selectedSlot}.\n\nReservado provisionalmente para ${clientName}. Oferta enviada: ${formatDateTime(conflictingProposal.created_at)}.`
        );
        return;
      }

      setDraftSlots((current) =>
        [...current, { id: `${Date.now()}-${current.length}`, start_at: startAt, end_at: endAt }]
          .sort((a, b) => a.start_at.localeCompare(b.start_at))
      );
    } catch (availabilityError: any) {
      Alert.alert(
        'No se pudo comprobar el horario',
        availabilityError.message || 'Inténtalo de nuevo antes de añadirlo.'
      );
    } finally {
      setCheckingSlot(false);
    }
  };

  const handlePickerChange = (event: DateTimePickerEvent, selectedValue?: Date) => {
    const activeTarget = pickerTarget;
    if (Platform.OS === 'android') setPickerVisible(false);
    if (event.type === 'dismissed' || !selectedValue) return;

    const nextTime = formatTimeInput(selectedValue);
    if (activeTarget === 'startTime') {
      updateStartTime(nextTime);
    } else {
      setEndTime(nextTime);
    }
  };

  const updateStartTime = (nextTime: string) => {
    setStartTime(nextTime);
    const automaticEnd = bookingChange
      ? addMinutesToTime(nextTime, getChangeDurationMinutes(bookingChange))
      : addHourToTime(nextTime);
    if (automaticEnd) setEndTime(automaticEnd);
  };

  const openPicker = (target: PickerTarget) => {
    if (pickerCloseTimer.current) {
      clearTimeout(pickerCloseTimer.current);
      pickerCloseTimer.current = null;
    }
    setPickerTarget(target);
    setPickerVisible(true);
  };

  const closePicker = () => {
    Keyboard.dismiss();
    if (pickerCloseTimer.current) clearTimeout(pickerCloseTimer.current);
    pickerCloseTimer.current = setTimeout(() => {
      setPickerVisible(false);
      pickerCloseTimer.current = null;
    }, 300);
  };

  const submit = async () => {
    if (!request || pendingTransfer || draftSlots.length === 0 || saving) return;
    setSaving(true);
    try {
      const { error: proposalError } = await supabase.rpc(
        'propose_personal_training_slots',
        {
          target_request_id: request.id,
          proposed_slots: draftSlots.map(({ start_at, end_at }) => ({
            start_at,
            end_at,
          })),
        }
      );
      if (proposalError) throw proposalError;

      Alert.alert(
        'Horarios enviados',
        bookingChange
          ? 'El cliente ya puede seleccionar y confirmar un horario alternativo.'
          : 'El cliente ya puede seleccionar y confirmar varios entrenamientos.',
        [{ text: 'Aceptar', onPress: () => router.back() }]
      );
    } catch (proposalError: any) {
      Alert.alert(
        'No se pudieron enviar',
        proposalError.message || 'Revisa los horarios e inténtalo de nuevo.'
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmReplacementRejection = () => {
    if (!request?.change_request_id || saving) return;

    Alert.alert(
      'Rechazar cambio de cita',
      'La cita original seguirá reservada. El cliente recibirá un aviso indicando que no se ha encontrado una alternativa en las próximas cuatro semanas.',
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Rechazar cambio',
          style: 'destructive',
          onPress: () => void rejectReplacement(),
        },
      ]
    );
  };

  const rejectReplacement = async () => {
    if (!request?.change_request_id || saving) return;
    setSaving(true);
    try {
      const { error: rejectionError } = await supabase.rpc(
        'reject_personal_training_replacement',
        { target_request_id: request.id }
      );
      if (rejectionError) throw rejectionError;

      Alert.alert(
        'Cambio rechazado',
        'El cliente ha sido informado. La cita original sigue siendo válida.',
        [{ text: 'Aceptar', onPress: () => router.back() }]
      );
    } catch (rejectionError: any) {
      Alert.alert(
        'No se pudo rechazar',
        rejectionError.message || 'Actualiza la pantalla e inténtalo de nuevo.'
      );
    } finally {
      setSaving(false);
    }
  };

  const pickerValue = getPickerValue(pickerTarget, date, startTime, endTime);

  return (
    <>
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
          <Text style={styles.title}>Proponer horarios</Text>
        </View>
      </View>

      {loading ? (
        <>
          <SkeletonBlock height={82} />
          <SkeletonBlock height={160} />
        </>
      ) : error ? (
        <AdminCard>
          <Text style={styles.error}>{error}</Text>
        </AdminCard>
      ) : (
        <>
          <AdminCard>
            {bookingChange ? (
              <Text style={styles.replacementBadge}>CAMBIO DE CITA</Text>
            ) : null}
            <Text style={styles.cardTitle}>
              {[customer?.first_name, customer?.last_name].filter(Boolean).join(' ') ||
                'Cliente'}
            </Text>
            <Text style={styles.secondary}>
              {bookingChange
                ? 'La cita original sigue reservada. Propón alternativas con la misma duración dentro de las próximas cuatro semanas.'
                : 'Puedes ofrecer varios horarios. Permanecerán reservados hasta que el cliente confirme su selección.'}
            </Text>
            {bookingChange ? (
              <>
                <Text style={styles.changeMeta}>
                  Cita original: {formatDate(bookingChange.original_start_at)} ·{' '}
                  {formatTimeRange(
                    bookingChange.original_start_at,
                    bookingChange.original_end_at
                  )}
                </Text>
                <Text style={styles.changeReason}>Motivo: {bookingChange.reason}</Text>
              </>
            ) : null}
          </AdminCard>

          {canTransfer && request &&
          (!request.change_request_id || request.status === 'requested') ? (
            <PrimaryButton
              onPress={() => router.push(`/training-transfer/${request.id}` as Href)}
              secondary
              style={styles.transferButton}>
              {pendingTransfer
                ? 'Ver transferencia pendiente'
                : 'Transferir a otro entrenador'}
            </PrimaryButton>
          ) : null}

          {bookingChange && request?.status === 'requested' && !pendingTransfer ? (
            <PrimaryButton
              disabled={saving}
              onPress={confirmReplacementRejection}
              secondary
              style={styles.rejectButton}>
              {saving ? 'Guardando…' : 'No hay alternativa · Rechazar cambio'}
            </PrimaryButton>
          ) : null}

          {pendingTransfer ? (
            <View style={styles.section}>
              <AdminCard muted>
                <Text style={styles.cardTitle}>Transferencia pendiente</Text>
                <Text style={styles.secondary}>
                  El otro entrenador debe aceptar la solicitud. Mientras tanto no puedes enviar
                  nuevos horarios.
                </Text>
              </AdminCard>
            </View>
          ) : (
            <>
          {existingProposals.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Horarios enviados actualmente</Text>
              {existingProposals.map((proposal) => (
                <AdminCard key={proposal.id} muted>
                  <Text style={styles.cardTitle}>{formatDate(proposal.start_at)}</Text>
                  <Text style={styles.secondary}>
                    {formatTimeRange(proposal.start_at, proposal.end_at)}
                  </Text>
                </AdminCard>
              ))}
              <Text style={styles.warning}>
                Al confirmar una nueva selección, estos horarios serán sustituidos.
              </Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Añadir horario</Text>
            <MonthCalendar
              eventDateKeys={EMPTY_DATE_KEYS}
              maximumDate={
                bookingChange ? new Date(bookingChange.recovery_deadline) : undefined
              }
              minimumDate={
                bookingChange
                  ? new Date(bookingChange.original_start_at)
                  : getMinimumProposalDate()
              }
              month={visibleMonth}
              onChangeMonth={setVisibleMonth}
              onSelectDate={(selectedDate) => setDate(formatDateInput(selectedDate))}
              selectedDate={getDateFromInput(date)}
            />
            <View style={styles.selectedDateRow}>
              <Feather color={adminColors.amber} name="check-circle" size={14} />
              <Text style={styles.selectedDateText}>
                Fecha seleccionada: {formatSelectedDate(date)}
              </Text>
            </View>
            {Platform.OS === 'web' ? (
              <>
                <View style={styles.twoColumns}>
                  <View style={styles.column}>
                    <AdminTextInput
                      label="Hora inicio"
                      onChangeText={updateStartTime}
                      value={startTime}
                    />
                  </View>
                  <View style={styles.column}>
                    <AdminTextInput
                      editable={!bookingChange}
                      label="Hora fin"
                      onChangeText={setEndTime}
                      value={endTime}
                    />
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.twoColumns}>
                <View style={styles.column}>
                  <PickerField
                    icon="clock"
                    label="Hora inicio"
                    onPress={() => openPicker('startTime')}
                    value={startTime}
                  />
                </View>
                <View style={styles.column}>
                  <PickerField
                    disabled={Boolean(bookingChange)}
                    icon="clock"
                    label="Hora fin"
                    onPress={() => openPicker('endTime')}
                    value={endTime}
                  />
                </View>
              </View>
            )}
            <Pressable
              accessibilityLabel="Añadir horario"
              accessibilityState={{ disabled: checkingSlot }}
              disabled={checkingSlot}
              onPress={() => void addSlot()}
              style={({ pressed }) => [
                styles.addSlotButton,
                checkingSlot && styles.addSlotButtonDisabled,
                pressed && styles.pressed,
              ]}>
              <Feather color={adminColors.amberOn} name="plus" size={16} />
              <Text style={styles.addSlotButtonText}>
                {checkingSlot ? 'Comprobando…' : 'Añadir horario'}
              </Text>
            </Pressable>
          </View>

          {draftSlots.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Nueva propuesta</Text>
              {draftSlots.map((slot) => (
                <AdminCard key={slot.id} style={styles.slotCard}>
                  <View style={styles.slotCopy}>
                    <Text style={styles.cardTitle}>{formatDate(slot.start_at)}</Text>
                    <Text style={styles.secondary}>
                      {formatTimeRange(slot.start_at, slot.end_at)}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Eliminar horario"
                    onPress={() =>
                      setDraftSlots((current) => current.filter((item) => item.id !== slot.id))
                    }>
                    <Feather color={adminColors.urgent} name="trash-2" size={17} />
                  </Pressable>
                </AdminCard>
              ))}
            </View>
          ) : null}

          <PrimaryButton
            disabled={draftSlots.length === 0 || saving}
            onPress={() => void submit()}>
            {saving ? 'Enviando…' : `Confirmar ${draftSlots.length} horario(s)`}
          </PrimaryButton>
            </>
          )}
        </>
      )}
      </AdminScrollScreen>

      {Platform.OS === 'ios' ? (
        <Modal
          animationType="fade"
          onRequestClose={closePicker}
          transparent
          visible={pickerVisible}>
          <KeyboardAvoidingView behavior="padding" style={styles.pickerOverlay}>
            <Pressable
              accessibilityLabel="Cerrar selector"
              onPress={closePicker}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>{getPickerTitle(pickerTarget)}</Text>
                <Pressable
                  onPress={closePicker}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <Text style={styles.pickerDone}>Listo</Text>
                </Pressable>
              </View>
              <DateTimePicker
                display="spinner"
                locale="es-ES"
                minuteInterval={5}
                mode="time"
                onChange={handlePickerChange}
                style={styles.picker}
                textColor={adminColors.textPrimary}
                themeVariant="dark"
                value={pickerValue}
              />
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}

      {Platform.OS === 'android' && pickerVisible ? (
        <DateTimePicker
          display="spinner"
          minuteInterval={5}
          mode="time"
          onChange={handlePickerChange}
          value={pickerValue}
        />
      ) : null}
    </>
  );
}

function PickerField({
  disabled = false,
  icon,
  label,
  onPress,
  value,
}: {
  disabled?: boolean;
  icon: 'clock';
  label: string;
  onPress: () => void;
  value: string;
}) {
  return (
    <View style={styles.pickerFieldGroup}>
      <Text style={styles.pickerFieldLabel}>{label}</Text>
      <Pressable
        accessibilityLabel={`${label}: ${value}`}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.pickerField,
          disabled && styles.pickerFieldDisabled,
          pressed && styles.pickerFieldPressed,
        ]}>
        <Feather color={adminColors.amber} name={icon} size={15} />
        <Text numberOfLines={1} style={styles.pickerFieldValue}>
          {value}
        </Text>
        <Feather color={adminColors.textMuted} name="chevron-down" size={14} />
      </Pressable>
    </View>
  );
}

function getTomorrowDateInput() {
  return formatDateInput(getTomorrowDate());
}

function getTomorrowDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
}

function getMinimumProposalDate() {
  const minimum = new Date();
  minimum.setHours(0, 0, 0, 0);
  return minimum;
}

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeInput(value: Date) {
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function addHourToTime(value: string) {
  return addMinutesToTime(value, 60);
}

function addMinutesToTime(value: string, minutesToAdd: number) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;

  const automaticEnd = new Date(2000, 0, 1, Number(match[1]), Number(match[2]));
  automaticEnd.setMinutes(automaticEnd.getMinutes() + minutesToAdd);
  return formatTimeInput(automaticEnd);
}

function getChangeDurationMinutes(change: BookingChangeRequest) {
  return Math.round(
    (new Date(change.original_end_at).getTime() -
      new Date(change.original_start_at).getTime()) /
      60_000
  );
}

function formatDuration(minutes: number) {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  return `${minutes} minutos`;
}

function getPickerValue(
  target: PickerTarget | null,
  dateValue: string,
  startTime: string,
  endTime: string
) {
  const timeValue = target === 'endTime' ? endTime : startTime;
  const value = buildLocalDateTime(dateValue, timeValue);
  return value ? new Date(value) : new Date();
}

function getPickerTitle(target: PickerTarget | null) {
  if (target === 'endTime') return 'Hora fin';
  return 'Hora inicio';
}

function getDateFromInput(value: string) {
  const selected = buildLocalDateTime(value, '12:00');
  return selected ? new Date(selected) : getTomorrowDate();
}

function formatSelectedDate(value: string) {
  const selected = buildLocalDateTime(value, '12:00');
  if (!selected) return value;

  const formatted = new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(selected));
  return formatted.charAt(0).toLocaleUpperCase('es-ES') + formatted.slice(1);
}

function buildLocalDateTime(dateValue: string, timeValue: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeValue.trim());
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const value = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    value.getFullYear() !== year ||
    value.getMonth() !== month - 1 ||
    value.getDate() !== day
  ) {
    return null;
  }
  return value.toISOString();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(value));
}

function formatTimeRange(startValue: string, endValue: string) {
  const formatter = new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const start = new Date(startValue);
  const end = new Date(endValue);
  const nextDay =
    start.getFullYear() !== end.getFullYear() ||
    start.getMonth() !== end.getMonth() ||
    start.getDate() !== end.getDate();
  return `${formatter.format(start)}–${formatter.format(end)}${nextDay ? ' · día siguiente' : ''}`;
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
  section: {
    gap: 8,
    marginVertical: 18,
  },
  sectionTitle: {
    ...adminType.section,
    marginBottom: 2,
  },
  twoColumns: {
    flexDirection: 'row',
    gap: 8,
  },
  column: {
    flex: 1,
  },
  selectedDateRow: {
    alignItems: 'center',
    backgroundColor: adminColors.amberTint,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  selectedDateText: {
    color: adminColors.textPrimary,
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  pickerFieldGroup: {
    gap: 6,
  },
  pickerFieldLabel: {
    color: adminColors.textSecondary,
    fontSize: 11,
    fontWeight: '400',
  },
  pickerField: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.borderInput,
    borderRadius: 10,
    borderWidth: adminHairline,
    flexDirection: 'row',
    gap: 9,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  pickerFieldDisabled: {
    opacity: 0.55,
  },
  pickerFieldPressed: {
    backgroundColor: adminColors.amberTint,
    borderColor: adminColors.amber,
  },
  pickerFieldValue: {
    color: adminColors.textPrimary,
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  addSlotButton: {
    alignItems: 'center',
    backgroundColor: adminColors.amber,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 46,
    paddingHorizontal: 16,
  },
  addSlotButtonText: {
    color: adminColors.amberOn,
    fontSize: 13,
    fontWeight: '600',
  },
  addSlotButtonDisabled: {
    opacity: 0.7,
  },
  transferButton: {
    marginTop: 10,
  },
  rejectButton: {
    borderColor: adminColors.urgent,
    marginTop: 10,
  },
  replacementBadge: {
    ...adminType.badge,
    color: adminColors.amber,
    marginBottom: 7,
  },
  changeMeta: {
    ...adminType.secondary,
    color: adminColors.textPrimary,
    lineHeight: 17,
    marginTop: 10,
  },
  changeReason: {
    ...adminType.secondary,
    fontStyle: 'italic',
    lineHeight: 17,
    marginTop: 5,
  },
  pickerOverlay: {
    backgroundColor: 'rgba(0,0,0,0.58)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: adminColors.bgCard,
    borderTopColor: adminColors.borderStrong,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: adminHairline,
    paddingBottom: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  pickerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 36,
  },
  pickerTitle: {
    ...adminType.section,
  },
  pickerDone: {
    color: adminColors.amber,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  picker: {
    alignSelf: 'center',
    width: '100%',
  },
  slotCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  slotCopy: {
    flex: 1,
  },
  cardTitle: {
    ...adminType.rowTitle,
    textTransform: 'capitalize',
  },
  secondary: {
    ...adminType.secondary,
    lineHeight: 17,
    marginTop: 4,
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
