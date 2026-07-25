import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase, UserProfile } from '../lib/supabase';

type AuthContextType = {
  session: Session | null;
  loading: boolean;
  userProfile: UserProfile | null;
  signUp: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    companyId: string
  ) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  approveUser: (userId: string) => Promise<void>;
  rejectUser: (userId: string) => Promise<void>;
  isDevAdmin: boolean;
  setDevAdmin: (v: boolean) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isDevAdmin, setIsDevAdmin] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dev_is_admin') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // Initiale Session laden
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);

      if (data.session?.user) {
        await fetchUserProfile(data.session.user.id);
      }

      setLoading(false);
    };

    loadSession();

    // Auth State Listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);

        if (session?.user) {
          await fetchUserProfile(session.user.id);
        } else {
          setUserProfile(null);
        }
      }
    );

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
      if (!data) {
        console.warn('No user profile found for user:', userId);
        setUserProfile(null);
        return;
      }

      setUserProfile(data);
    } catch (err) {
      console.error('Error fetching user profile:', err);
      setUserProfile(null);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    companyId: string
  ) => {
    try {
      // 1. Benutzer in Auth erstellen
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Sign up failed');

      // 2. User Profile mit "pending" Status und gewählter Filiale erstellen
      const { error: profileError } = await supabase.from('user_profiles').insert({
        user_id: authData.user.id,
        company_id: companyId,
        first_name: firstName,
        last_name: lastName,
        role: 'customer',
        status: 'pending',
      });

      if (profileError) throw profileError;
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
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err) {
      console.error('Sign out error:', err);
      throw err;
    }
  };

  const setDevAdmin = (v: boolean) => {
    try {
      localStorage.setItem('dev_is_admin', v ? 'true' : 'false');
    } catch {}
    setIsDevAdmin(v);
  };

  const approveUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          status: 'approved',
          approved_by: session?.user.id,
          approved_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) throw error;
    } catch (err) {
      console.error('Approve user error:', err);
      throw err;
    }
  };

  const rejectUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          status: 'rejected',
          approved_by: session?.user.id,
          approved_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

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
        userProfile,
        signUp,
        signIn,
        signOut,
        approveUser,
        rejectUser,
        isDevAdmin,
        setDevAdmin,
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
