import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase, UserProfile } from '@/lib/supabase';

type AuthContextType = {
  session: Session | null;
  loading: boolean;
  authenticatedUserProfile: UserProfile | null;
  userProfile: UserProfile | null;
  impersonatedProfile: UserProfile | null;
  isImpersonating: boolean;
  canImpersonate: boolean;
  loadImpersonatableProfiles: () => Promise<UserProfile[]>;
  startImpersonation: (profile: UserProfile) => void;
  stopImpersonation: () => void;
  signUp: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    companyId: string
  ) => Promise<{ requiresEmailConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  approveUser: (userId: string) => Promise<void>;
  rejectUser: (userId: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticatedUserProfile, setAuthenticatedUserProfile] = useState<UserProfile | null>(
    null
  );
  const [impersonatedProfile, setImpersonatedProfile] = useState<UserProfile | null>(null);

  const userProfile = impersonatedProfile ?? authenticatedUserProfile;
  const isImpersonating = impersonatedProfile !== null;
  const canImpersonate =
    __DEV__ &&
    authenticatedUserProfile?.role === 'owner' &&
    authenticatedUserProfile.status === 'approved';

  useEffect(() => {
    // Initiale Session laden
    const loadSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        setSession(data.session);

        if (data.session?.user) {
          await fetchUserProfile(data.session.user.id);
        }
      } catch (error) {
        console.error('Error loading session:', error);
        setSession(null);
        setAuthenticatedUserProfile(null);
        setImpersonatedProfile(null);
      } finally {
        setLoading(false);
      }
    };

    loadSession();

    // Auth State Listener
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);

      if (nextSession?.user) {
        setTimeout(() => {
          void fetchUserProfile(nextSession.user.id);
        }, 0);
      } else {
        setAuthenticatedUserProfile(null);
        setImpersonatedProfile(null);
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      setAuthenticatedUserProfile(data);
    } catch (err) {
      console.error('Error fetching user profile:', err);
      setAuthenticatedUserProfile(null);
      setImpersonatedProfile(null);
    }
  };

  const loadImpersonatableProfiles = async () => {
    if (!canImpersonate || !authenticatedUserProfile) {
      throw new Error('Die Benutzeransicht ist nur für freigegebene Owner im Entwicklungsmodus verfügbar.');
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('company_id', authenticatedUserProfile.company_id)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true });

    if (error) throw error;
    return (data ?? []) as UserProfile[];
  };

  const startImpersonation = (profile: UserProfile) => {
    if (!canImpersonate || !authenticatedUserProfile) {
      throw new Error('Die Benutzeransicht ist nicht verfügbar.');
    }

    if (profile.company_id !== authenticatedUserProfile.company_id) {
      throw new Error('Es können nur Benutzer derselben Firma angezeigt werden.');
    }

    if (profile.user_id === authenticatedUserProfile.user_id) {
      setImpersonatedProfile(null);
      return;
    }

    setImpersonatedProfile(profile);
  };

  const stopImpersonation = () => {
    setImpersonatedProfile(null);
  };

  const signUp = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    companyId: string
  ) => {
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            company_id: companyId,
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Sign up failed');

      return {
        requiresEmailConfirmation: authData.session === null,
      };
    } catch (err) {
      console.error('Sign up error:', err);
      throw err;
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
    } catch (err) {
      console.error('Sign in error:', err);
      throw err;
    }
  };

  const signOut = async () => {
    try {
      setSession(null);
      setAuthenticatedUserProfile(null);
      setImpersonatedProfile(null);

      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch (err) {
      console.error('Sign out error:', err);
      throw err;
    }
  };

  const approveUser = async (userId: string) => {
    try {
      const { error } = await supabase.rpc('review_user', {
        target_user_id: userId,
        new_status: 'approved',
      });

      if (error) throw error;
    } catch (err) {
      console.error('Approve user error:', err);
      throw err;
    }
  };

  const rejectUser = async (userId: string) => {
    try {
      const { error } = await supabase.rpc('review_user', {
        target_user_id: userId,
        new_status: 'rejected',
      });

      if (error) throw error;
    } catch (err) {
      console.error('Reject user error:', err);
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        authenticatedUserProfile,
        userProfile,
        impersonatedProfile,
        isImpersonating,
        canImpersonate,
        loadImpersonatableProfiles,
        startImpersonation,
        stopImpersonation,
        signUp,
        signIn,
        signOut,
        approveUser,
        rejectUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
