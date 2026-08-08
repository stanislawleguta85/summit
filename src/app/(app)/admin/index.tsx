import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AdminCard,
  AdminHeader,
  AdminScrollScreen,
  ChevronRow,
  HeaderIconButton,
  InitialAvatar,
  SearchInput,
  SectionHeading,
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
import type { UserProfile, UserRole } from '@/lib/supabase';

const SETTINGS = [
  { icon: 'office-building-outline', label: 'Perfil del estudio' },
  { icon: 'credit-card-outline', label: 'Membresías y precios' },
  { icon: 'receipt-text-outline', label: 'Pagos y facturación' },
  { icon: 'clock-remove-outline', label: 'Política de cancelación' },
  { icon: 'bell-outline', label: 'Notificaciones' },
  { icon: 'clock-outline', label: 'Horario de apertura' },
] as const;

export default function AdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    canImpersonate,
    isImpersonating,
    loadImpersonatableProfiles,
    signOut,
    startImpersonation,
  } = useAuth();
  const { profiles, roleAssignments, loading, refreshing, error, reload } = useAdminData();
  const [query, setQuery] = useState('');
  const [profilePickerVisible, setProfilePickerVisible] = useState(false);
  const [pickerProfiles, setPickerProfiles] = useState<UserProfile[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const approvedProfiles = profiles.filter((profile) => profile.status === 'approved');
  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-ES');
    if (!normalizedQuery) return approvedProfiles;

    return approvedProfiles.filter((profile) => {
      const name = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es-ES');
      return (
        name.includes(normalizedQuery) ||
        formatRoles(profile, roleAssignments).toLowerCase().includes(normalizedQuery)
      );
    });
  }, [approvedProfiles, query, roleAssignments]);
  const previewProfiles = filteredProfiles.slice(0, 3);
  const roleCounts = {
    owner: approvedProfiles.filter((profile) => hasRole(profile, 'owner', roleAssignments)).length,
    trainer: approvedProfiles.filter((profile) => hasRole(profile, 'trainer', roleAssignments)).length,
    customer: approvedProfiles.filter((profile) => hasRole(profile, 'customer', roleAssignments)).length,
  };

  const openProfilePicker = async () => {
    setProfilePickerVisible(true);
    setPickerLoading(true);
    try {
      setPickerProfiles(await loadImpersonatableProfiles());
    } catch (pickerError: any) {
      setProfilePickerVisible(false);
      Alert.alert('Error', pickerError.message || 'Los usuarios no se pudieron cargar.');
    } finally {
      setPickerLoading(false);
    }
  };

  const beginImpersonation = async (profile: UserProfile) => {
    try {
      setProfilePickerVisible(false);
      await startImpersonation(profile);
      router.replace('/');
    } catch (impersonationError: any) {
      Alert.alert(
        'Error',
        impersonationError.message || 'La vista de usuario no se pudo iniciar.'
      );
    }
  };

  const confirmSignOut = () => {
    if (signingOut) return;

    Alert.alert(
      'Cerrar sesión',
      '¿Quieres cerrar tu sesión en este dispositivo?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesión',
          style: 'destructive',
          onPress: () => void handleSignOut(),
        },
      ]
    );
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } catch (signOutError: any) {
      setSigningOut(false);
      Alert.alert('Error', signOutError.message || 'No se pudo cerrar la sesión.');
    }
  };

  return (
    <>
      <AdminScrollScreen
        refreshControl={
          <RefreshControl
            onRefresh={reload}
            refreshing={refreshing}
            tintColor={adminColors.amber}
          />
        }>
        <AdminHeader
          eyebrow="ADMIN"
          right={
            <HeaderIconButton
              accessibilityLabel="Nuevas membresías"
              badge={profiles.filter((profile) => profile.status === 'pending').length}
              icon="user-plus"
              onPress={() => router.push('/admin/pending-members')}
            />
          }
        />

        <SectionHeading title="Mi cuenta" />
        <AdminCard style={styles.listCard}>
          <ChevronRow
            icon="user"
            label="Mi perfil"
            onPress={() => router.push('/profile' as Href)}
            secondary="Foto y datos personales"
          />
        </AdminCard>

        <SearchInput
          onChangeText={setQuery}
          placeholder="Buscar miembro o personal"
          value={query}
        />

        <SectionHeading
          action={<Text style={styles.sectionMeta}>{approvedProfiles.length} en total</Text>}
          title="Personal y clientes"
        />

        {loading ? (
          <>
            <SkeletonBlock height={54} />
            <SkeletonBlock height={54} />
            <SkeletonBlock height={54} />
          </>
        ) : (
          <AdminCard style={styles.listCard}>
            <ChevronRow
              label="Entrenadores"
              onPress={() => router.push('/admin/trainers' as Href)}
              secondary={`${roleCounts.trainer} entrenadores`}
            />
            <ChevronRow
              label="Clientes"
              onPress={() => router.push('/admin/clients' as Href)}
              secondary={`${roleCounts.customer} clientes`}
            />
          </AdminCard>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <SectionHeading title="Gestión de roles" />
        <AdminCard style={styles.listCard}>
          <ChevronRow
            label="Admin"
            secondary={`Acceso total · ${roleCounts.owner} ${
              roleCounts.owner === 1 ? 'persona' : 'personas'
            }`}
          />
          <ChevronRow
            label="Entrenador"
            secondary={`Sus propios cursos · ${roleCounts.trainer} ${
              roleCounts.trainer === 1 ? 'persona' : 'personas'
            }`}
          />
        </AdminCard>

        <SectionHeading title="Cambios de cita" />
        <AdminCard style={styles.listCard}>
          <ChevronRow
            icon="repeat"
            label="Mis cambios"
            onPress={() => router.push('/admin/changes' as Href)}
            secondary="Solicitudes perdidas, pendientes y recuperadas"
          />
        </AdminCard>

        <SectionHeading title="Ajustes de la app" />
        <AdminCard style={styles.listCard}>
          {SETTINGS.map((item) => (
            <Pressable
              key={item.label}
              onPress={() =>
                Alert.alert(item.label, 'Esta configuración se conectará en una fase posterior.')
              }
              style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}>
              <View style={styles.settingIcon}>
                <MaterialCommunityIcons
                  color={adminColors.iconDefault}
                  name={item.icon}
                  size={16}
                />
              </View>
              <Text style={styles.settingLabel}>{item.label}</Text>
              <Feather color={adminColors.textMuted} name="chevron-right" size={15} />
            </Pressable>
          ))}
        </AdminCard>

        {canImpersonate ? (
          <>
            <SectionHeading title="Desarrollo" />
            <AdminCard>
              <Text style={styles.devTitle}>Vista previa de usuario</Text>
              <Text style={styles.devText}>
                Abre la app con la vista de un miembro o entrenador sin cerrar tu sesión.
              </Text>
              <Pressable
                onPress={() => void openProfilePicker()}
                style={({ pressed }) => [styles.devButton, pressed && styles.pressed]}>
                <Feather color={adminColors.amberOn} name="eye" size={15} />
                <Text style={styles.devButtonText}>Seleccionar usuario</Text>
              </Pressable>
            </AdminCard>
          </>
        ) : null}

        {!isImpersonating ? (
          <>
            <SectionHeading title="Sesión" />
            <AdminCard>
              <Pressable
                accessibilityLabel="Cerrar sesión"
                disabled={signingOut}
                onPress={confirmSignOut}
                style={({ pressed }) => [
                  styles.signOutButton,
                  pressed && styles.pressed,
                  signingOut && styles.disabled,
                ]}>
                <Feather color={adminColors.urgent} name="log-out" size={16} />
                <Text style={styles.signOutText}>
                  {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
                </Text>
              </Pressable>
            </AdminCard>
          </>
        ) : null}
      </AdminScrollScreen>

      <Modal
        animationType="slide"
        onRequestClose={() => setProfilePickerVisible(false)}
        presentationStyle="pageSheet"
        visible={profilePickerVisible}>
        <View style={[styles.modal, { paddingTop: insets.top + 18 }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalEyebrow}>DESARROLLO</Text>
              <Text style={styles.modalTitle}>Vista como usuario</Text>
            </View>
            <Pressable onPress={() => setProfilePickerVisible(false)}>
              <Text style={styles.modalClose}>Cerrar</Text>
            </Pressable>
          </View>

          {pickerLoading ? (
            <>
              <SkeletonBlock height={56} />
              <SkeletonBlock height={56} />
            </>
          ) : (
            <FlatList
              data={pickerProfiles}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => beginImpersonation(item)}
                  style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}>
                  <InitialAvatar
                    firstName={item.first_name}
                    lastName={item.last_name}
                    staff={item.role !== 'customer'}
                  />
                  <View style={styles.personCopy}>
                    <Text style={styles.personName}>
                      {[item.first_name, item.last_name].filter(Boolean).join(' ') ||
                        'Sin nombre'}
                    </Text>
                    <Text style={styles.personRole}>{formatRole(item.role)}</Text>
                  </View>
                  <Feather color={adminColors.textMuted} name="chevron-right" size={15} />
                </Pressable>
              )}
            />
          )}
        </View>
      </Modal>
    </>
  );
}

