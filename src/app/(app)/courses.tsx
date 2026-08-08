import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import {
  AdminCard,
  AdminHeader,
  AdminScrollScreen,
  EmptyState,
  PrimaryButton,
  SectionHeading,
  SkeletonBlock,
} from '@/components/admin/admin-ui';
import { adminColors, adminHairline, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import {
  supabase,
  type Booking,
  type BookingChangeRequest,
  type Course,
  type CourseEnrollment,
  type CourseSession,
  type CustomerTrainingContract,
  type GroupCourseBookingResult,
  type PersonalTrainingProposal,
  type PersonalTrainingRequest,
  type PersonalTrainingRequestTrainer,
  type PersonalTrainingService,
} from '@/lib/supabase';

export default function CoursesScreen() {
  const { hasPermission, userProfile } = useAuth();
  const canReadEligibleCourses = hasPermission('courses', 'read', 'eligible');
  const canCreateOwnBookings = hasPermission('bookings', 'create', 'own');
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseEnrollments, setCourseEnrollments] = useState<CourseEnrollment[]>([]);
  const [trainingContract, setTrainingContract] = useState<CustomerTrainingContract | null>(null);
  const [personalTrainingService, setPersonalTrainingService] =
    useState<PersonalTrainingService | null>(null);
  const [requests, setRequests] = useState<PersonalTrainingRequest[]>([]);
  const [bookingChanges, setBookingChanges] = useState<
    Record<string, BookingChangeRequest>
  >({});
  const [proposalsByRequest, setProposalsByRequest] = useState<
    Record<string, PersonalTrainingProposal[]>
  >({});
  const [requestTrainers, setRequestTrainers] = useState<
    Record<string, PersonalTrainingRequestTrainer>
  >({});
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookingCourseId, setBookingCourseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedProposalIds, setSelectedProposalIds] = useState<
    Record<string, string[]>
  >({});

  const openRequests = useMemo(
    () =>
      requests.filter(
        (request) => request.status === 'requested' || request.status === 'proposed'
      ),
    [requests]
  );
  const ordinaryOpenRequest = openRequests.find((request) => !request.change_request_id);

  const load = useCallback(
    async (asRefresh = false) => {
      if (!userProfile || !canReadEligibleCourses) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (asRefresh) setRefreshing(true);
      setError(null);

      try {
        const [
          courseResult,
          requestResult,
          bookingResult,
          contractResult,
          enrollmentResult,
          personalTrainingServiceResult,
        ] = await Promise.all([
          supabase
            .from('courses')
            .select('*')
            .eq('company_id', userProfile.company_id)
            .eq('published', true)
            .eq('format', 'group')
            .order('start_time', { ascending: true }),
          supabase
            .from('personal_training_requests')
            .select('*')
            .eq('customer_id', userProfile.user_id)
            .order('created_at', { ascending: false }),
          supabase
            .from('bookings')
            .select('*')
            .eq('user_id', userProfile.user_id)
            .eq('status', 'confirmed'),
          supabase
            .from('customer_training_contracts')
            .select('*')
            .eq('customer_id', userProfile.user_id)
            .maybeSingle(),
          supabase
            .from('course_enrollments')
            .select('*')
            .eq('user_id', userProfile.user_id)
            .in('status', ['confirmed', 'waitlisted']),
          supabase
            .from('personal_training_services')
            .select('*')
            .eq('company_id', userProfile.company_id)
            .eq('active', true)
            .maybeSingle(),
        ]);

        if (courseResult.error) throw courseResult.error;
        if (requestResult.error) throw requestResult.error;
        if (bookingResult.error) throw bookingResult.error;
        if (contractResult.error) throw contractResult.error;
        if (enrollmentResult.error) throw enrollmentResult.error;
        if (personalTrainingServiceResult.error) throw personalTrainingServiceResult.error;

        const loadedRequests = (requestResult.data ?? []) as PersonalTrainingRequest[];
        const activeRequests = loadedRequests.filter(
          (request) => request.status === 'requested' || request.status === 'proposed'
        );
        const loadedBookings = (bookingResult.data ?? []) as Booking[];

        const changeIds = activeRequests
          .map((request) => request.change_request_id)
          .filter((value): value is string => Boolean(value));
        const [proposalResult, sessionResult, trainerResult, changeResult] = await Promise.all([
          activeRequests.length > 0
            ? supabase
                .from('personal_training_proposals')
                .select('*')
                .in(
                  'request_id',
                  activeRequests.map((request) => request.id)
                )
                .eq('status', 'proposed')
                .order('start_at', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          loadedBookings.length > 0
            ? supabase
                .from('course_sessions')
                .select('*')
                .in(
                  'id',
                  loadedBookings.map((booking) => booking.session_id)
                )
                .eq('status', 'scheduled')
                .gte('start_at', new Date().toISOString())
                .order('start_at', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          Promise.all(
            activeRequests.map(async (request) => ({
              requestId: request.id,
              result: await supabase.rpc('get_own_personal_training_request_trainer', {
                target_request_id: request.id,
              }),
            }))
          ),
          changeIds.length > 0
            ? supabase.from('booking_change_requests').select('*').in('id', changeIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (proposalResult.error) throw proposalResult.error;
        if (sessionResult.error) throw sessionResult.error;
        const failedTrainerResult = trainerResult.find((entry) => entry.result.error);
        if (failedTrainerResult?.result.error) throw failedTrainerResult.result.error;
        if (changeResult.error) throw changeResult.error;

        setCourses((courseResult.data ?? []) as Course[]);
        setCourseEnrollments((enrollmentResult.data ?? []) as CourseEnrollment[]);
        setTrainingContract(contractResult.data as CustomerTrainingContract | null);
        setPersonalTrainingService(
          personalTrainingServiceResult.data as PersonalTrainingService | null
        );
        setRequests(loadedRequests);
        setProposalsByRequest(
          ((proposalResult.data ?? []) as PersonalTrainingProposal[]).reduce<
            Record<string, PersonalTrainingProposal[]>
          >((result, proposal) => {
            result[proposal.request_id] = [...(result[proposal.request_id] ?? []), proposal];
            return result;
          }, {})
        );
        setRequestTrainers(
          trainerResult.reduce<Record<string, PersonalTrainingRequestTrainer>>(
            (result, entry) => {
              const trainer = (entry.result.data ?? [])[0] as
                | PersonalTrainingRequestTrainer
                | undefined;
              if (trainer) result[entry.requestId] = trainer;
              return result;
            },
            {}
          )
        );
        setBookingChanges(
          ((changeResult.data ?? []) as BookingChangeRequest[]).reduce<
            Record<string, BookingChangeRequest>
          >((result, change) => {
            result[change.id] = change;
            return result;
          }, {})
        );
        setSessions((sessionResult.data ?? []) as CourseSession[]);
        setSelectedProposalIds({});
      } catch (loadError: any) {
        setError(loadError.message || 'Los cursos no se pudieron cargar.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canReadEligibleCourses, userProfile?.company_id, userProfile?.user_id]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!userProfile || !canReadEligibleCourses) {
    return (
      <View style={styles.denied}>
        <Text style={styles.secondary}>Esta sección está disponible para clientes.</Text>
      </View>
    );
  }

  const requestPersonalTraining = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { error: requestError } = await supabase.rpc(
        'create_personal_training_request'
      );
      if (requestError) throw requestError;
      Alert.alert(
        'Solicitud enviada',
        'Tu entrenador recibirá la solicitud y propondrá varios horarios.'
      );
      await load(true);
    } catch (requestError: any) {
      Alert.alert(
        'No se pudo enviar',
        requestError.message || 'Inténtalo de nuevo.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleProposal = (request: PersonalTrainingRequest, proposalId: string) => {
    setSelectedProposalIds((current) => {
      const requestSelection = current[request.id] ?? [];
      const nextSelection = request.change_request_id
        ? requestSelection.includes(proposalId)
          ? []
          : [proposalId]
        : requestSelection.includes(proposalId)
          ? requestSelection.filter((id) => id !== proposalId)
          : [...requestSelection, proposalId];
      return { ...current, [request.id]: nextSelection };
    });
  };

  const confirmSelected = (request: PersonalTrainingRequest) => {
    const requestSelection = selectedProposalIds[request.id] ?? [];
    if (requestSelection.length === 0 || submitting) return;

    Alert.alert(
      'Reserva vinculante',
      request.change_request_id
        ? 'Vas a sustituir la cita original por este horario. ¿Confirmas la selección?'
        : `Vas a reservar ${requestSelection.length} entrenamiento(s). ¿Confirmas la selección?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reservar',
          onPress: () => void submitConfirmation(request.id),
        },
      ]
    );
  };

  const submitConfirmation = async (requestId: string) => {
    const requestSelection = selectedProposalIds[requestId] ?? [];
    setSubmitting(true);
    try {
      const { error: confirmationError } = await supabase.rpc(
        'confirm_personal_training_slots',
        {
          target_request_id: requestId,
          selected_proposal_ids: requestSelection,
        }
      );
      if (confirmationError) throw confirmationError;

      Alert.alert(
        'Reserva confirmada',
        'Todos los entrenamientos seleccionados se han reservado correctamente.'
      );
      await load(true);
    } catch (confirmationError: any) {
      Alert.alert(
        'No se pudo reservar',
        confirmationError.message || 'Revisa los horarios e inténtalo de nuevo.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const confirmGroupCourseBooking = (course: Course) => {
    if (bookingCourseId || !canCreateOwnBookings) return;

    Alert.alert(
      'Reservar curso',
      `${course.title} · ${formatCourseSchedule(course)}\n\nEsta reserva cuenta para tu límite de la semana correspondiente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reservar',
          onPress: () => void bookGroupCourse(course),
        },
      ]
    );
  };

  const bookGroupCourse = async (course: Course) => {
    setBookingCourseId(course.id);
    try {
      const { data, error: bookingError } = await supabase.rpc('book_own_group_course', {
        target_course_id: course.id,
      });
      if (bookingError) throw bookingError;

      const result = data as GroupCourseBookingResult;
      Alert.alert(
        result.status === 'confirmed' ? 'Reserva confirmada' : 'Lista de espera',
        result.status === 'confirmed'
          ? `Tu plaza está confirmada. Tu contrato permite ${formatWeeklyLimit(result.weekly_limit)}.`
          : 'El curso está completo. Te hemos añadido a la lista de espera; esto todavía no consume tu límite semanal.'
      );
      await load(true);
    } catch (bookingError: any) {
      Alert.alert(
        'No se pudo reservar',
        bookingError.message || 'Comprueba tu límite semanal e inténtalo de nuevo.'
      );
    } finally {
      setBookingCourseId(null);
    }
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
      <AdminHeader eyebrow="CURSOS" title="Tus entrenamientos" />

      {loading ? (
        <View>
          <SkeletonBlock height={110} />
          <SkeletonBlock height={110} />
        </View>
      ) : error ? (
        <AdminCard>
          <Text style={styles.error}>{error}</Text>
        </AdminCard>
      ) : (
        <>
          <SectionHeading title="Entrenamiento individual" />
          {personalTrainingService ? (
            <AdminCard style={styles.individualServiceCard}>
              <View style={styles.individualServiceHeader}>
                <Feather color={adminColors.amber} name="user" size={18} />
                <View style={styles.individualServiceCopy}>
                  <Text style={styles.cardTitle}>{personalTrainingService.title}</Text>
                  <Text style={styles.secondary}>
                    {personalTrainingService.description ||
                      'Solicita horarios a tu entrenador y confirma la opción que prefieras.'}
                  </Text>
                  <Text style={styles.secondary}>
                    Duración estándar: {personalTrainingService.default_duration_minutes} minutos
                  </Text>
                </View>
              </View>
            </AdminCard>
          ) : null}
          {!userProfile.assigned_trainer_id ? (
            <AdminCard>
              <Text style={styles.cardTitle}>Todavía no tienes entrenador asignado</Text>
              <Text style={styles.secondary}>
                El administrador debe asignarte un entrenador antes de realizar una solicitud.
              </Text>
            </AdminCard>
          ) : (
            <View style={styles.requestList}>
              {openRequests.map((request) => {
                const requestTrainer = requestTrainers[request.id];
                const bookingChange = request.change_request_id
                  ? bookingChanges[request.change_request_id]
                  : undefined;
                const requestProposals = proposalsByRequest[request.id] ?? [];
                const requestSelection = selectedProposalIds[request.id] ?? [];

                if (request.status === 'requested') {
                  return (
                    <AdminCard key={request.id}>
                      <Text style={styles.changeBadge}>
                        {request.change_request_id
                          ? 'CAMBIO DE CITA'
                          : 'ENTRENAMIENTO INDIVIDUAL'}
                      </Text>
                      <Text style={styles.cardTitle}>
                        {request.change_request_id
                          ? 'Cambio de cita solicitado'
                          : requestTrainer?.transfer_pending
                            ? 'Cambio de entrenador en curso'
                            : 'Solicitud enviada'}
                      </Text>
                      <Text style={styles.secondary}>
                        {requestTrainer?.transfer_pending
                          ? `${requestTrainer.trainer_name} ha solicitado transferir la solicitud a ${requestTrainer.pending_trainer_name || 'otro entrenador'}. Estamos esperando su respuesta.`
                          : request.change_request_id
                            ? `${requestTrainer?.trainer_name || 'Tu entrenador'} está buscando una alternativa. Tu cita original sigue reservada mientras tanto.`
                            : `${requestTrainer?.trainer_name || 'Tu entrenador'} está preparando nuevos horarios.`}
                      </Text>
                      {bookingChange ? (
                        <OriginalAppointment change={bookingChange} />
                      ) : null}
                    </AdminCard>
                  );
                }

                return (
                  <View key={request.id} style={styles.proposalSection}>
                    <AdminCard>
                      <Text style={styles.changeBadge}>
                        {request.change_request_id
                          ? 'CAMBIO DE CITA'
                          : 'ENTRENAMIENTO INDIVIDUAL'}
                      </Text>
                      <Text style={styles.cardTitle}>
                        {request.change_request_id
                          ? 'Selecciona un horario alternativo'
                          : 'Selecciona uno o varios horarios'}
                      </Text>
                      <Text style={styles.secondary}>
                        {request.change_request_id
                          ? 'Tu cita original seguirá reservada hasta que confirmes el nuevo horario.'
                          : 'La reserva solo será vinculante cuando confirmes toda la selección.'}
                      </Text>
                      {requestTrainer ? (
                        <Text style={styles.secondary}>
                          Entrenador: {requestTrainer.trainer_name}
                        </Text>
                      ) : null}
                      {bookingChange ? (
                        <OriginalAppointment change={bookingChange} />
                      ) : null}
                    </AdminCard>

                    {requestProposals.map((proposal) => {
                      const selected = requestSelection.includes(proposal.id);
                      return (
                        <Pressable
                          key={proposal.id}
                          onPress={() => toggleProposal(request, proposal.id)}
                          style={({ pressed }) => [
                            styles.proposalCard,
                            selected && styles.proposalCardSelected,
                            pressed && styles.pressed,
                          ]}>
                          <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                            {selected ? (
                              <Feather color={adminColors.amberOn} name="check" size={14} />
                            ) : null}
                          </View>
                          <View style={styles.proposalCopy}>
                            <Text style={styles.proposalDate}>
                              {formatDate(proposal.start_at)}
                            </Text>
                            <Text style={styles.secondary}>
                              {formatTimeRange(proposal.start_at, proposal.end_at)}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}

                    <PrimaryButton
                      disabled={requestSelection.length === 0 || submitting}
                      onPress={() => confirmSelected(request)}>
                      {submitting
                        ? 'Reservando…'
                        : request.change_request_id
                          ? 'Confirmar horario alternativo'
                          : `Confirmar ${requestSelection.length} entrenamiento(s)`}
                    </PrimaryButton>
                  </View>
                );
              })}

              {!ordinaryOpenRequest ? (
                <PrimaryButton
                  disabled={submitting}
                  onPress={() => void requestPersonalTraining()}>
                  {submitting ? 'Enviando…' : 'Solicitar entrenamiento individual'}
                </PrimaryButton>
              ) : null}
            </View>
          )}

          <SectionHeading title="Próximos entrenamientos individuales" />
          {sessions.length === 0 ? (
            <EmptyState
              message="Los horarios que reserves aparecerán aquí."
              title="Sin entrenamientos reservados"
            />
          ) : (
            <View style={styles.list}>
              {sessions.map((session) => (
                <AdminCard key={session.id}>
                  <Text style={styles.cardTitle}>{formatDate(session.start_at)}</Text>
                  <Text style={styles.secondary}>
                    {formatTimeRange(session.start_at, session.end_at)}
                  </Text>
                </AdminCard>
              ))}
            </View>
          )}

          <SectionHeading title="Cursos de grupo" />
          {!trainingContract ? (
            <AdminCard>
              <Text style={styles.cardTitle}>Contrato pendiente</Text>
              <Text style={styles.secondary}>
                Tu entrenador debe configurar tu modelo de entrenamiento antes de que puedas
                reservar cursos de grupo.
              </Text>
            </AdminCard>
          ) : trainingContract.training_model === 'individual' ? (
            <AdminCard>
              <Text style={styles.cardTitle}>Modelo individual</Text>
              <Text style={styles.secondary}>
                Tu contrato actual no incluye reservas de cursos de grupo.
              </Text>
            </AdminCard>
          ) : courses.length === 0 ? (
            <EmptyState
              message="Los cursos disponibles para ti aparecerán aquí."
              title="No hay cursos disponibles"
            />
          ) : (
            <View style={styles.groupCoursesSection}>
              <AdminCard style={styles.contractCard}>
                <Feather color={adminColors.amber} name="calendar" size={18} />
                <View style={styles.contractCopy}>
                  <Text style={styles.cardTitle}>Tu plan de grupo</Text>
                  <Text style={styles.secondary}>
                    Hasta {formatWeeklyLimit(trainingContract.group_days_per_week ?? 0)}, de lunes
                    a domingo.
                  </Text>
                </View>
              </AdminCard>

              <View style={styles.list}>
                {courses.map((course) => {
                  const enrollment = courseEnrollments.find(
                    (candidate) => candidate.course_id === course.id
                  );
                  return (
                    <AdminCard key={course.id}>
                      <View style={styles.courseHeader}>
                        <View style={styles.courseCopy}>
                          <Text style={styles.cardTitle}>{course.title}</Text>
                          <Text style={styles.secondary}>{formatCourseSchedule(course)}</Text>
                        </View>
                        {enrollment ? (
                          <View
                            style={[
                              styles.enrollmentBadge,
                              enrollment.status === 'waitlisted' && styles.waitlistBadge,
                            ]}>
                            <Text
                              style={[
                                styles.enrollmentBadgeText,
                                enrollment.status === 'waitlisted' && styles.waitlistBadgeText,
                              ]}>
                              {enrollment.status === 'confirmed'
                                ? 'Inscrito'
                                : 'Lista de espera'}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {!enrollment ? (
                        <PrimaryButton
                          disabled={bookingCourseId !== null || !canCreateOwnBookings}
                          onPress={() => confirmGroupCourseBooking(course)}>
                          {bookingCourseId === course.id ? 'Reservando…' : 'Reservar plaza'}
                        </PrimaryButton>
                      ) : null}
                    </AdminCard>
                  );
                })}
              </View>
            </View>
          )}
        </>
      )}
    </AdminScrollScreen>
  );
}

function OriginalAppointment({ change }: { change: BookingChangeRequest }) {
  return (
    <View style={styles.originalAppointment}>
      <Text style={styles.originalAppointmentLabel}>CITA ORIGINAL</Text>
      <Text style={styles.originalAppointmentValue}>
        {formatDate(change.original_start_at)} ·{' '}
        {formatTimeRange(change.original_start_at, change.original_end_at)}
      </Text>
    </View>
  );
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
  return `${formatter.format(new Date(startValue))}–${formatter.format(new Date(endValue))}`;
}

function formatCourseSchedule(course: Course) {
  if (course.repetition === 'weekly') {
    return `${course.weekdays?.join(' ') || '—'} · ${course.start_time?.slice(0, 5) || '—'}–${course.end_time?.slice(0, 5) || '—'}`;
  }
  return course.start_date
    ? `${formatDate(course.start_date)} · ${formatTimeRange(course.start_date, course.end_date ?? course.start_date)}`
    : 'Horario pendiente';
}

function formatWeeklyLimit(limit: number) {
  return `${limit} ${limit === 1 ? 'entrenamiento de grupo' : 'entrenamientos de grupo'} por semana`;
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
  groupCoursesSection: {
    gap: 12,
  },
  contractCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  contractCopy: {
    flex: 1,
  },
  courseHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  courseCopy: {
    flex: 1,
  },
  enrollmentBadge: {
    backgroundColor: adminColors.availableTint,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  enrollmentBadgeText: {
    color: adminColors.available,
    fontSize: 10,
    fontWeight: '600',
  },
  waitlistBadge: {
    backgroundColor: adminColors.amberTint,
  },
  waitlistBadgeText: {
    color: adminColors.amber,
  },
  individualServiceCard: {
    marginBottom: 12,
  },
  individualServiceHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 11,
  },
  individualServiceCopy: {
    flex: 1,
    gap: 5,
  },
  requestList: {
    gap: 12,
  },
  proposalSection: {
    gap: 8,
  },
  proposalCard: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.border,
    borderRadius: 10,
    borderWidth: adminHairline,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  proposalCardSelected: {
    borderColor: adminColors.amber,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: adminColors.borderInput,
    borderRadius: 6,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checkboxSelected: {
    backgroundColor: adminColors.amber,
    borderColor: adminColors.amber,
  },
  proposalCopy: {
    flex: 1,
  },
  proposalDate: {
    ...adminType.rowTitle,
    textTransform: 'capitalize',
  },
  cardTitle: {
    ...adminType.rowTitle,
  },
  changeBadge: {
    ...adminType.eyebrow,
    marginBottom: 6,
  },
  originalAppointment: {
    backgroundColor: adminColors.amberTint,
    borderColor: adminColors.amber,
    borderRadius: 8,
    borderWidth: adminHairline,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  originalAppointmentLabel: {
    ...adminType.eyebrow,
    fontSize: 9,
  },
  originalAppointmentValue: {
    color: adminColors.textPrimary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  secondary: {
    ...adminType.secondary,
    lineHeight: 17,
    marginTop: 4,
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
