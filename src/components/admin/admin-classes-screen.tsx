import Feather from '@expo/vector-icons/Feather';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import {
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
  EmptyState,
  FilterChip,
  ProgressBar,
  SearchInput,
  SkeletonBlock,
} from '@/components/admin/admin-ui';
import { adminColors, adminHairline, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import { useAdminData } from '@/hooks/use-admin-data';
import type { Course } from '@/lib/supabase';

const TYPE_FILTERS = ['Todos', 'Grupo', 'Individual'] as const;
const LEVEL_FILTERS = ['Todos', 'Bajo', 'Medio', 'Alto'] as const;
const DAY_FILTERS = ['Todos', 'L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;
const AVAILABILITY_FILTERS = ['Todos', 'Disponible', 'Completo'] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];
type LevelFilter = (typeof LEVEL_FILTERS)[number];
type DayFilter = (typeof DAY_FILTERS)[number];
type AvailabilityFilter = (typeof AVAILABILITY_FILTERS)[number];

type CourseCardModel = {
  id: string;
  href: Href;
  type: 'Grupo' | 'Individual';
  title: string;
  trainer: string;
  schedule: string;
  nextSession: string | null;
  level: string | null;
  weekdays: string[];
  active: boolean;
  hasOccurrence: boolean;
  capacity: number;
  taken: number;
  sessionCount: number;
  searchTerms: string[];
};

export function AdminClassesScreen() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const {
    courses,
    courseOccurrences,
    groupCourseCustomerMatches,
    personalTrainingServices,
    personalTrainingSessions,
    profiles,
    loading,
    refreshing,
    error,
    reload,
  } = useAdminData();
  const canReadAllCourses = hasPermission('courses', 'read', 'all');
  const canCreateCourse = hasPermission('courses', 'create', 'all');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('Todos');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('Todos');
  const [dayFilter, setDayFilter] = useState<DayFilter>('Todos');
  const [availabilityFilter, setAvailabilityFilter] =
    useState<AvailabilityFilter>('Todos');

  const courseCards = useMemo<CourseCardModel[]>(() => {
    const customerNamesByCourse = new Map<string, string[]>();
    groupCourseCustomerMatches.forEach((match) => {
      if (!match.customer_name) return;
      const names = customerNamesByCourse.get(match.course_id) ?? [];
      names.push(match.customer_name);
      customerNamesByCourse.set(match.course_id, names);
    });

    const groupCards = [...courses]
      .filter((course) => course.format === 'group')
      .sort(compareCourses)
      .map<CourseCardModel>((course) => {
      const trainer = profiles.find((profile) => profile.user_id === course.trainer_id);
      const trainerName =
        [trainer?.first_name, trainer?.last_name].filter(Boolean).join(' ') ||
        'Sin entrenador';
      const nextOccurrence = courseOccurrences.find(
        (occurrence) => occurrence.course_id === course.id
      );

      return {
        id: course.id,
        href: (nextOccurrence
          ? `/course/${course.id}?sessionId=${nextOccurrence.session_id}`
          : `/course/${course.id}`) as Href,
        type: 'Grupo',
        title: course.level ? `${course.title} · Nivel ${course.level.toLowerCase()}` : course.title,
        trainer: trainerName,
        schedule:
          course.repetition === 'weekly'
            ? formatWeeklySchedule(course.weekdays, course.start_time, course.end_time)
            : formatSingleSchedule(course.start_date, course.end_date),
        nextSession:
          course.repetition === 'weekly' && nextOccurrence
            ? formatSingleSchedule(nextOccurrence.start_at, nextOccurrence.end_at)
            : null,
        level: course.level,
        weekdays:
          course.repetition === 'weekly'
            ? course.weekdays
            : course.start_date
              ? [getWeekdayCode(course.start_date)]
              : [],
        active: course.published ?? course.start_date !== null,
        hasOccurrence: Boolean(nextOccurrence),
        capacity: nextOccurrence?.capacity ?? course.max_participants ?? 0,
        taken: nextOccurrence?.confirmed_count ?? 0,
        sessionCount: courseOccurrences.filter(
          (occurrence) => occurrence.course_id === course.id
        ).length,
        searchTerms: [course.title, trainerName, ...(customerNamesByCourse.get(course.id) ?? [])],
      };
    });

    const individualCards = personalTrainingServices.map<CourseCardModel>((service) => {
      const serviceSessions = personalTrainingSessions.filter(
        (session) => session.service_id === service.id
      );
      const nextSession = serviceSessions[0];
      const trainerCount = new Set(serviceSessions.map((session) => session.trainer_id)).size;
      const trainerLabel =
        trainerCount === 1
          ? nextSession?.trainer_name || 'Sin entrenador'
          : trainerCount > 1
            ? `${trainerCount} entrenadores`
            : 'Según solicitud';

      return {
        id: `individual-${service.id}`,
        href: `/personal-training-service/${service.id}` as Href,
        type: 'Individual',
        title: service.title,
        trainer: trainerLabel,
        schedule: 'Horarios coordinados mediante solicitudes',
        nextSession: nextSession
          ? formatSingleSchedule(nextSession.start_at, nextSession.end_at)
          : null,
        level: null,
        weekdays: [],
        active: service.active,
        hasOccurrence: serviceSessions.length > 0,
        capacity: 0,
        taken: 0,
        sessionCount: serviceSessions.length,
        searchTerms: [
          service.title,
          trainerLabel,
          ...serviceSessions.flatMap((session) => [
            session.customer_name ?? '',
            session.trainer_name ?? '',
          ]),
        ],
      };
    });

    return [...groupCards, ...individualCards];
  }, [
    courseOccurrences,
    courses,
    groupCourseCustomerMatches,
    personalTrainingServices,
    personalTrainingSessions,
    profiles,
  ]);

  const filteredCourses = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(query);
    return courseCards.filter((course) => {
      if (
        normalizedQuery &&
        !course.searchTerms.some((term) => normalizeSearchValue(term).includes(normalizedQuery))
      ) {
        return false;
      }
      if (typeFilter !== 'Todos' && course.type !== typeFilter) return false;
      if (levelFilter !== 'Todos' && course.level !== levelFilter) return false;
      if (dayFilter !== 'Todos' && !course.weekdays.includes(dayFilter)) return false;
      if (
        availabilityFilter === 'Disponible' &&
        (!course.hasOccurrence || course.taken >= course.capacity)
      ) {
        return false;
      }
      if (
        availabilityFilter === 'Completo' &&
        (!course.hasOccurrence || course.taken < course.capacity)
      ) {
        return false;
      }
      return true;
    });
  }, [availabilityFilter, courseCards, dayFilter, levelFilter, query, typeFilter]);

  const handleRefresh = async () => {
    await reload();
  };

  const openCourse = (course: CourseCardModel) => {
    const activeQuery = query.trim();
    if (course.type === 'Individual' && activeQuery) {
      router.push(`${course.href}?q=${encodeURIComponent(activeQuery)}` as Href);
      return;
    }
    router.push(course.href);
  };

  return (
    <AdminScrollScreen
      refreshControl={
        <RefreshControl
          onRefresh={() => void handleRefresh()}
          refreshing={refreshing}
          tintColor={adminColors.amber}
        />
      }>
      <AdminHeader
        eyebrow={canReadAllCourses ? 'CLASES' : 'MIS CLASES'}
        right={
          canCreateCourse ? (
          <Pressable
            accessibilityLabel="Nuevo curso"
            onPress={() => router.push('/new-course' as Href)}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <Feather color={adminColors.amberOn} name="plus" size={17} />
          </Pressable>
          ) : undefined
        }
      />

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>CURSO</Text>
        <SearchInput
          onChangeText={setQuery}
          placeholder="Buscar curso, cliente o entrenador"
          value={query}
        />

        <Text style={styles.filterLabel}>TIPO</Text>
        <ScrollView
          contentContainerStyle={styles.filters}
          horizontal
          showsHorizontalScrollIndicator={false}>
          {TYPE_FILTERS.map((item) => (
            <FilterChip
              active={typeFilter === item}
              key={item}
              label={item}
              onPress={() => {
                setTypeFilter(item);
                if (item !== 'Grupo') {
                  setDayFilter('Todos');
                  setAvailabilityFilter('Todos');
                }
                if (item === 'Individual') {
                  setLevelFilter('Todos');
                }
              }}
            />
          ))}
        </ScrollView>

        {typeFilter !== 'Individual' ? (
          <>
            <Text style={styles.filterLabel}>NIVEL</Text>
            <ScrollView
              contentContainerStyle={styles.filters}
              horizontal
              showsHorizontalScrollIndicator={false}>
              {LEVEL_FILTERS.map((item) => (
                <FilterChip
                  active={levelFilter === item}
                  key={item}
                  label={item}
                  onPress={() => setLevelFilter(item)}
                />
              ))}
            </ScrollView>

            <Text style={styles.filterLabel}>DISPONIBILIDAD</Text>
            <ScrollView
              contentContainerStyle={styles.filters}
              horizontal
              showsHorizontalScrollIndicator={false}>
              {AVAILABILITY_FILTERS.map((item) => (
                <FilterChip
                  active={availabilityFilter === item}
                  key={item}
                  label={item}
                  onPress={() => setAvailabilityFilter(item)}
                />
              ))}
            </ScrollView>
          </>
        ) : null}

        {typeFilter === 'Grupo' ? (
          <>
            <Text style={styles.filterLabel}>DÍA</Text>
            <ScrollView
              contentContainerStyle={styles.filters}
              horizontal
              showsHorizontalScrollIndicator={false}>
              {DAY_FILTERS.map((item) => (
                <FilterChip
                  active={dayFilter === item}
                  key={item}
                  label={item === 'Todos' ? item : WEEKDAY_NAMES[item] ?? item}
                  onPress={() => setDayFilter(item)}
                />
              ))}
            </ScrollView>
          </>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.list}>
          <SkeletonBlock height={116} />
          <SkeletonBlock height={116} />
          <SkeletonBlock height={116} />
        </View>
      ) : error ? (
        <AdminCard style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
        </AdminCard>
      ) : courseCards.length === 0 ? (
        <EmptyState
          actionLabel={canCreateCourse ? 'Nueva clase' : undefined}
          onAction={canCreateCourse ? () => router.push('/new-course' as Href) : undefined}
          title={canCreateCourse ? 'Crea tu primera clase' : 'No tienes clases asignadas'}
        />
      ) : filteredCourses.length === 0 ? (
        <EmptyState
          message="No hay clases con este filtro."
          title="Sin resultados"
        />
      ) : (
        <View style={styles.list}>
          {filteredCourses.map((course) => (
            <Pressable
              key={course.id}
              onPress={() => openCourse(course)}
              style={({ pressed }) => pressed && styles.pressed}>
              <AdminCard
                muted={!course.active}
                style={!course.active ? styles.draftCard : undefined}>
                <View style={styles.courseHeader}>
                  <View style={styles.courseCopy}>
                    <Text style={styles.courseTitle} numberOfLines={2}>
                      {course.title}
                    </Text>
                    <Text style={styles.courseMeta} numberOfLines={2}>
                      {course.schedule}
                    </Text>
                    <Text style={styles.courseType}>Tipo: {course.type}</Text>
                    <Text style={styles.courseTrainer} numberOfLines={1}>
                      Entrenador: {course.trainer}
                    </Text>
                    {course.nextSession ? (
                      <Text style={styles.nextSession} numberOfLines={2}>
                        Próxima sesión: {course.nextSession}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.statusBadge, course.active && styles.activeBadge]}>
                    <Text style={[styles.statusText, course.active && styles.activeText]}>
                      {course.active ? 'Activo' : 'Borrador'}
                    </Text>
                  </View>
                </View>

                {course.type === 'Individual' ? (
                  <Text style={styles.personalSessionCount}>
                    {course.sessionCount === 1
                      ? '1 sesión programada en las próximas 4 semanas'
                      : `${course.sessionCount} sesiones programadas en las próximas 4 semanas`}
                  </Text>
                ) : course.active && course.hasOccurrence ? (
                  <ProgressBar capacity={course.capacity} taken={course.taken} />
                ) : course.active ? (
                  <Text style={styles.unpublished}>Sin próximas sesiones</Text>
                ) : (
                  <Text style={styles.unpublished}>Sin publicar</Text>
                )}
              </AdminCard>
            </Pressable>
          ))}
        </View>
      )}
    </AdminScrollScreen>
  );
}

