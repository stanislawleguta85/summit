import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
    AdminCard,
    AdminScrollScreen,
    InitialAvatar,
    SearchInput,
    SkeletonBlock,
} from '@/components/admin/admin-ui';
import { adminColors, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import { useAdminData } from '@/hooks/use-admin-data';

export default function ClientsScreen() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canCreateMember = hasPermission('members', 'create');
  const { profiles, loading } = useAdminData();
  const [query, setQuery] = useState('');

  const customers = useMemo(
    () =>
      profiles
        .filter((p) => p.status === 'approved' && p.role === 'customer')
        .filter((p) => {
          const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.toLowerCase();
          return name.includes(query.trim().toLowerCase());
        })
        .sort((a, b) => (a.first_name ?? '').localeCompare(b.first_name ?? '')),
    [profiles, query]
  );

  return (
    <AdminScrollScreen includeTopInset={false}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>CLIENTES</Text>
          <Text style={styles.title}>{customers.length} clientes</Text>
        </View>
        {canCreateMember ? (
          <Pressable
            onPress={() => router.push('/create-member?role=customer')}
            style={({ pressed }) => [styles.addStaffButton, pressed && styles.pressed]}>
            <Feather color={adminColors.amberOn} name="user-plus" size={15} />
          </Pressable>
        ) : null}
      </View>

      <SearchInput
        placeholder="Buscar por nombre"
        value={query}
        onChangeText={setQuery}
      />

      {loading ? (
        <>
          <SkeletonBlock height={66} />
          <SkeletonBlock height={66} />
        </>
      ) : (
        <View style={styles.list}>
          {customers.map((profile) => (
            <Pressable
              key={profile.id}
              onPress={() => router.push(`/client/${profile.user_id}`)}
              style={({ pressed }) => pressed && styles.pressed}>
              <AdminCard style={styles.item}>
                <InitialAvatar firstName={profile.first_name} lastName={profile.last_name} />
                <View style={styles.copy}>
                  <Text style={styles.name} numberOfLines={1}>
                    {[profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Sin nombre'}
                  </Text>
                  <Text style={styles.meta}>Desde {new Date(profile.created_at).toLocaleDateString('es-ES')}</Text>
                </View>
              </AdminCard>
            </Pressable>
          ))}
        </View>
      )}
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: { flex: 1 },
  eyebrow: { ...adminType.eyebrow },
  title: { ...adminType.title, marginTop: 6 },
  addStaffButton: {
    alignItems: 'center',
    backgroundColor: adminColors.amber,
    borderRadius: 9,
    padding: 10,
  },
  pressed: { opacity: 0.7 },
  list: { gap: 8, marginTop: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64 },
  copy: { flex: 1 },
  name: { ...adminType.rowTitle },
  meta: { ...adminType.secondary, marginTop: 3 },
});
