import Feather from '@expo/vector-icons/Feather';
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AdminCard,
  AdminScrollScreen,
  EmptyState,
  InitialAvatar,
  PrimaryButton,
  ProgressBar,
  SearchInput,
  SectionHeading,
  SkeletonBlock,
} from '@/components/admin/admin-ui';
import { adminColors, adminHairline, adminRadius, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import {
  supabase,
  type AddClientsToCourseResult,
  type Course,
  type CourseClient,
  type CourseSessionClient,
  type ManageableCourseOccurrence,
} from '@/lib/supabase';

type CourseEditability = {
  can_edit: boolean;
  enrollment_count: number;
  booking_count: number;
  related_change_count: number;
};

export default function CourseDetailScreen() {
  const router = useRouter();
  const { id, sessionId } = useLocalSearchParams<{ id: string; sessionId?: string }>();
  const { hasPermission } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [clients, setClients] = useState<CourseClient[]>([]);
  const [occurrences, setOccurrences] = useState<ManageableCourseOccurrence[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionClients, setSessionClients] = useState<CourseSessionClient[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courseEditable, setCourseEditable] = useState(false);

  const canManage = hasPermission('courses', 'assign_clients');
  const canEditCourse =
    hasPermission('courses', 'update', 'all') &&
    hasPermission('courses', 'assign_trainer', 'all') &&
    hasPermission('courses', 'publish', 'all');

  const load = useCallback(
    async (asRefresh = false) => {
      if (!id || !canManage) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (asRefresh) setRefreshing(true);
      setError(null);
      try {
        const editabilityRequest = canEditCourse
          ? supabase.rpc('get_course_editability', { target_course_id: id })
          : Promise.resolve({ data: null, error: null });
        const [courseResult, clientsResult, editabilityResult, occurrencesResult] = await Promise.all([
          supabase.from('courses').select('*').eq('id', id).single(),
          supabase.rpc('get_course_clients', { target_course_id: id }),
          editabilityRequest,
          supabase.rpc('get_manageable_group_course_occurrences'),
        ]);

        if (courseResult.error) throw courseResult.error;
        if (clientsResult.error) throw clientsResult.error;
        if (occurrencesResult.error) throw occurrencesResult.error;

        setCourse(courseResult.data as Course);
        setClients((clientsResult.data ?? []) as CourseClient[]);
        const courseOccurrences = (
          (occurrencesResult.data ?? []) as ManageableCourseOccurrence[]
        ).filter((occurrence) => occurrence.course_id === id);
        setOccurrences(courseOccurrences);

        const selectedOccurrence =
          courseOccurrences.find((occurrence) => occurrence.session_id === sessionId) ??
          courseOccurrences[0];
        setSelectedSessionId(selectedOccurrence?.session_id ?? null);

        if (selectedOccurrence) {
          const sessionClientsResult = await supabase.rpc('get_course_session_clients', {
            target_session_id: selectedOccurrence.session_id,
          });
          if (sessionClientsResult.error) throw sessionClientsResult.error;
          setSessionClients((sessionClientsResult.data ?? []) as CourseSessionClient[]);
        } else {
          setSessionClients([]);
        }
        const editability = !editabilityResult.error && Array.isArray(editabilityResult.data)
          ? (editabilityResult.data[0] as CourseEditability | undefined)
          : undefined;
        setCourseEditable(editability?.can_edit ?? false);
      } catch (loadError: any) {
        setError(loadError.message || 'El curso no se pudo cargar.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canEditCourse, canManage, id, sessionId]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const selectedOccurrence = occurrences.find(
    (occurrence) => occurrence.session_id === selectedSessionId
  );
  const participants = sessionClients;
  const confirmedCount = participants.filter(
    (client) => client.booking_status === 'confirmed'
  ).length;
  const availableClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-ES');
    return clients.filter((client) => {
      if (client.enrollment_status === 'confirmed' || client.enrollment_status === 'waitlisted') {
        return false;
      }
      if (!normalizedQuery) return true;
      return getClientName(client).toLocaleLowerCase('es-ES').includes(normalizedQuery);
    });
  }, [clients, query]);

  if (!canManage) {
    return (
      <View style={styles.denied}>
        <Text style={styles.secondary}>Esta sección está disponible para admins y entrenadores.</Text>
      </View>
    );
  }

  const openPicker = () => {
    setSelectedIds([]);
    setQuery('');
    setPickerVisible(true);
  };

  const toggleClient = (userId: string) => {
    setSelectedIds((current) =>
      current.includes(userId)
        ? current.filter((selectedId) => selectedId !== userId)
        : [...current, userId]
    );
  };

  const selectOccurrence = async (occurrence: ManageableCourseOccurrence) => {
    if (occurrence.session_id === selectedSessionId) return;

    setSelectedSessionId(occurrence.session_id);
    setSessionClients([]);
    try {
      const { data, error: sessionClientsError } = await supabase.rpc(
        'get_course_session_clients',
        { target_session_id: occurrence.session_id }
      );
      if (sessionClientsError) throw sessionClientsError;
      setSessionClients((data ?? []) as CourseSessionClient[]);
    } catch (sessionClientsError: any) {
      Alert.alert(
        'No se pudieron cargar los participantes',
        sessionClientsError.message || 'Inténtalo de nuevo.'
      );
    }
  };

  const addClients = async () => {
    if (!course || selectedIds.length === 0 || saving) return;
    setSaving(true);
    try {
      const { data, error: addError } = await supabase.rpc('add_clients_to_course', {
        target_course_id: course.id,
        target_customer_ids: selectedIds,
      });
      if (addError) throw addError;

      const result = data as AddClientsToCourseResult;
      setPickerVisible(false);
      setSelectedIds([]);
      await load(true);

      const summary = [
        result.confirmed > 0 ? `${result.confirmed} confirmados` : null,
        result.waitlisted > 0 ? `${result.waitlisted} en lista de espera` : null,
        result.skipped > 0 ? `${result.skipped} ya inscritos` : null,
      ].filter(Boolean);
      Alert.alert('Clientes añadidos', summary.join(' · ') || 'No hubo cambios.');
    } catch (addError: any) {
      Alert.alert(
        'No se pudieron añadir',
        addError.message || 'Comprueba la selección e inténtalo de nuevo.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
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
            <Text style={styles.eyebrow}>CLASE</Text>
            <Text style={styles.title}>{course ? formatCourseTitle(course) : 'Detalle'}</Text>
          </View>
          {course && canEditCourse ? (
            <Pressable
              accessibilityLabel="Editar curso"
              disabled={!courseEditable}
              onPress={() => router.push(`/new-course?courseId=${course.id}` as Href)}
              style={({ pressed }) => [
                styles.editButton,
                !courseEditable && styles.editButtonDisabled,
                pressed && styles.pressed,
              ]}>
              <Feather
                color={courseEditable ? adminColors.amber : adminColors.textDisabled}
                name="edit-2"
                size={16}
              />
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <>
            <SkeletonBlock height={116} />
            <SkeletonBlock height={180} />
          </>
        ) : error ? (
          <AdminCard>
            <Text style={styles.error}>{error}</Text>
          </AdminCard>
        ) : course ? (
          <>
            <AdminCard>
              <View style={styles.courseMetaRow}>
                <Feather color={adminColors.iconDefault} name="clock" size={15} />
                <Text style={styles.secondary}>{formatSchedule(course)}</Text>
              </View>
              {course.repetition === 'weekly' && selectedOccurrence ? (
                <View style={styles.courseMetaRow}>
                  <Feather color={adminColors.amber} name="calendar" size={15} />
                  <Text style={styles.selectedDateText}>
                    Seleccionada: {formatOccurrence(selectedOccurrence)}
                  </Text>
                </View>
              ) : null}
              <View style={styles.courseMetaRow}>
                <Feather color={adminColors.iconDefault} name="map-pin" size={15} />
                <Text style={styles.secondary}>{course.room || 'Sin sala'}</Text>
              </View>
              {selectedOccurrence ? (
                <View style={styles.progress}>
                  <ProgressBar capacity={selectedOccurrence.capacity} taken={confirmedCount} />
                </View>
              ) : (
                <Text style={styles.noOccurrences}>No hay próximas sesiones programadas.</Text>
              )}
              {canEditCourse && !courseEditable ? (
                <View style={styles.editLockedRow}>
                  <Feather color={adminColors.textMuted} name="lock" size={13} />
                  <Text style={styles.editLockedText}>
                    Este curso ya tiene inscripciones o reservas. La ediciÃ³n estÃ¡ bloqueada.
                  </Text>
                </View>
              ) : null}
            </AdminCard>

            {occurrences.length > 0 ? (
              <>
                <SectionHeading title={`Próximas sesiones · ${occurrences.length}`} />
                <ScrollView
                  contentContainerStyle={styles.occurrenceList}
                  horizontal
                  showsHorizontalScrollIndicator={false}>
                  {occurrences.map((occurrence) => {
                    const selected = occurrence.session_id === selectedSessionId;
                    return (
                      <Pressable
                        key={occurrence.session_id}
                        onPress={() => void selectOccurrence(occurrence)}
                        style={({ pressed }) => [
                          styles.occurrenceChip,
                          selected && styles.occurrenceChipSelected,
                          pressed && styles.pressed,
                        ]}>
                        <Text
                          style={[
                            styles.occurrenceDate,
                            selected && styles.occurrenceTextSelected,
                          ]}>
                          {formatOccurrenceDate(occurrence.start_at)}
                        </Text>
                        <Text
                          style={[
                            styles.occurrenceTime,
                            selected && styles.occurrenceTextSelected,
                          ]}>
                          {formatOccurrenceTime(occurrence.start_at, occurrence.end_at)}
                        </Text>
                        <Text
                          style={[
                            styles.occurrenceCapacity,
                            selected && styles.occurrenceTextSelected,
                          ]}>
                          {occurrence.confirmed_count}/{occurrence.capacity} plazas
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            <SectionHeading
              action={
                <Pressable
                  onPress={openPicker}
                  style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
                  <Feather color={adminColors.amberOn} name="user-plus" size={14} />
                  <Text style={styles.addButtonText}>Añadir clientes</Text>
                </Pressable>
              }
              title={`Participantes de la sesión · ${participants.length}`}
            />

            {participants.length === 0 ? (
              <EmptyState
                actionLabel="Añadir clientes"
                message={
                  selectedOccurrence
                    ? 'No hay reservas confirmadas para esta sesión.'
                    : 'Este curso no tiene una sesión próxima.'
                }
                onAction={openPicker}
                title="Todavía no hay participantes"
              />
            ) : (
              <View style={styles.list}>
                {participants.map((client) => (
                  <AdminCard key={client.booking_id}>
                    <View style={styles.clientRow}>
                      <InitialAvatar firstName={client.first_name} lastName={client.last_name} />
                      <View style={styles.clientCopy}>
                        <Text style={styles.clientName}>{getClientName(client)}</Text>
                        <Text style={styles.secondary}>
                          {client.booking_status === 'confirmed'
                            ? 'Reserva confirmada para esta sesión'
                            : 'Lista de espera'}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          client.booking_status === 'confirmed'
                            ? styles.confirmedBadge
                            : styles.waitlistBadge,
                        ]}>
                        <Text
                          style={[
                            styles.statusText,
                            client.booking_status === 'confirmed'
                              ? styles.confirmedText
                              : styles.waitlistText,
                          ]}>
                          {client.booking_status === 'confirmed' ? 'Confirmado' : 'Espera'}
                        </Text>
                      </View>
                    </View>
                  </AdminCard>
                ))}
              </View>
            )}
          </>
        ) : null}
      </AdminScrollScreen>

      <Modal
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}
        presentationStyle="pageSheet"
        visible={pickerVisible}>
        <AdminScrollScreen includeTabInset={false} style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.eyebrow}>CURSO</Text>
              <Text style={styles.title}>Añadir clientes</Text>
            </View>
            <Pressable
              accessibilityLabel="Cerrar"
              onPress={() => setPickerVisible(false)}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <Feather color={adminColors.textPrimary} name="x" size={18} />
            </Pressable>
          </View>

          <SearchInput
            onChangeText={setQuery}
            placeholder="Buscar cliente"
            value={query}
          />

          <Text style={styles.selectionMeta}>{selectedIds.length} seleccionados</Text>

          {availableClients.length === 0 ? (
            <EmptyState
              message="Todos los clientes aprobados ya están inscritos o no coinciden con la búsqueda."
              title="No hay clientes disponibles"
            />
          ) : (
            <View style={styles.pickerList}>
              {availableClients.map((client) => {
                const selected = selectedIds.includes(client.user_id);
                return (
                  <Pressable
                    key={client.user_id}
                    onPress={() => toggleClient(client.user_id)}
                    style={({ pressed }) => pressed && styles.pressed}>
                    <AdminCard style={selected ? styles.selectedCard : undefined}>
                      <View style={styles.clientRow}>
                        <InitialAvatar firstName={client.first_name} lastName={client.last_name} />
                        <Text style={[styles.clientName, styles.clientCopy]}>
                          {getClientName(client)}
                        </Text>
                        <View style={[styles.check, selected && styles.checkSelected]}>
                          {selected ? (
                            <Feather color={adminColors.amberOn} name="check" size={14} />
                          ) : null}
                        </View>
                      </View>
                    </AdminCard>
                  </Pressable>
                );
              })}
            </View>
          )}

          <PrimaryButton
            disabled={selectedIds.length === 0 || saving}
            onPress={() => void addClients()}>
            {saving ? 'Guardando…' : `Confirmar ${selectedIds.length} cliente(s)`}
          </PrimaryButton>
        </AdminScrollScreen>
      </Modal>
    </>
  );
}

function getClientName(client: Pick<CourseClient, 'first_name' | 'last_name'>) {
  return [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Cliente sin nombre';
}

function formatCourseTitle(course: Course) {
  return course.level ? `${course.title} · Nivel ${course.level.toLowerCase()}` : course.title;
}

function formatSchedule(course: Course) {
  if (course.repetition === 'weekly') {
    return `${course.weekdays.join(' ') || '—'} · ${formatTime(course.start_time)}–${formatTime(
      course.end_time
    )}`;
  }
  if (!course.start_date) return 'Sin horario';
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(course.start_date));
}

function formatTime(value: string | null) {
  return value ? value.slice(0, 5) : '—';
}

function formatOccurrence(occurrence: ManageableCourseOccurrence) {
  return `${formatOccurrenceDate(occurrence.start_at)} · ${formatOccurrenceTime(
    occurrence.start_at,
    occurrence.end_at
  )}`;
}

function formatOccurrenceDate(value: string) {
  const date = new Date(value);
  const numericDate = [
    String(date.getDate()).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    date.getFullYear(),
  ].join('.');
  const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(date);
  return `${numericDate} · ${weekday}`;
}

function formatOccurrenceTime(startValue: string, endValue: string) {
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
  editButton: {
    alignItems: 'center',
    borderColor: adminColors.amber,
    borderRadius: adminRadius.iconBox,
    borderWidth: adminHairline,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  editButtonDisabled: {
    borderColor: adminColors.border,
    opacity: 0.55,
  },
  eyebrow: {
    ...adminType.eyebrow,
  },
  title: {
    ...adminType.title,
    marginTop: 4,
  },
  secondary: {
    ...adminType.secondary,
    flexShrink: 1,
  },
  error: {
    color: adminColors.urgent,
    fontSize: 12,
  },
  courseMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    marginBottom: 10,
  },
  selectedDateText: {
    color: adminColors.amber,
    flexShrink: 1,
    fontSize: 11,
  },
  progress: {
    marginTop: 8,
  },
  noOccurrences: {
    ...adminType.secondary,
    marginTop: 6,
  },
  occurrenceList: {
    gap: 8,
    paddingBottom: 2,
  },
  occurrenceChip: {
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.borderStrong,
    borderRadius: adminRadius.input,
    borderWidth: adminHairline,
    minWidth: 128,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  occurrenceChipSelected: {
    backgroundColor: adminColors.amber,
    borderColor: adminColors.amber,
  },
  occurrenceDate: {
    color: adminColors.textPrimary,
    fontSize: 11,
    fontWeight: '500',
  },
  occurrenceTime: {
    color: adminColors.textSecondary,
    fontSize: 10,
    marginTop: 3,
  },
  occurrenceCapacity: {
    color: adminColors.textMuted,
    fontSize: 9,
    marginTop: 5,
  },
  occurrenceTextSelected: {
    color: adminColors.amberOn,
  },
  editLockedRow: {
    alignItems: 'flex-start',
    borderTopColor: adminColors.border,
    borderTopWidth: adminHairline,
    flexDirection: 'row',
    gap: 7,
    marginTop: 14,
    paddingTop: 12,
  },
  editLockedText: {
    ...adminType.secondary,
    flex: 1,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: adminColors.amber,
    borderRadius: adminRadius.input,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  addButtonText: {
    color: adminColors.amberOn,
    fontSize: 11,
    fontWeight: '500',
  },
  list: {
    gap: 8,
  },
  clientRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  clientCopy: {
    flex: 1,
  },
  clientName: {
    ...adminType.rowTitle,
  },
  statusBadge: {
    borderRadius: adminRadius.chip,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  confirmedBadge: {
    backgroundColor: adminColors.availableTint,
  },
  waitlistBadge: {
    backgroundColor: adminColors.amberTint,
  },
  statusText: {
    ...adminType.badge,
  },
  confirmedText: {
    color: adminColors.available,
  },
  waitlistText: {
    color: adminColors.amber,
  },
  modalScreen: {
    backgroundColor: adminColors.bgPage,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderRadius: adminRadius.iconBox,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  selectionMeta: {
    ...adminType.secondary,
    marginBottom: 10,
    marginTop: 12,
  },
  pickerList: {
    gap: 8,
    marginBottom: 18,
  },
  selectedCard: {
    borderColor: adminColors.amber,
  },
  check: {
    alignItems: 'center',
    borderColor: adminColors.borderStrong,
    borderRadius: 8,
    borderWidth: adminHairline,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  checkSelected: {
    backgroundColor: adminColors.amber,
    borderColor: adminColors.amber,
  },
  pressed: {
    opacity: 0.7,
  },
});