function formatTime(value: string | null) {
  return value ? value.slice(0, 5) : 'Sin horario';
}

function normalizeSearchValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es-ES');
}

function getWeekdayCode(value: string) {
  const weekday = new Date(value).getDay();
  return WEEKDAY_ORDER[weekday === 0 ? 6 : weekday - 1];
}

const WEEKDAY_NAMES: Record<string, string> = {
  L: 'lunes',
  M: 'martes',
  X: 'miércoles',
  J: 'jueves',
  V: 'viernes',
  S: 'sábado',
  D: 'domingo',
};

const WEEKDAY_ORDER = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function compareCourses(left: Course, right: Course) {
  if (left.repetition !== right.repetition) {
    return left.repetition === 'once' ? -1 : 1;
  }

  if (left.repetition === 'once') {
    const dateDifference = getDateSortValue(left.start_date) - getDateSortValue(right.start_date);
    if (dateDifference !== 0) return dateDifference;
  } else {
    const weekdayDifference = getFirstWeekdayIndex(left.weekdays) - getFirstWeekdayIndex(right.weekdays);
    if (weekdayDifference !== 0) return weekdayDifference;

    const timeDifference = getTimeSortValue(left.start_time) - getTimeSortValue(right.start_time);
    if (timeDifference !== 0) return timeDifference;
  }

  return left.title.localeCompare(right.title, 'es-ES');
}

