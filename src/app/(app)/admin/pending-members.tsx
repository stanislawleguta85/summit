import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AdminCard,
  AdminScrollScreen,
  EmptyState,
  InitialAvatar,
  SkeletonBlock,
} from '@/components/admin/admin-ui';
import {
  adminColors,
  adminHairline,
  adminRadius,
  adminType,
} from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import { useAdminData } from '@/hooks/use-admin-data';
import type { UserProfile } from '@/lib/supabase';

export default function PendingMembersScreen() {
  const router = useRouter();
  const { approveUser, hasPermission, rejectUser } = useAuth();
  const canReviewMembers = hasPermission('members', 'approve', 'all');
  const { profiles, loading, refreshing, error, reload } = useAdminData();
  const [reviewingUserId, setReviewingUserId] = useState<string | null>(null);
  const pendingUsers = profiles.filter((profile) => profile.status === 'pending');

  const reviewUser = async (profile: UserProfile, decision: 'approved' | 'rejected') => {
    if (!canReviewMembers) return;

    setReviewingUserId(profile.user_id);
    try {
      if (decision === 'approved') {
        await approveUser(profile.user_id);
      } else {
        await rejectUser(profile.user_id);
      }
      await reload();
      if (pendingUsers.length === 1) {
        router.replace('/admin');
      }
    } catch (reviewError: any) {
      Alert.alert(
        'Error',
        reviewError.message || 'La decisión no se pudo guardar.'
      );
    } finally {
      setReviewingUserId(null);
    }
  };

  const confirmDecision = (profile: UserProfile, decision: 'approved' | 'rejected') => {
    const fullName =
      [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'esta persona';
    const approve = decision === 'approved';

    Alert.alert(
      approve ? 'Aprobar membresía' : 'Rechazar registro',
      `¿Quieres ${approve ? 'aprobar' : 'rechazar'} a ${fullName}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: approve ? 'Aprobar' : 'Rechazar',
          style: approve ? 'default' : 'destructive',
          onPress: () => void reviewUser(profile, decision),
        },
      ]
    );
  };

  return (
    <AdminScrollScreen
      includeTopInset={false}
      refreshControl={
        <RefreshControl
          onRefresh={reload}
          refreshing={refreshing}
          tintColor={adminColors.amber}
        />
      }>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>NUEVAS MEMBRESÍAS</Text>
        <Text style={styles.title}>{pendingUsers.length} pendientes</Text>
        <Text style={styles.subtitle}>
          Revisa los registros nuevos y concede acceso al estudio.
        </Text>
      </View>

      {loading ? (
        <>
          <SkeletonBlock height={126} />
          <SkeletonBlock height={126} />
        </>
      ) : error ? (
        <AdminCard>
          <Text style={styles.error}>{error}</Text>
        </AdminCard>
      ) : pendingUsers.length === 0 ? (
        <EmptyState
          message="Ahora mismo no hay nadie esperando aprobación."
          title="Todo al día"
        />
      ) : (
        <View style={styles.list}>
          {pendingUsers.map((profile) => {
            const fullName =
              [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
              'Usuario desconocido';
            const reviewing = reviewingUserId === profile.user_id;

            return (
              <AdminCard key={profile.id}>
                <View style={styles.memberRow}>
                  <InitialAvatar
                    firstName={profile.first_name}
                    lastName={profile.last_name}
                  />
                  <View style={styles.memberCopy}>
                    <Text style={styles.memberName} numberOfLines={2}>
                      {fullName}
                    </Text>
                    <Text style={styles.memberMeta}>
                      Registrado el{' '}
                      {new Date(profile.created_at).toLocaleDateString('es-ES')}
                    </Text>
                  </View>
                </View>
                {canReviewMembers ? <View style={styles.actions}>
                  <Pressable
                    disabled={reviewing}
                    onPress={() => confirmDecision(profile, 'approved')}
                    style={({ pressed }) => [
                      styles.button,
                      styles.approveButton,
                      pressed && styles.pressed,
                      reviewing && styles.disabled,
                    ]}>
                    <Feather color={adminColors.amberOn} name="check" size={14} />
                    <Text style={styles.approveText}>
                      {reviewing ? 'Guardando…' : 'Aprobar'}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={reviewing}
                    onPress={() => confirmDecision(profile, 'rejected')}
                    style={({ pressed }) => [
                      styles.button,
                      styles.rejectButton,
                      pressed && styles.pressed,
                      reviewing && styles.disabled,
                    ]}>
                    <Feather color={adminColors.textMuted} name="x" size={14} />
                    <Text style={styles.rejectText}>Rechazar</Text>
                  </Pressable>
                </View> : null}
              </AdminCard>
            );
          })}
        </View>
      )}
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 18,
  },
  eyebrow: {
    ...adminType.eyebrow,
  },
  title: {
    ...adminType.title,
    marginTop: 6,
  },
  subtitle: {
    ...adminType.secondary,
    lineHeight: 17,
    marginTop: 6,
  },
  list: {
    gap: 8,
  },
  memberRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  memberCopy: {
    flex: 1,
    flexShrink: 1,
  },
  memberName: {
    ...adminType.rowTitle,
  },
  memberMeta: {
    ...adminType.secondary,
    marginTop: 3,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  button: {
    alignItems: 'center',
    borderRadius: adminRadius.input,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 40,
  },
  approveButton: {
    backgroundColor: adminColors.amber,
  },
  rejectButton: {
    borderColor: 'rgba(255,255,255,0.15)',
    borderWidth: adminHairline,
  },
  approveText: {
    color: adminColors.amberOn,
    fontSize: 12,
    fontWeight: '500',
  },
  rejectText: {
    color: adminColors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  error: {
    color: adminColors.urgent,
    fontSize: 12,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.45,
  },
});
