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

export type UserProfile = {
  id: string;
  user_id: string;
  company_id: string;
  first_name: string | null;
  last_name: string | null;
  role: 'owner' | 'trainer' | 'customer';
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Course = {
  id: string;
  company_id: string;
  trainer_id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  max_participants: number | null;
  created_at: string;
  updated_at: string;
};