function getDateSortValue(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function getFirstWeekdayIndex(weekdays: string[]) {
  return weekdays.reduce((earliest, weekday) => {
    const index = WEEKDAY_ORDER.indexOf(weekday);
    return index >= 0 ? Math.min(earliest, index) : earliest;
  }, WEEKDAY_ORDER.length);
}

function getTimeSortValue(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const [hours, minutes] = value.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes)
    ? hours * 60 + minutes
    : Number.POSITIVE_INFINITY;
}

function formatWeeklySchedule(
  weekdays: string[],
  startTime: string | null,
  endTime: string | null
) {
  const dayNames = [...weekdays]
    .sort((left, right) => WEEKDAY_ORDER.indexOf(left) - WEEKDAY_ORDER.indexOf(right))
    .map((weekday) => WEEKDAY_NAMES[weekday] ?? weekday)
    .join(', ');
  return `Semanal · ${dayNames || 'Sin días'} · ${formatTime(startTime)}–${formatTime(endTime)}`;
}

function formatSingleSchedule(startValue: string | null, endValue: string | null) {
  if (!startValue) return 'Sin fecha ni horario';

  const start = new Date(startValue);
  const end = endValue ? new Date(endValue) : null;
  const date = [
    String(start.getDate()).padStart(2, '0'),
    String(start.getMonth() + 1).padStart(2, '0'),
    start.getFullYear(),
  ].join('.');
  const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(start);
  const startTime = start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const endTime = end
    ? end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : null;

  return `${date} · ${weekday} · ${startTime}${endTime ? `–${endTime}` : ''}`;
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: 'center',
    backgroundColor: adminColors.amber,
    borderRadius: 10,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  filters: {
    gap: 8,
    paddingBottom: 4,
  },
  filterSection: {
    gap: 8,
  },
  filterLabel: {
    ...adminType.eyebrow,
    marginTop: 4,
  },
  list: {
    gap: 8,
    marginTop: 16,
  },
  courseHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 13,
  },
  courseCopy: {
    flex: 1,
    flexShrink: 1,
  },
  courseTitle: {
    ...adminType.rowTitle,
  },
  courseMeta: {
    ...adminType.secondary,
    lineHeight: 16,
    marginTop: 4,
  },
  courseType: {
    color: adminColors.textMuted,
    fontSize: 10,
    marginTop: 3,
  },
  courseTrainer: {
    ...adminType.secondary,
    marginTop: 3,
  },
  nextSession: {
    color: adminColors.amber,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  statusBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activeBadge: {
    backgroundColor: adminColors.availableTint,
  },
  statusText: {
    color: adminColors.textMuted,
    fontSize: 9,
    fontWeight: '500',
  },
  activeText: {
    color: adminColors.available,
  },
  draftCard: {
    opacity: 0.65,
  },
  unpublished: {
    ...adminType.secondary,
  },
  personalSessionCount: {
    color: adminColors.textSecondary,
    fontSize: 11,
  },
  errorCard: {
    marginTop: 16,
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
