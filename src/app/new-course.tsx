import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AdminTextInput,
  FilterChip,
  InitialAvatar,
  PrimaryButton,
} from '@/components/admin/admin-ui';
import {
  adminColors,
  adminHairline,
  adminRadius,
  adminSpacing,
  adminType,
} from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import { useAdminData } from '@/hooks/use-admin-data';
import { supabase, type UserProfile } from '@/lib/supabase';

const LEVELS = ['Bajo', 'Medio', 'Alto'] as const;
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

export default function NewCourseScreen() {
  const router = useRouter();
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const insets = useSafeAreaInsets();
  const { hasPermission, userProfile } = useAuth();
  const { courses, loading: adminDataLoading, profiles, roleAssignments } = useAdminData();
  const isEditing = Boolean(courseId);
  const initializedCourseId = useRef<string | null>(null);
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('Bajo');
  const [trainer, setTrainer] = useState<UserProfile | null>(null);
  const [trainerModalVisible, setTrainerModalVisible] = useState(false);
  const [repetition, setRepetition] = useState<'once' | 'weekly'>('weekly');
  const [weekdays, setWeekdays] = useState<string[]>(['L', 'X', 'V']);
  const [courseDate, setCourseDate] = useState(getTomorrowDateInput);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const [capacity, setCapacity] = useState('10');
  const [price, setPrice] = useState('Incluido');
  const [room, setRoom] = useState('Sala principal');
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [published, setPublished] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editLoaded, setEditLoaded] = useState(!isEditing);

  const trainers = useMemo(
    () =>
      profiles.filter(
        (profile) =>
          profile.status === 'approved' &&
          roleAssignments.some(
            (assignment) =>
              assignment.user_id === profile.user_id && assignment.role === 'trainer'
          )
      ),
    [profiles, roleAssignments]
  );

  useEffect(() => {
    if (!isEditing && !trainer && trainers.length > 0) {
      setTrainer(trainers[0]);
    }
  }, [isEditing, trainer, trainers]);

  useEffect(() => {
    if (
      !isEditing ||
      !courseId ||
      adminDataLoading ||
      initializedCourseId.current === courseId
    ) {
      return;
    }

    initializedCourseId.current = courseId;
    const existingCourse = courses.find((course) => course.id === courseId);
    if (!existingCourse) {
      Alert.alert('Curso no encontrado', 'El curso ya no existe o no estÃ¡ disponible.', [
        { text: 'Aceptar', onPress: () => router.back() },
      ]);
      return;
    }

    setLevel(existingCourse.level ?? 'Bajo');
    setTrainer(
      profiles.find((profile) => profile.user_id === existingCourse.trainer_id) ?? null
    );
    setRepetition(existingCourse.repetition);
    setWeekdays(existingCourse.weekdays);
    if (existingCourse.start_date) {
      setCourseDate(formatDateInput(new Date(existingCourse.start_date)));
    }
    setStartTime(normalizeTime(existingCourse.start_time, '08:00'));
    setEndTime(normalizeTime(existingCourse.end_time, '09:00'));
    setCapacity(String(existingCourse.max_participants ?? 10));
    setPrice(existingCourse.price || 'Incluido');
    setRoom(existingCourse.room || 'Sala principal');
    setWaitlistEnabled(existingCourse.waitlist_enabled);
    setApprovalRequired(existingCourse.approval_required);
    setPublished(existingCourse.published);
    setEditLoaded(true);
  }, [adminDataLoading, courseId, courses, isEditing, profiles, router]);

  const hasCreateAccess =
    hasPermission('courses', 'create', 'all') &&
    hasPermission('courses', 'assign_trainer', 'all');
  const hasEditAccess =
    hasPermission('courses', 'update', 'all') &&
    hasPermission('courses', 'assign_trainer', 'all') &&
    hasPermission('courses', 'publish', 'all');

  if (
    (isEditing ? !hasEditAccess : !hasCreateAccess) ||
    userProfile?.status !== 'approved'
  ) {
    return (
      <View style={[styles.denied, { paddingTop: insets.top }]}>
        <Text style={styles.deniedText}>Esta sección solo está disponible para admins.</Text>
      </View>
    );
  }

  if (isEditing && (!editLoaded || adminDataLoading)) {
    return (
      <View style={[styles.denied, { paddingTop: insets.top }]}>
        <Text style={styles.deniedText}>Cargando curso...</Text>
      </View>
    );
  }

  const toggleWeekday = (weekday: string) => {
    setWeekdays((current) =>
      current.includes(weekday)
        ? current.filter((item) => item !== weekday)
        : [...current, weekday]
    );
  };

  const save = async (asDraft: boolean) => {
    if (!trainer) {
      Alert.alert('Falta el entrenador', 'Selecciona un entrenador para el curso.');
      return;
    }

    const startMinutes = parseTime(startTime);
    const endMinutes = parseTime(endTime);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      Alert.alert('Horario incorrecto', 'Introduce horas válidas y una hora final posterior.');
      return;
    }

    if (repetition === 'weekly' && weekdays.length === 0) {
      Alert.alert('Falta el día', 'Selecciona al menos un día de la semana.');
      return;
    }

    const parsedCapacity = Number.parseInt(capacity, 10);
    if (!Number.isFinite(parsedCapacity) || parsedCapacity <= 0) {
      Alert.alert('Capacidad incorrecta', 'Introduce una capacidad válida.');
      return;
    }

    let startDate: string | null = null;
    let endDate: string | null = null;
    if (repetition === 'once') {
      startDate = buildLocalDateTime(courseDate, startTime);
      endDate = buildLocalDateTime(courseDate, endTime);
      if (!startDate || !endDate) {
        Alert.alert('Fecha incorrecta', 'Introduce la fecha con el formato AAAA-MM-DD.');
        return;
      }
    }

    setSaving(true);
    try {
      const courseValues = {
        p_title: 'ET',
        p_category: 'ET',
        p_level: level,
        p_trainer_id: trainer.user_id,
        p_repetition: repetition,
        p_weekdays: repetition === 'weekly' ? weekdays : [],
        p_start_time: startTime,
        p_end_time: endTime,
        p_start_date: startDate,
        p_end_date: endDate,
        p_max_participants: parsedCapacity,
        p_price: price.trim() || 'Incluido',
        p_room: room.trim() || 'Sala principal',
        p_waitlist_enabled: waitlistEnabled,
        p_approval_required: approvalRequired,
        p_published: asDraft ? false : published,
      };
      const { error } = isEditing
        ? await supabase.rpc('update_unoccupied_course', {
            target_course_id: courseId,
            ...courseValues,
          })
        : await supabase.rpc('create_course', courseValues);
      if (error) throw error;

      Alert.alert(
        isEditing ? 'Curso actualizado' : asDraft ? 'Borrador guardado' : 'Curso guardado',
        isEditing
          ? 'Los cambios se han guardado correctamente.'
          : asDraft
            ? 'El borrador se ha guardado en Supabase.'
            : 'El curso se ha guardado en Supabase.',
        [{ text: 'Aceptar', onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert(
        isEditing ? 'No se pudo actualizar' : 'Error',
        error.message ||
          (isEditing
            ? 'El curso ya tiene reservas o no se pudo actualizar.'
            : 'El curso no se pudo guardar.')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Volver"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.headerBack, pressed && styles.pressed]}>
            <Feather color={adminColors.textPrimary} name="arrow-left" size={18} />
          </Pressable>
          <Text style={styles.headerTitle}>{isEditing ? 'Editar curso' : 'Nuevo curso'}</Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.cancel}>Cancelar</Text>
          </Pressable>
        </View>

        <View style={styles.form}>
          <View style={styles.group}>
            <Text style={styles.label}>Curso</Text>
            <View style={styles.courseTypeCard}>
              <Text style={styles.courseType}>ET</Text>
              <Text style={styles.courseTypeDescription}>Entrenamiento Personal · Grupo</Text>
            </View>
          </View>

          <View style={styles.group}>
            <Text style={styles.label}>Nivel</Text>
            <View style={styles.wrap}>
              {LEVELS.map((item) => (
                <FilterChip
                  active={level === item}
                  key={item}
                  label={item}
                  onPress={() => setLevel(item)}
                />
              ))}
            </View>
          </View>

          <View style={styles.group}>
            <Text style={styles.label}>Entrenador</Text>
            <Pressable
              onPress={() => setTrainerModalVisible(true)}
              style={({ pressed }) => [styles.select, pressed && styles.pressed]}>
              <InitialAvatar
                firstName={trainer?.first_name}
                lastName={trainer?.last_name}
                staff
              />
              <Text style={styles.selectText}>
                {[trainer?.first_name, trainer?.last_name].filter(Boolean).join(' ') ||
                  'Seleccionar entrenador'}
              </Text>
              <Feather color={adminColors.textMuted} name="chevron-down" size={15} />
            </Pressable>
          </View>

          <View style={styles.group}>
            <Text style={styles.label}>Repetición</Text>
            <View style={styles.twoColumns}>
              <FilterChip
                active={repetition === 'once'}
                label="Una vez"
                onPress={() => setRepetition('once')}
              />
              <FilterChip
                active={repetition === 'weekly'}
                label="Semanal"
                onPress={() => setRepetition('weekly')}
              />
            </View>
          </View>

          {repetition === 'weekly' ? (
            <View style={styles.weekdayRow}>
              {WEEKDAYS.map((weekday) => {
                const active = weekdays.includes(weekday);
                return (
                  <Pressable
                    key={weekday}
                    onPress={() => toggleWeekday(weekday)}
                    style={({ pressed }) => [
                      styles.weekday,
                      active && styles.weekdayActive,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.weekdayText, active && styles.weekdayTextActive]}>
                      {weekday}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <AdminTextInput
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              label="Fecha"
              onChangeText={setCourseDate}
              placeholder="AAAA-MM-DD"
              value={courseDate}
            />
          )}

          <View style={styles.twoColumns}>
            <View style={styles.column}>
              <AdminTextInput
                label="Hora inicio"
                onChangeText={setStartTime}
                placeholder="08:00"
                value={startTime}
              />
            </View>
            <View style={styles.column}>
              <AdminTextInput
                label="Hora fin"
                onChangeText={setEndTime}
                placeholder="09:00"
                value={endTime}
              />
            </View>
          </View>

          <View style={styles.twoColumns}>
            <View style={styles.column}>
              <AdminTextInput
                keyboardType="number-pad"
                label="Capacidad"
                onChangeText={setCapacity}
                placeholder="10 plazas"
                value={capacity}
              />
            </View>
            <View style={styles.column}>
              <AdminTextInput
                label="Precio"
                onChangeText={setPrice}
                placeholder="Incluido"
                value={price}
              />
            </View>
          </View>

          <AdminTextInput
            label="Sala"
            onChangeText={setRoom}
            placeholder="Sala principal"
            value={room}
          />

          <View style={styles.toggleList}>
            <ToggleRow
              description="Si el curso está lleno"
              onChange={setWaitlistEnabled}
              title="Lista de espera"
              value={waitlistEnabled}
            />
            <ToggleRow
              description="Confirmar cada solicitud"
              onChange={setApprovalRequired}
              title="Aprobar reservas"
              value={approvalRequired}
            />
            <ToggleRow
              description="Visible para los clientes"
              onChange={setPublished}
              title="Publicar curso"
              value={published}
            />
          </View>

          <View style={styles.footerActions}>
            {!isEditing ? (
              <PrimaryButton
                disabled={saving}
                onPress={() => void save(true)}
                secondary
                style={styles.draftButton}>
                Borrador
              </PrimaryButton>
            ) : null}
            <PrimaryButton
              disabled={saving}
              onPress={() => void save(false)}
              style={isEditing ? styles.editSaveButton : styles.saveButton}>
              {saving
                ? 'Guardando…'
                : isEditing
                  ? 'Guardar cambios'
                  : 'Guardar curso'}
            </PrimaryButton>
          </View>
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => setTrainerModalVisible(false)}
        presentationStyle="pageSheet"
        visible={trainerModalVisible}>
        <View style={[styles.modal, { paddingTop: insets.top + 18 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Seleccionar entrenador</Text>
            <Pressable onPress={() => setTrainerModalVisible(false)}>
              <Text style={styles.modalDone}>Cerrar</Text>
            </Pressable>
          </View>
          {trainers.map((profile) => (
            <Pressable
              key={profile.id}
              onPress={() => {
                setTrainer(profile);
                setTrainerModalVisible(false);
              }}
              style={({ pressed }) => [styles.trainerRow, pressed && styles.pressed]}>
              <InitialAvatar
                firstName={profile.first_name}
                lastName={profile.last_name}
                staff
              />
              <Text style={styles.trainerName}>
                {[profile.first_name, profile.last_name].filter(Boolean).join(' ')}
              </Text>
              {trainer?.id === profile.id ? (
                <Feather color={adminColors.amber} name="check" size={17} />
              ) : null}
            </Pressable>
          ))}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function getTomorrowDateInput() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatDateInput(tomorrow);
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeTime(value: string | null, fallback: string) {
  return value ? value.slice(0, 5) : fallback;
}

function parseTime(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
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
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date.toISOString();
}

function ToggleRow({
  description,
  onChange,
  title,
  value,
}: {
  description: string;
  onChange: (value: boolean) => void;
  title: string;
  value: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        onPress={() => onChange(!value)}
        style={[styles.toggle, value && styles.toggleOn]}>
        <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: adminColors.bgPage,
    flex: 1,
  },
  denied: {
    alignItems: 'center',
    backgroundColor: adminColors.bgPage,
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  deniedText: {
    ...adminType.secondary,
    textAlign: 'center',
  },
  content: {
    paddingHorizontal: adminSpacing.screen,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 24,
  },
  headerBack: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  headerTitle: {
    color: adminColors.textPrimary,
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 4,
  },
  cancel: {
    color: adminColors.textMuted,
    fontSize: 12,
  },
  form: {
    gap: 18,
  },
  group: {
    gap: 6,
  },
  label: {
    color: adminColors.textSecondary,
    fontSize: 11,
  },
  courseTypeCard: {
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.borderInput,
    borderRadius: adminRadius.input,
    borderWidth: adminHairline,
    padding: 12,
  },
  courseType: {
    ...adminType.rowTitle,
  },
  courseTypeDescription: {
    ...adminType.secondary,
    marginTop: 3,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  newCategory: {
    borderColor: adminColors.amber,
    borderRadius: adminRadius.chip,
    borderWidth: adminHairline,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  newCategoryText: {
    color: adminColors.amber,
    fontSize: 12,
    fontWeight: '500',
  },
  select: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.borderInput,
    borderRadius: adminRadius.input,
    borderWidth: adminHairline,
    flexDirection: 'row',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  selectText: {
    ...adminType.body,
    flex: 1,
  },
  twoColumns: {
    flexDirection: 'row',
    gap: 8,
  },
  column: {
    flex: 1,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekday: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.borderInput,
    borderRadius: adminRadius.day,
    borderWidth: adminHairline,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  weekdayActive: {
    backgroundColor: adminColors.amber,
    borderColor: adminColors.amber,
  },
  weekdayText: {
    color: adminColors.textMuted,
    fontSize: 11,
  },
  weekdayTextActive: {
    color: adminColors.amberOn,
    fontWeight: '500',
  },
  toggleList: {
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.border,
    borderRadius: adminRadius.card,
    borderWidth: adminHairline,
    paddingHorizontal: 14,
  },
  toggleRow: {
    alignItems: 'center',
    borderBottomColor: adminColors.border,
    borderBottomWidth: adminHairline,
    flexDirection: 'row',
    minHeight: 60,
  },
  toggleCopy: {
    flex: 1,
    flexShrink: 1,
  },
  toggleTitle: {
    ...adminType.rowTitle,
  },
  toggleDescription: {
    ...adminType.secondary,
    marginTop: 2,
  },
  toggle: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 11,
    height: 21,
    padding: 2,
    width: 36,
  },
  toggleOn: {
    backgroundColor: adminColors.amber,
  },
  toggleKnob: {
    backgroundColor: adminColors.textMuted,
    borderRadius: 8.5,
    height: 17,
    width: 17,
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
    backgroundColor: adminColors.amberOn,
  },
  footerActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  draftButton: {
    flex: 1,
  },
  saveButton: {
    flex: 1.4,
  },
  editSaveButton: {
    flex: 1,
  },
  modal: {
    backgroundColor: adminColors.bgPage,
    flex: 1,
    paddingHorizontal: 20,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  modalTitle: {
    ...adminType.section,
  },
  modalDone: {
    color: adminColors.amber,
    fontSize: 13,
    fontWeight: '500',
  },
  trainerRow: {
    alignItems: 'center',
    borderBottomColor: adminColors.border,
    borderBottomWidth: adminHairline,
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
  },
  trainerName: {
    ...adminType.rowTitle,
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
