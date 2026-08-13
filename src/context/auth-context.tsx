import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import {
  supabase,
  UserProfile,
  type PermissionScope,
  type UserPermission,
  type UserRoleName,
} from '@/lib/supabase';

type AuthContextType = {
  session: Session | null;
  loading: boolean;
  authenticatedUserProfile: UserProfile | null;
  userProfile: UserProfile | null;
  impersonatedProfile: UserProfile | null;
  isImpersonating: boolean;
  canImpersonate: boolean;
  userRoles: UserRoleName[];
  userPermissions: UserPermission[];
  hasRole: (role: UserRoleName) => boolean;
  hasPermission: (resource: string, action: string, scope?: PermissionScope) => boolean;
  loadImpersonatableProfiles: () => Promise<UserProfile[]>;
  startImpersonation: (profile: UserProfile) => Promise<void>;
  stopImpersonation: () => void;
  signUp: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phoneNumber: string,
    companyId: string
  ) => Promise<{ requiresEmailConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
  changeInitialPassword: (password: string) => Promise<void>;
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
  const [authenticatedUserRoles, setAuthenticatedUserRoles] = useState<UserRoleName[]>([]);
  const [authenticatedUserPermissions, setAuthenticatedUserPermissions] = useState<
    UserPermission[]
  >([]);
  const [impersonatedUserPermissions, setImpersonatedUserPermissions] = useState<
    UserPermission[]
  >([]);

  const userProfile = impersonatedProfile ?? authenticatedUserProfile;
  const userRoles = impersonatedProfile
    ? [impersonatedProfile.role]
    : authenticatedUserRoles.length > 0
      ? authenticatedUserRoles
      : authenticatedUserProfile
        ? [authenticatedUserProfile.role]
        : [];
  const hasRole = (role: UserRoleName) => userRoles.includes(role);
  const userPermissions = impersonatedProfile
    ? impersonatedUserPermissions
    : authenticatedUserPermissions;
  const hasPermission = (resource: string, action: string, scope?: PermissionScope) =>
    userPermissions.some(
      (permission) =>
        permission.resource === resource &&
        permission.action === action &&
        (scope === undefined || permission.scope === scope)
    );
  const isImpersonating = impersonatedProfile !== null;
  const canImpersonate =
    __DEV__ &&
    authenticatedUserProfile?.status === 'approved' &&
    authenticatedUserPermissions.some(
      (permission) =>
        permission.resource === 'roles' &&
        permission.action === 'read' &&
        permission.scope === 'all'
    );

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
        setAuthenticatedUserRoles([]);
        setAuthenticatedUserPermissions([]);
        setImpersonatedProfile(null);
        setImpersonatedUserPermissions([]);
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
        setAuthenticatedUserRoles([]);
        setAuthenticatedUserPermissions([]);
        setImpersonatedProfile(null);
        setImpersonatedUserPermissions([]);
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

      if (!data) {
        setAuthenticatedUserRoles([]);
        setAuthenticatedUserPermissions([]);
        return;
      }

      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role:roles!inner(code)')
        .eq('user_id', data.user_id)
        .eq('company_id', data.company_id);

      if (roleError) {
        console.warn('Falling back to primary user role:', roleError.message);
        setAuthenticatedUserRoles([data.role]);
      } else {
        setAuthenticatedUserRoles(
          Array.from(
            new Set([
              data.role,
              ...(roleData ?? [])
                .map((entry) => getSystemRoleCode(entry.role))
                .filter((role): role is UserRoleName => role !== null),
            ])
          )
        );
      }

      setAuthenticatedUserPermissions(await fetchUserPermissions(data.user_id));
    } catch (err) {
      console.error('Error fetching user profile:', err);
      setAuthenticatedUserProfile(null);
      setAuthenticatedUserRoles([]);
      setAuthenticatedUserPermissions([]);
      setImpersonatedProfile(null);
      setImpersonatedUserPermissions([]);
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

  const startImpersonation = async (profile: UserProfile) => {
    if (!canImpersonate || !authenticatedUserProfile) {
      throw new Error('Die Benutzeransicht ist nicht verfügbar.');
    }

    if (profile.company_id !== authenticatedUserProfile.company_id) {
      throw new Error('Es können nur Benutzer derselben Firma angezeigt werden.');
    }

    if (profile.user_id === authenticatedUserProfile.user_id) {
      setImpersonatedProfile(null);
      setImpersonatedUserPermissions([]);
      return;
    }

    const permissions = await fetchUserPermissions(profile.user_id);
    setImpersonatedUserPermissions(permissions);
    setImpersonatedProfile(profile);
  };

  const stopImpersonation = () => {
    setImpersonatedProfile(null);
    setImpersonatedUserPermissions([]);
  };

  const signUp = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phoneNumber: string,
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
            phone_number: phoneNumber.trim(),
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
        email: email.trim().toLowerCase(),
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
      setAuthenticatedUserRoles([]);
      setAuthenticatedUserPermissions([]);
      setImpersonatedProfile(null);
      setImpersonatedUserPermissions([]);

      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch (err) {
      console.error('Sign out error:', err);
      throw err;
    }
  };

  const refreshUserProfile = async () => {
    if (session?.user.id) {
      await fetchUserProfile(session.user.id);
    }
  };

  const changeInitialPassword = async (password: string) => {
    try {
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;

      const { error: profileError } = await supabase.rpc(
        'complete_initial_password_change'
      );
      if (profileError) throw profileError;

      if (session?.user.id) {
        await fetchUserProfile(session.user.id);
      }
    } catch (err) {
      console.error('Initial password change error:', err);
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
        userRoles,
        userPermissions,
        hasRole,
        hasPermission,
        loadImpersonatableProfiles,
        startImpersonation,
        stopImpersonation,
        signUp,
        signIn,
        signOut,
        refreshUserProfile,
        changeInitialPassword,
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

function getSystemRoleCode(value: unknown): UserRoleName | null {
  const role = Array.isArray(value) ? value[0] : value;
  if (!role || typeof role !== 'object' || !('code' in role)) return null;

  const code = role.code;
  return code === 'owner' || code === 'trainer' || code === 'customer' ? code : null;
}

async function fetchUserPermissions(userId: string): Promise<UserPermission[]> {
  const { data, error } = await supabase.rpc('get_user_permissions', {
    target_user_id: userId,
  });

  if (error) throw error;

  return (data ?? []).filter(isUserPermission);
}

function isUserPermission(value: unknown): value is UserPermission {
  if (!value || typeof value !== 'object') return false;

  const permission = value as Record<string, unknown>;
  return (
    typeof permission.resource === 'string' &&
    typeof permission.action === 'string' &&
    (permission.scope === 'all' ||
      permission.scope === 'assigned' ||
      permission.scope === 'own' ||
      permission.scope === 'eligible')
  );
}