function formatRole(role: UserProfile['role']) {
  if (role === 'owner') return 'Admin';
  if (role === 'trainer') return 'Entrenador';
  return 'Cliente';
}

function hasRole(profile: UserProfile, role: UserRole['role'], assignments: UserRole[]) {
  return (
    profile.role === role ||
    assignments.some(
      (assignment) => assignment.user_id === profile.user_id && assignment.role === role
    )
  );
}

function formatRoles(profile: UserProfile, assignments: UserRole[]) {
  const roles = new Set<UserRole['role']>([
    profile.role,
    ...assignments
      .filter((assignment) => assignment.user_id === profile.user_id)
      .map((assignment) => assignment.role),
  ]);
  return Array.from(roles).map(formatRole).join(' · ');
}

const styles = StyleSheet.create({
  sectionMeta: {
    ...adminType.label,
  },
  listCard: {
    paddingBottom: 0,
    paddingTop: 0,
  },
  personRow: {
    alignItems: 'center',
    borderBottomColor: adminColors.border,
    borderBottomWidth: adminHairline,
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
  },
  personCopy: {
    flex: 1,
    flexShrink: 1,
  },
  personName: {
    ...adminType.rowTitle,
  },
  personRole: {
    ...adminType.secondary,
    marginTop: 2,
  },
  showAll: {
    alignItems: 'center',
    minHeight: 43,
    justifyContent: 'center',
  },
  showAllText: {
    color: adminColors.amber,
    fontSize: 12,
    fontWeight: '500',
  },
  emptySearch: {
    ...adminType.secondary,
    paddingVertical: 20,
    textAlign: 'center',
  },
  error: {
    color: adminColors.urgent,
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
  settingRow: {
    alignItems: 'center',
    borderBottomColor: adminColors.border,
    borderBottomWidth: adminHairline,
    flexDirection: 'row',
    gap: 10,
    minHeight: 49,
  },
  settingIcon: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  settingLabel: {
    ...adminType.rowTitle,
    flex: 1,
    flexShrink: 1,
  },
  devTitle: {
    ...adminType.rowTitle,
  },
  devText: {
    ...adminType.secondary,
    lineHeight: 17,
    marginTop: 5,
  },
  devButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: adminColors.amber,
    borderRadius: adminRadius.input,
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  devButtonText: {
    color: adminColors.amberOn,
    fontSize: 12,
    fontWeight: '500',
  },
  signOutButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    minHeight: 42,
  },
  signOutText: {
    color: adminColors.urgent,
    fontSize: 13,
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.45,
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
  modalEyebrow: {
    ...adminType.eyebrow,
  },
  modalTitle: {
    ...adminType.section,
    marginTop: 4,
  },
  modalClose: {
    color: adminColors.amber,
    fontSize: 13,
    fontWeight: '500',
  },
  pickerRow: {
    alignItems: 'center',
    borderBottomColor: adminColors.border,
    borderBottomWidth: adminHairline,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
  },
  pressed: {
    opacity: 0.7,
  },
});
