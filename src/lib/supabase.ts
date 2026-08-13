import 'react-native-url-polyfill/auto';

import { createClient, processLock } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';

// Supabase Credentials von Environment Variables
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase credentials! Please add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env.local'
  );
}

const isWeb = typeof window !== 'undefined' && Platform.OS === 'web';
const storage = isWeb ? undefined : AsyncStorage;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isWeb,
    lock: processLock,
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

export type UserRoleName = 'owner' | 'trainer' | 'customer';

export type PermissionScope = 'all' | 'assigned' | 'own' | 'eligible';

export type UserPermission = {
  resource: string;
  action: string;
  scope: PermissionScope;
};

export type UserRole = {
  user_id: string;
  company_id: string;
  role_id: string;
  role: UserRoleName;
  role_name: string;
  role_description: string | null;
  is_system: boolean;
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
};

export type UserProfile = {
  id: string;
  user_id: string;
  company_id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  assigned_trainer_id: string | null;
  role: UserRoleName;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  avatar_path: string | null;
  avatar_url?: string | null;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
};

export type Course = {
  id: string;
  company_id: string;
  trainer_id: string;
  title: string;
  description: string | null;
  category: string;
  level: 'Bajo' | 'Medio' | 'Alto' | null;
  format: 'group' | 'individual';
  repetition: 'once' | 'weekly';
  weekdays: string[];
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  max_participants: number | null;
  price: string;
  room: string;
  waitlist_enabled: boolean;
  approval_required: boolean;
  published: boolean;
  created_at: string;
  updated_at: string;
};

export type CourseEnrollment = {
  id: string;
  course_id: string;
  user_id: string;
  status: 'confirmed' | 'waitlisted' | 'cancelled';
  source: 'owner' | 'trainer' | 'customer' | 'import';
  assigned_by: string | null;
  enrolled_at: string;
  removed_at: string | null;
  updated_at: string;
};

export type CustomerTrainingContract = {
  customer_id: string;
  company_id: string;
  training_model: 'group' | 'individual';
  group_days_per_week: number | null;
  set_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerConfiguration = {
  user_id: string;
  company_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_number: string | null;
  status: 'approved';
  assigned_trainer_id: string | null;
  assigned_trainer_name: string | null;
  training_model: 'group' | 'individual' | null;
  group_days_per_week: number | null;
  et_level: 'Bajo' | 'Medio' | 'Alto' | null;
  created_at: string;
};

export type GroupCourseBookingResult = {
  status: 'confirmed' | 'waitlisted';
  weekly_limit: number;
  already_enrolled: boolean;
};

export type CourseClient = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  enrollment_status: CourseEnrollment['status'] | null;
  enrolled_at: string | null;
};

export type CustomerCategoryLevel = {
  customer_id: string;
  company_id: string;
  category: string;
  level: 'Bajo' | 'Medio' | 'Alto';
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AddClientsToCourseResult = {
  confirmed: number;
  waitlisted: number;
  skipped: number;
};

export type PersonalTrainingRequest = {
  id: string;
  company_id: string;
  personal_training_service_id: string;
  customer_id: string;
  trainer_id: string;
  status: 'requested' | 'proposed' | 'confirmed' | 'cancelled';
  requested_at: string;
  proposed_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  change_request_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonalTrainingService = {
  id: string;
  company_id: string;
  code: string;
  title: string;
  description: string | null;
  default_duration_minutes: number;
  price: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ManageablePersonalTrainingSession = {
  session_id: string;
  service_id: string;
  service_title: string;
  request_id: string;
  trainer_id: string;
  trainer_name: string | null;
  customer_id: string;
  customer_name: string | null;
  start_at: string;
  end_at: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  room: string | null;
  location: string | null;
};

export type PersonalTrainingProposal = {
  id: string;
  request_id: string;
  start_at: string;
  end_at: string;
  location: string | null;
  room: string | null;
  status: 'proposed' | 'accepted' | 'declined' | 'expired';
  created_at: string;
  updated_at: string;
};

export type PersonalTrainingRequestTransfer = {
  id: string;
  request_id: string;
  company_id: string;
  from_trainer_id: string;
  to_trainer_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  note: string | null;
  requested_at: string;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonalTrainingTransferCandidate = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
};

export type IncomingPersonalTrainingTransfer = {
  transfer_id: string;
  request_id: string;
  company_id: string;
  from_trainer_id: string;
  from_trainer_name: string;
  customer_id: string;
  customer_name: string;
  note: string | null;
  requested_at: string;
};

export type PersonalTrainingRequestTrainer = {
  trainer_id: string;
  trainer_name: string;
  transfer_pending: boolean;
  pending_trainer_name: string | null;
};

export type CourseSession = {
  id: string;
  company_id: string;
  course_id: string | null;
  personal_training_request_id: string | null;
  personal_training_service_id: string | null;
  trainer_id: string;
  start_at: string;
  end_at: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  capacity: number;
  location: string | null;
  room: string | null;
  created_at: string;
  updated_at: string;
};

export type ManageableCourseOccurrence = {
  session_id: string;
  course_id: string;
  trainer_id: string;
  start_at: string;
  end_at: string;
  capacity: number;
  confirmed_count: number;
  waitlisted_count: number;
};

export type CourseSessionClient = {
  booking_id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  booking_status: 'confirmed' | 'waitlisted';
  confirmed_at: string | null;
};

export type Booking = {
  id: string;
  session_id: string;
  user_id: string;
  status: 'confirmed' | 'waitlisted' | 'cancelled';
  booked_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MyCalendarEntry = {
  booking_id: string;
  session_id: string;
  event_kind: 'group' | 'personal';
  course_id: string | null;
  personal_training_request_id: string | null;
  trainer_id: string;
  start_at: string;
  end_at: string;
  title: string;
  category: string | null;
  level: string | null;
  room: string | null;
  location: string | null;
};

export type BookingChangeRequest = {
  id: string;
  company_id: string;
  customer_id: string;
  change_kind: 'group' | 'personal';
  original_booking_id: string;
  original_session_id: string;
  original_course_id: string | null;
  original_trainer_id: string;
  original_start_at: string;
  original_end_at: string;
  original_category: string | null;
  original_level: string | null;
  reason: string;
  status: 'pending' | 'lost' | 'recovered' | 'rejected';
  recovery_deadline: string;
  recovered_booking_id: string | null;
  recovered_session_id: string | null;
  recovered_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  waitlist_status: 'none' | 'waiting' | 'notified';
  notified_session_id: string | null;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingChangeAudit = {
  change_id: string;
  customer_first_name: string | null;
  customer_last_name: string | null;
  original_trainer_id: string;
  original_trainer_name: string;
  responsible_trainer_id: string;
  responsible_trainer_name: string;
  rejected_by: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
};

export type BookingChangeAlternative = {
  session_id: string;
  course_id: string;
  trainer_id: string;
  trainer_name: string;
  start_at: string;
  end_at: string;
  title: string;
  category: string | null;
  level: string | null;
  room: string | null;
  available_places: number;
};

export type AppNotification = {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};
