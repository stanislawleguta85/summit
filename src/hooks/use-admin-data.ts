import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/context/auth-context';
import {
  supabase,
  type Booking,
  type Course,
  type CourseEnrollment,
  type CourseSession,
  type CustomerCategoryLevel,
  type ManageableCourseOccurrence,
  type ManageablePersonalTrainingSession,
  type PersonalTrainingService,
  type UserRole,
  type UserProfile,
} from '@/lib/supabase';

export type EnrollmentSummary = {
  course_id: string;
  user_id: string;
  status: CourseEnrollment['status'];
};

export function useAdminData() {
  const { hasRole, userProfile } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentSummary[]>([]);
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [courseOccurrences, setCourseOccurrences] = useState<ManageableCourseOccurrence[]>([]);
  const [personalTrainingServices, setPersonalTrainingServices] = useState<
    PersonalTrainingService[]
  >([]);
  const [personalTrainingSessions, setPersonalTrainingSessions] = useState<
    ManageablePersonalTrainingSession[]
  >([]);
  const [categoryLevels, setCategoryLevels] = useState<CustomerCategoryLevel[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (asRefresh = false) => {
      const companyId = userProfile?.company_id;
      if (!companyId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (asRefresh) {
        setRefreshing(true);
      }
      setError(null);

      try {
        let courseQuery = supabase
          .from('courses')
          .select('*')
          .eq('company_id', companyId)
          .order('start_date', { ascending: true });

        if (hasRole('trainer') && !hasRole('owner')) {
          courseQuery = courseQuery.eq('trainer_id', userProfile.user_id);
        }

        let sessionQuery = supabase
          .from('course_sessions')
          .select('*')
          .eq('company_id', companyId)
          .eq('status', 'scheduled')
          .not('personal_training_request_id', 'is', null)
          .order('start_at', { ascending: true });

        if (hasRole('trainer') && !hasRole('owner')) {
          sessionQuery = sessionQuery.eq('trainer_id', userProfile.user_id);
        }

        const [
          courseResult,
          profileResult,
          enrollmentResult,
          sessionResult,
          bookingResult,
          courseOccurrenceResult,
          personalTrainingServiceResult,
          personalTrainingSessionResult,
          categoryLevelResult,
          roleResult,
        ] = await Promise.all([
          courseQuery,
          supabase
            .from('user_profiles')
            .select('*')
            .eq('company_id', companyId)
            .order('last_name', { ascending: true }),
          supabase.from('course_enrollments').select('course_id, user_id, status'),
          sessionQuery,
          supabase
            .from('bookings')
            .select('*')
            .eq('status', 'confirmed'),
          supabase.rpc('get_manageable_group_course_occurrences'),
          supabase
            .from('personal_training_services')
            .select('*')
            .eq('company_id', companyId)
            .order('title', { ascending: true }),
          supabase.rpc('get_manageable_personal_training_sessions'),
          supabase
            .from('customer_category_levels')
            .select('*')
            .eq('company_id', companyId),
          supabase
            .from('user_roles')
            .select(
              'user_id, company_id, role_id, assigned_by, created_at, updated_at, role:roles!inner(code, name, description, is_system)'
            )
            .eq('company_id', companyId),
        ]);

        if (courseResult.error) throw courseResult.error;
        if (profileResult.error) throw profileResult.error;
        if (enrollmentResult.error) throw enrollmentResult.error;
        if (sessionResult.error) throw sessionResult.error;
        if (bookingResult.error) throw bookingResult.error;
        if (courseOccurrenceResult.error) throw courseOccurrenceResult.error;
        if (personalTrainingServiceResult.error) throw personalTrainingServiceResult.error;
        if (personalTrainingSessionResult.error) throw personalTrainingSessionResult.error;
        if (categoryLevelResult.error) throw categoryLevelResult.error;
        if (roleResult.error) throw roleResult.error;

        setCourses((courseResult.data ?? []) as Course[]);
        setProfiles(
          await attachSignedAvatarUrls((profileResult.data ?? []) as UserProfile[])
        );
        setEnrollments((enrollmentResult.data ?? []) as EnrollmentSummary[]);
        setSessions((sessionResult.data ?? []) as CourseSession[]);
        setBookings((bookingResult.data ?? []) as Booking[]);
        setCourseOccurrences(
          (courseOccurrenceResult.data ?? []) as ManageableCourseOccurrence[]
        );
        setPersonalTrainingServices(
          (personalTrainingServiceResult.data ?? []) as PersonalTrainingService[]
        );
        setPersonalTrainingSessions(
          (personalTrainingSessionResult.data ?? []) as ManageablePersonalTrainingSession[]
        );
        setCategoryLevels((categoryLevelResult.data ?? []) as CustomerCategoryLevel[]);
        setRoleAssignments(
          (roleResult.data ?? [])
            .map(normalizeUserRole)
            .filter((assignment): assignment is UserRole => assignment !== null)
        );
      } catch (loadError: any) {
        console.error('Error loading admin data:', loadError);
        setError(loadError.message || 'Los datos no se pudieron cargar.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [hasRole, userProfile?.company_id, userProfile?.user_id]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return {
    courses,
    profiles,
    enrollments,
    sessions,
    bookings,
    courseOccurrences,
    personalTrainingServices,
    personalTrainingSessions,
    categoryLevels,
    roleAssignments,
    loading,
    refreshing,
    error,
    reload: () => load(true),
  };
}

async function attachSignedAvatarUrls(profiles: UserProfile[]) {
  const paths = Array.from(
    new Set(
      profiles
        .map((profile) => profile.avatar_path)
        .filter((path): path is string => Boolean(path))
    )
  );
  if (paths.length === 0) return profiles;

  const { data, error } = await supabase.storage
    .from('profile-photos')
    .createSignedUrls(paths, 60 * 60, { cacheNonce: String(Date.now()) });
  if (error) {
    console.warn('Profile photos could not be loaded:', error.message);
    return profiles;
  }

  const urlByPath = new Map(
    (data ?? [])
      .filter(
        (entry): entry is typeof entry & { path: string; signedUrl: string } =>
          Boolean(entry.path && entry.signedUrl)
      )
      .map((entry) => [entry.path, entry.signedUrl])
  );

  return profiles.map((profile) => ({
    ...profile,
    avatar_url: profile.avatar_path ? (urlByPath.get(profile.avatar_path) ?? null) : null,
  }));
}

function normalizeUserRole(row: any): UserRole | null {
  const role = Array.isArray(row.role) ? row.role[0] : row.role;
  if (
    !role ||
    (role.code !== 'owner' && role.code !== 'trainer' && role.code !== 'customer')
  ) {
    return null;
  }

  return {
    user_id: row.user_id,
    company_id: row.company_id,
    role_id: row.role_id,
    role: role.code,
    role_name: role.name,
    role_description: role.description,
    is_system: role.is_system,
    assigned_by: row.assigned_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
