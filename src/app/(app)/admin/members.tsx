import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AdminCard, AdminScrollScreen, InitialAvatar } from '@/components/admin/admin-ui';
import { adminColors, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import { useAdminData } from '@/hooks/use-admin-data';

export default function MembersScreen() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canCreateMember = hasPermission('members', 'create');
  const { profiles } = useAdminData();

  const members = profiles.filter((p) => p.status === 'approved');
  const trainers = members.filter((p) => p.role === 'trainer');
  const customers = members.filter((p) => p.role === 'customer');

  return (
    <AdminScrollScreen includeTopInset={false}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>PERSONAL Y CLIENTES</Text>
          <Text style={styles.title}>{members.length} perfiles activos</Text>
          <Text style={styles.subtitle}>Resumen de los clientes y entrenadores aprobados.</Text>
        </View>
        {canCreateMember ? (
          <Pressable
            onPress={() => router.push('/create-member' as Href)}
            style={({ pressed }) => [styles.addStaffButton, pressed && styles.pressed]}>
            <Text style={styles.addStaffButtonText}>Añadir</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.menu}>
        <Pressable
          onPress={() => router.push('/admin/trainers' as Href)}
          style={({ pressed }) => [styles.menuCard, pressed && styles.pressed]}>
          <AdminCard style={styles.cardInner}>
            <View style={styles.cardLeft}>
              <InitialAvatar firstName="T" lastName="" staff />
            </View>
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle}>Entrenadores</Text>
              <Text style={styles.cardMeta}>{trainers.length} entrenadores</Text>
            </View>
          </AdminCard>
        </Pressable>

        <Pressable
          onPress={() => router.push('/admin/clients' as Href)}
          style={({ pressed }) => [styles.menuCard, pressed && styles.pressed]}>
          <AdminCard style={styles.cardInner}>
            <View style={styles.cardLeft}>
              <InitialAvatar firstName="C" lastName="" />
            </View>
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle}>Clientes</Text>
              <Text style={styles.cardMeta}>{customers.length} clientes</Text>
            </View>
          </AdminCard>
        </Pressable>
      </View>
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
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
  addStaffButton: {
    alignItems: 'center',
    backgroundColor: adminColors.amber,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addStaffButtonText: {
    color: adminColors.amberOn,
    fontSize: 12,
    fontWeight: '600',
  },
  menu: {
    gap: 12,
  },
  menuCard: {},
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardLeft: {},
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    ...adminType.rowTitle,
  },
  cardMeta: {
    ...adminType.secondary,
    marginTop: 4,
  },
  pressed: { opacity: 0.7 },
});
