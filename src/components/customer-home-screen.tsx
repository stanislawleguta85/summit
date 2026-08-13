import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AdminCard,
  AdminHeader,
  AdminScrollScreen,
  AdminTextInput,
  EmptyState,
  HeaderIconButton,
  PrimaryButton,
  SkeletonBlock,
} from '@/components/admin/admin-ui';
import { MonthCalendar } from '@/components/admin/month-calendar';
import { adminColors, adminHairline, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import { formatSpanishDay, localDateKey, timeRange } from '@/lib/admin-data';
import {
  supabase,
  type AppNotification,
  type BookingChangeRequest,
  type MyCalendarEntry,
} from '@/lib/supabase';

export function CustomerHomeScreen() {
  const router = useRouter();
  const { isImpersonating, signOut, userProfile } = useAuth();
  const today = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [entries, setEntries] = useState<MyCalendarEntry[]>([]);
  const [changes, setChanges] = useState<BookingChangeRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<MyCalendarEntry | null>(null);
  const [reason, setReason] = useState('');
  const [reasonVisible, setReasonVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (asRefresh = false) => {
      if (!userProfile) {
        setLoading(false);
        return;
      }
      if (asRefresh) setRefreshing(true);
      setError(null);

      const windowStart = new Date(
        visibleMonth.getFullYear(),
        visibleMonth.getMonth(),
        1
      );
      windowStart.setDate(windowStart.getDate() - 7);
      const windowEnd = new Date(
        visibleMonth.getFullYear(),
        visibleMonth.getMonth() + 2,
        1
      );

      try {
        const [calendarResult, changeResult, notificationResult] = await Promise.all([
          supabase.rpc('get_my_calendar', {
            window_start: windowStart.toISOString(),
            window_end: windowEnd.toISOString(),
          }),
          supabase
            .from('booking_change_requests')
            .select('*')
            .eq('customer_id', userProfile.user_id)
            .order('created_at', { ascending: false }),
          supabase
            .from('notifications')
            .select('*')
            .eq('recipient_id', userProfile.user_id)
            .order('created_at', { ascending: false })
            .limit(30),
        ]);
        if (calendarResult.error) throw calendarResult.error;
        if (changeResult.error) throw changeResult.error;
        if (notificationResult.error) throw notificationResult.error;

        setEntries((calendarResult.data ?? []) as MyCalendarEntry[]);
        setChanges((changeResult.data ?? []) as BookingChangeRequest[]);
        setNotifications((notificationResult.data ?? []) as AppNotification[]);
      } catch (loadError: any) {
        setError(loadError.message || 'El calendario no se pudo cargar.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userProfile?.user_id, visibleMonth]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const eventDateKeys = useMemo(
    () => new Set(entries.map((entry) => localDateKey(new Date(entry.start_at)))),
    [entries]
  );
  const selectedEntries = entries.filter(
    (entry) => localDateKey(new Date(entry.start_at)) === localDateKey(selectedDate)
  );
  const unreadNotificationCount = notifications.filter(
    (notification) => notification.read_at === null
  ).length;

  const openNotification = async (notification: AppNotification) => {
    if (notification.read_at === null) {
      const { error: readError } = await supabase.rpc('mark_notification_read', {
        target_notification_id: notification.id,
      });
      if (readError) {
        Alert.alert(
          'No se pudo abrir la notificación',
          readError.message || 'Inténtalo de nuevo.'
        );
        return;
      }
      setNotifications((current) =>
        current.map((entry) =>
          entry.id === notification.id
            ? { ...entry, read_at: new Date().toISOString() }
            : entry
        )
      );
    }

    setNotificationsVisible(false);
    const route = notification.payload?.route;
    if (typeof route === 'string' && route.startsWith('/')) {
      router.push(route as Href);
    }
  };

  const openReason = (entry: MyCalendarEntry) => {
    const change = changes.find((candidate) => candidate.original_booking_id === entry.booking_id);
    if (change) {
      Alert.alert(
        'Cambio ya solicitado',
        change.status === 'pending'
          ? 'Tu entrenador está buscando un horario alternativo.'
          : change.status === 'rejected'
            ? 'No se encontró una alternativa. La cita original sigue reservada.'
            : 'Esta cita ya tiene una solicitud de cambio.'
      );
      return;
    }

    if (!canChangeEntry(entry)) {
      Alert.alert(
        'Cambio no disponible',
        'Los cambios requieren al menos cuatro horas de antelación.'
      );
      return;
    }

    setSelectedEntry(entry);
    setReason('');
    setReasonVisible(true);
  };

  const confirmChange = () => {
    if (!selectedEntry || submitting) return;
    if (reason.trim().length < 3) {
      Alert.alert('Motivo obligatorio', 'Explica brevemente por qué necesitas cambiar la cita.');
      return;
    }

    Alert.alert(
      'Confirmar cambio',
      selectedEntry.event_kind === 'group'
        ? 'Tu plaza original se liberará inmediatamente y después podrás elegir una alternativa.'
        : 'Tu cita original seguirá reservada mientras el entrenador busca una alternativa.',
      [
        { text: 'Volver', style: 'cancel' },
        { text: 'Confirmar', onPress: () => void submitChange() },
      ]
    );
  };

  const submitChange = async () => {
    if (!selectedEntry || submitting) return;
    setSubmitting(true);
    try {
      const { data, error: changeError } = await supabase.rpc('request_booking_change', {
        target_booking_id: selectedEntry.booking_id,
        change_reason: reason.trim(),
      });
      if (changeError) throw changeError;

      const changeId = data as string;
      setReasonVisible(false);
      await load(true);

      if (selectedEntry.event_kind === 'group') {
        router.push(`/booking-change/${changeId}` as Href);
      } else {
        Alert.alert(
          'Cambio solicitado',
          'Tu cita original sigue reservada. Tu entrenador te enviará propuestas si encuentra una alternativa en las próximas cuatro semanas.',
          [{ text: 'Aceptar', onPress: () => router.push('/courses') }]
        );
      }
    } catch (changeError: any) {
      Alert.alert(
        'No se pudo solicitar el cambio',
        changeError.message || 'Actualiza el calendario e inténtalo de nuevo.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Cerrar sesión', '¿Quieres cerrar la sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: () => void signOut(),
      },
    ]);
  };

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
        eyebrow="MI CALENDARIO"
        title={[userProfile?.first_name, userProfile?.last_name].filter(Boolean).join(' ')}
        right={
          <View style={styles.headerActions}>
            {!isImpersonating ? (
              <HeaderIconButton
                accessibilityLabel="Configuración del perfil"
                icon="user"
                onPress={() => router.push('/profile' as Href)}
              />
            ) : null}
            <HeaderIconButton
              accessibilityLabel="Notificaciones"
              badge={unreadNotificationCount}
              icon="bell"
              onPress={() => setNotificationsVisible(true)}
            />
            {!isImpersonating ? (
            <HeaderIconButton
              accessibilityLabel="Cerrar sesión"
              icon="log-out"
              onPress={confirmSignOut}
            />
            ) : null}
          </View>
        }
      />

      {loading ? (
        <>
          <SkeletonBlock height={310} />
          <SkeletonBlock height={90} style={styles.skeletonAgenda} />
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
              <Text style={styles.error}>{error}</Text>
            </AdminCard>
          ) : selectedEntries.length === 0 ? (
            <EmptyState title="No tienes entrenamientos este día" />
          ) : (
            <View style={styles.entryList}>
              {selectedEntries.map((entry) => {
                const change = changes.find(
                  (candidate) => candidate.original_booking_id === entry.booking_id
                );
                const changeAllowed = canChangeEntry(entry) && !change;
                return (
                  <AdminCard key={entry.booking_id}>
                    <View style={styles.entryHeading}>
                      <View style={styles.entryCopy}>
                        <Text style={styles.entryTime}>
                          {timeRange(entry.start_at, entry.end_at)}
                        </Text>
                        <Text style={styles.entryTitle}>{entry.title}</Text>
                        <Text style={styles.entryMeta}>
                          {entry.event_kind === 'personal' ? 'Individual' : 'Grupo'}
                          {entry.room ? ` · ${entry.room}` : ''}
                        </Text>
                      </View>
                      <Pressable
                        disabled={!changeAllowed && !change}
                        onPress={() => openReason(entry)}
                        style={({ pressed }) => [
                          styles.changeButton,
                          !changeAllowed && !change && styles.changeButtonDisabled,
                          pressed && styles.pressed,
                        ]}>
                        <Text style={styles.changeButtonText}>
                          {change?.status === 'pending'
                            ? 'Cambio pendiente'
                            : change?.status === 'rejected'
                              ? 'Cambio rechazado'
                              : 'Cambiar'}
                        </Text>
                      </Pressable>
                    </View>
                    {!changeAllowed && !change ? (
                      <Text style={styles.deadlineText}>Plazo de cambio finalizado</Text>
                    ) : null}
                  </AdminCard>
                );
              })}
            </View>
          )}

          <PrimaryButton onPress={() => router.push('/changes' as Href)} secondary>
            Mis cambios
          </PrimaryButton>
        </>
      )}

      <Modal
        animationType="slide"
        onRequestClose={() => setNotificationsVisible(false)}
        presentationStyle="pageSheet"
        visible={notificationsVisible}>
        <View style={styles.notificationModal}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalEyebrow}>NOTIFICACIONES</Text>
              <Text style={styles.modalTitle}>Tus avisos</Text>
            </View>
            <Pressable onPress={() => setNotificationsVisible(false)}>
              <Text style={styles.modalClose}>Cerrar</Text>
            </Pressable>
          </View>

          {notifications.length === 0 ? (
            <EmptyState
              message="Los avisos sobre plazas y solicitudes aparecerán aquí."
              title="No tienes notificaciones"
            />
          ) : (
            <ScrollView contentContainerStyle={styles.notificationList}>
              {notifications.map((notification) => {
                const unread = notification.read_at === null;
                const hasRoute =
                  typeof notification.payload?.route === 'string' &&
                  notification.payload.route.startsWith('/');
                return (
                  <Pressable
                    key={notification.id}
                    onPress={() => void openNotification(notification)}
                    style={({ pressed }) => [
                      styles.notificationCard,
                      unread && styles.notificationCardUnread,
                      pressed && styles.pressed,
                    ]}>
                    <View style={[styles.notificationDot, !unread && styles.notificationDotRead]} />
                    <View style={styles.notificationCopy}>
                      <Text style={styles.notificationTitle}>{notification.title}</Text>
                      <Text style={styles.notificationBody}>{notification.body}</Text>
                      <Text style={styles.notificationTime}>
                        {formatNotificationTime(notification.created_at)}
                      </Text>
                    </View>
                    {hasRoute ? (
                      <Feather color={adminColors.textMuted} name="chevron-right" size={16} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setReasonVisible(false)}
        presentationStyle="pageSheet"
        visible={reasonVisible}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modal}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalEyebrow}>CAMBIAR ENTRENAMIENTO</Text>
              <Text style={styles.modalTitle}>Indica el motivo</Text>
            </View>
            <Pressable onPress={() => setReasonVisible(false)}>
              <Text style={styles.modalClose}>Cerrar</Text>
            </Pressable>
          </View>

          {selectedEntry ? (
            <AdminCard muted>
              <Text style={styles.entryTitle}>{formatSpanishDay(new Date(selectedEntry.start_at))}</Text>
              <Text style={styles.entryMeta}>
                {timeRange(selectedEntry.start_at, selectedEntry.end_at)} · {selectedEntry.title}
              </Text>
            </AdminCard>
          ) : null}

          <View style={styles.reasonField}>
            <AdminTextInput
              autoFocus
              label="Motivo obligatorio"
              multiline
              numberOfLines={5}
              onChangeText={setReason}
              placeholder="Explica brevemente por qué necesitas cambiar la cita"
              style={styles.reasonInput}
              textAlignVertical="top"
              value={reason}
            />
          </View>

          <PrimaryButton disabled={submitting} onPress={confirmChange}>
            {submitting ? 'Enviando…' : 'Continuar'}
          </PrimaryButton>
        </KeyboardAvoidingView>
      </Modal>
    </AdminScrollScreen>
  );
}

function canChangeEntry(entry: MyCalendarEntry) {
  return Date.now() <= new Date(entry.start_at).getTime() - 4 * 60 * 60 * 1000;
}

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', gap: 8 },
  skeletonAgenda: { marginTop: 18 },
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
  entryList: { gap: 8, marginBottom: 14 },
  entryHeading: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  entryCopy: { flex: 1, flexShrink: 1 },
  entryTime: { color: adminColors.amber, fontSize: 12, fontWeight: '600' },
  entryTitle: { ...adminType.rowTitle, marginTop: 3 },
  entryMeta: { ...adminType.secondary, lineHeight: 17, marginTop: 3 },
  changeButton: {
    borderColor: adminColors.amber,
    borderRadius: 8,
    borderWidth: adminHairline,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  changeButtonDisabled: { borderColor: adminColors.border, opacity: 0.45 },
  changeButtonText: { color: adminColors.amber, fontSize: 11, fontWeight: '600' },
  deadlineText: { color: adminColors.textFaint, fontSize: 10, marginTop: 8 },
  error: { color: adminColors.urgent, fontSize: 12, textAlign: 'center' },
  pressed: { opacity: 0.7 },
  notificationModal: {
    backgroundColor: adminColors.bgPage,
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  notificationList: { gap: 8 },
  notificationCard: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.border,
    borderRadius: 10,
    borderWidth: adminHairline,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  notificationCardUnread: {
    borderColor: adminColors.amber,
  },
  notificationDot: {
    backgroundColor: adminColors.amber,
    borderRadius: 5,
    height: 8,
    width: 8,
  },
  notificationDotRead: {
    backgroundColor: adminColors.textFaint,
  },
  notificationCopy: { flex: 1 },
  notificationTitle: { ...adminType.rowTitle },
  notificationBody: { ...adminType.secondary, lineHeight: 16, marginTop: 3 },
  notificationTime: { color: adminColors.textFaint, fontSize: 9, marginTop: 5 },
  modal: {
    backgroundColor: adminColors.bgPage,
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  modalEyebrow: { ...adminType.eyebrow },
  modalTitle: { ...adminType.section, marginTop: 5 },
  modalClose: { color: adminColors.amber, fontSize: 13, fontWeight: '500' },
  reasonField: { marginBottom: 18, marginTop: 18 },
  reasonInput: { minHeight: 118 },
});
