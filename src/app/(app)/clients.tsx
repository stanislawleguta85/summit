import Feather from '@expo/vector-icons/Feather';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import {
  AdminCard,
  AdminHeader,
  AdminScrollScreen,
  EmptyState,
  InitialAvatar,
  SkeletonBlock,
} from '@/components/admin/admin-ui';
import { adminColors, adminRadius, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import {
  supabase,
  type CustomerCategoryLevel,
  type CustomerTrainingContract,
  type UserProfile,
} from '@/lib/supabase';

export default function TrainerClientsScreen() {
  const router = useRouter();
  const { hasPermission, userProfile } = useAuth();
  const canReadAssignedClients = hasPermission('clients', 'read', 'assigned');
  const canCreateCustomer = hasPermission('members', 'create');
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [levels, setLevels] = useState<CustomerCategoryLevel[]>([]);
  const [contracts, setContracts] = useState<CustomerTrainingContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (asRefresh = false) => {
      if (!userProfile || !canReadAssignedClients) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (asRefresh) setRefreshing(true);
      setError(null);
      try {
        const profileResult = await supabase
          .from('user_profiles')
          .select('*')
          .eq('assigned_trainer_id', userProfile.user_id)
          .eq('status', 'approved')
          .order('last_name', { ascending: true })
          .order('first_name', { ascending: true });
        if (profileResult.error) throw profileResult.error;

        const loadedClients = (profileResult.data ?? []) as UserProfile[];
        const clientIds = loadedClients.map((client) => client.user_id);
        const [levelResult, contractResult] = await Promise.all([
          clientIds.length > 0
            ? supabase
                .from('customer_category_levels')
                .select('*')
                .in('customer_id', clientIds)
                .eq('category', 'ET')
            : Promise.resolve({ data: [], error: null }),
          clientIds.length > 0
            ? supabase
                .from('customer_training_contracts')
                .select('*')
                .in('customer_id', clientIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (levelResult.error) throw levelResult.error;
        if (contractResult.error) throw contractResult.error;

        setClients(loadedClients);
        setLevels((levelResult.data ?? []) as CustomerCategoryLevel[]);
        setContracts((contractResult.data ?? []) as CustomerTrainingContract[]);
      } catch (loadError: any) {
        setError(loadError.message || 'Los clientes no se pudieron cargar.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canReadAssignedClients, userProfile?.user_id]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!userProfile || !canReadAssignedClients) {
    return (
      <View style={styles.denied}>
        <Text style={styles.secondary}>Esta sección está disponible para entrenadores.</Text>
      </View>
    );
  }

  return (
    <AdminScrollScreen
      refreshControl={
        <RefreshControl
          onRefresh={() => void load(true)}
          refreshing={refreshing}
          tintColor={adminColors.amber}
        />
      }>
      <AdminHeader
        eyebrow="CLIENTES"
        right={
          canCreateCustomer ? (
            <Pressable
              accessibilityLabel="Crear cliente"
              onPress={() => router.push('/create-member' as Href)}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
              <Feather color={adminColors.amberOn} name="user-plus" size={16} />
            </Pressable>
          ) : undefined
        }
        title="Mis clientes"
      />

      {loading ? (
        <View style={styles.list}>
          <SkeletonBlock height={78} />
          <SkeletonBlock height={78} />
        </View>
      ) : error ? (
        <AdminCard>
          <Text style={styles.error}>{error}</Text>
        </AdminCard>
      ) : clients.length === 0 ? (
        <EmptyState
          message="El administrador debe asignarte clientes antes de que puedas gestionarlos."
          title="No tienes clientes asignados"
        />
      ) : (
        <View style={styles.list}>
          {clients.map((client) => {
            const level = getLevel(client.user_id, levels);
            const contract = getContract(client.user_id, contracts);
            return (
              <Pressable
                key={client.id}
                onPress={() => router.push(`/client/${client.user_id}` as Href)}
                style={({ pressed }) => pressed && styles.pressed}>
                <AdminCard style={styles.clientCard}>
                  <InitialAvatar firstName={client.first_name} lastName={client.last_name} />
                  <View style={styles.clientCopy}>
                    <Text style={styles.clientName}>{getName(client)}</Text>
                    <Text style={styles.secondary}>{formatContract(contract)}</Text>
                    <Text style={styles.internalMeta}>
                      {level ? `Nivel interno ET: ${level}` : 'Nivel interno ET pendiente'}
                    </Text>
                  </View>
                  <Feather color={adminColors.textMuted} name="chevron-right" size={17} />
                </AdminCard>
              </Pressable>
            );
          })}
        </View>
      )}
    </AdminScrollScreen>
  );
}

function getLevel(customerId: string, levels: CustomerCategoryLevel[]) {
  return levels.find((level) => level.customer_id === customerId && level.category === 'ET')?.level;
}

function getContract(customerId: string, contracts: CustomerTrainingContract[]) {
  return contracts.find((contract) => contract.customer_id === customerId);
}

function getName(client: UserProfile) {
  return [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Cliente sin nombre';
}

function formatContract(contract: CustomerTrainingContract | undefined) {
  if (!contract) return 'Contrato pendiente';
  if (contract.training_model === 'individual') return 'Entrenamiento individual';
  const days = contract.group_days_per_week ?? 0;
  return `Grupo · ${days} ${days === 1 ? 'entrenamiento' : 'entrenamientos'} por semana`;
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: 'center',
    backgroundColor: adminColors.amber,
    borderRadius: adminRadius.input,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  denied: {
    alignItems: 'center',
    backgroundColor: adminColors.bgPage,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  list: {
    gap: 8,
  },
  clientCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 76,
  },
  clientCopy: {
    flex: 1,
  },
  clientName: {
    ...adminType.rowTitle,
  },
  secondary: {
    ...adminType.secondary,
    marginTop: 3,
  },
  internalMeta: {
    color: adminColors.textMuted,
    fontSize: 10,
    marginTop: 3,
  },
  error: {
    color: adminColors.urgent,
    fontSize: 12,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
