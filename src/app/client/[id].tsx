import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AdminCard,
  AdminScrollScreen,
  AdminTextInput,
  FilterChip,
  InitialAvatar,
  PrimaryButton,
  SectionHeading,
  SkeletonBlock,
} from '@/components/admin/admin-ui';
import { adminColors, adminRadius, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import { supabase, type CustomerConfiguration } from '@/lib/supabase';

type TrainerOption = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
};

const LEVELS = ['Bajo', 'Medio', 'Alto'] as const;

export default function CustomerConfigurationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const canEditMasterData = hasPermission('clients', 'update_profile');
  const canSetLevel = hasPermission('clients', 'set_level');
  const canSetContract = hasPermission('clients', 'set_contract');
  const canAssignTrainer = hasPermission('clients', 'assign_trainer', 'all');
  const [configuration, setConfiguration] = useState<CustomerConfiguration | null>(null);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [contractModel, setContractModel] = useState<'group' | 'individual'>('group');
  const [contractDays, setContractDays] = useState(1);
  const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<'Bajo' | 'Medio' | 'Alto' | null>(null);
  const [trainerModalVisible, setTrainerModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (asRefresh = false) => {
      if (!id) {
        setLoading(false);
        return;
      }

      if (asRefresh) setRefreshing(true);
      setError(null);
      try {
        const [configurationResult, trainerResult] = await Promise.all([
          supabase.rpc('get_customer_configuration', { target_customer_id: id }),
          canAssignTrainer
            ? supabase.rpc('get_customer_creation_trainers')
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (configurationResult.error) throw configurationResult.error;
        if (trainerResult.error) throw trainerResult.error;

        const loadedConfiguration = (configurationResult.data ?? [])[0] as
          | CustomerConfiguration
          | undefined;
        if (!loadedConfiguration) throw new Error('No se encontró la configuración del cliente.');

        setConfiguration(loadedConfiguration);
        setFirstName(loadedConfiguration.first_name ?? '');
        setLastName(loadedConfiguration.last_name ?? '');
        setPhoneNumber(loadedConfiguration.phone_number ?? '');
        setContractModel(loadedConfiguration.training_model ?? 'group');
        setContractDays(loadedConfiguration.group_days_per_week ?? 1);
        setSelectedTrainerId(loadedConfiguration.assigned_trainer_id);
        setSelectedLevel(loadedConfiguration.et_level);
        setTrainers((trainerResult.data ?? []) as TrainerOption[]);
      } catch (loadError: any) {
        setError(loadError.message || 'No se pudo cargar el cliente.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canAssignTrainer, id]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const saveChanges = async () => {
    if (!configuration || saving) return;
    setSaving(true);
    try {
      const { error: updateError } = await supabase.rpc(
        'update_complete_customer_configuration',
        {
        target_customer_id: configuration.user_id,
        selected_first_name: firstName,
        selected_last_name: lastName,
        selected_phone_number: phoneNumber,
          selected_assigned_trainer_id: selectedTrainerId,
          selected_training_model: contractModel,
          selected_group_days_per_week: contractModel === 'group' ? contractDays : null,
          selected_et_level: selectedLevel,
        }
      );
      if (updateError) throw updateError;
      await load(true);
      Alert.alert('Cambios guardados', 'La configuración del cliente se ha actualizado.');
    } catch (updateError: any) {
      Alert.alert(
        'No se pudo guardar',
        updateError.message || 'Comprueba los datos e inténtalo de nuevo.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardAvoider}>
      <AdminScrollScreen
        includeTabInset={false}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            onRefresh={() => void load(true)}
            refreshing={refreshing}
            tintColor={adminColors.amber}
          />
        }>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Volver"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Feather color={adminColors.textPrimary} name="arrow-left" size={18} />
          </Pressable>
          <InitialAvatar
            firstName={configuration?.first_name}
            lastName={configuration?.last_name}
          />
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>CLIENTE</Text>
            <Text style={styles.title}>{configuration ? getName(configuration) : 'Configuración'}</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.list}>
            <SkeletonBlock height={230} />
            <SkeletonBlock height={260} />
          </View>
        ) : error ? (
          <AdminCard>
            <Text style={styles.error}>{error}</Text>
          </AdminCard>
        ) : configuration ? (
          <>
            <SectionHeading title="Datos personales" />
            <AdminCard style={styles.sectionCard}>
              <View style={styles.twoColumns}>
                <View style={styles.column}>
                  <AdminTextInput
                    autoCapitalize="words"
                    editable={canEditMasterData && !saving}
                    label="Nombre"
                    onChangeText={setFirstName}
                    value={firstName}
                  />
                </View>
                <View style={styles.column}>
                  <AdminTextInput
                    autoCapitalize="words"
                    editable={canEditMasterData && !saving}
                    label="Apellidos"
                    onChangeText={setLastName}
                    value={lastName}
                  />
                </View>
              </View>

              <AdminTextInput
                editable={false}
                label="Correo de acceso"
                value={configuration.email ?? '—'}
              />
              <Text style={styles.hint}>
                El correo pertenece al inicio de sesión y no se cambia desde los datos personales.
              </Text>
              <AdminTextInput
                editable={canEditMasterData && !saving}
                keyboardType="phone-pad"
                label="Teléfono"
                onChangeText={setPhoneNumber}
                value={phoneNumber}
              />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Alta</Text>
                <Text style={styles.infoValue}>{formatDate(configuration.created_at)}</Text>
              </View>

            </AdminCard>

            <SectionHeading title="Datos contractuales" />
            <AdminCard style={styles.sectionCard}>
              <Text style={styles.fieldLabel}>Entrenador asignado</Text>
              <Pressable
                disabled={!canAssignTrainer || saving}
                onPress={() => setTrainerModalVisible(true)}
                style={({ pressed }) => [styles.selectRow, pressed && styles.pressed]}>
                <Text style={styles.selectValue}>
                  {getSelectedTrainerName(
                    selectedTrainerId,
                    trainers,
                    configuration
                  )}
                </Text>
                {canAssignTrainer ? (
                  <Feather color={adminColors.textMuted} name="chevron-down" size={16} />
                ) : null}
              </Pressable>

              <Text style={styles.fieldLabel}>Modelo de entrenamiento</Text>
              <View style={styles.options}>
                {(['group', 'individual'] as const).map((model) => {
                  const lockedOtherModel =
                    configuration.training_model !== null &&
                    configuration.training_model !== model;
                  return (
                    <Pressable
                      disabled={!canSetContract || saving || lockedOtherModel}
                      key={model}
                      onPress={() => setContractModel(model)}
                      style={({ pressed }) => [
                        styles.option,
                        contractModel === model && styles.optionSelected,
                        lockedOtherModel && styles.optionDisabled,
                        pressed && styles.pressed,
                      ]}>
                      <Text
                        style={[
                          styles.optionText,
                          contractModel === model && styles.optionTextSelected,
                        ]}>
                        {model === 'group' ? 'Grupo' : 'Individual'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {configuration.training_model ? (
                <Text style={styles.hint}>
                  El cambio entre Grupo e Individual sigue pendiente de decisión administrativa.
                </Text>
              ) : null}

              {contractModel === 'group' ? (
                <>
                  <Text style={styles.fieldLabel}>Entrenamientos por semana</Text>
                  <View style={styles.dayOptions}>
                    {Array.from({ length: 7 }, (_, index) => index + 1).map((dayCount) => (
                      <FilterChip
                        active={contractDays === dayCount}
                        key={dayCount}
                        label={String(dayCount)}
                        onPress={() => {
                          if (canSetContract && !saving) setContractDays(dayCount);
                        }}
                      />
                    ))}
                  </View>
                  <Text style={styles.hint}>
                    Calendario semanal de lunes a domingo. La espera no consume el límite.
                  </Text>
                </>
              ) : null}

            </AdminCard>

            <SectionHeading title="Configuración interna" />
            <AdminCard style={styles.sectionCard}>
              <Text style={styles.fieldLabel}>Nivel ET</Text>
              <View style={styles.options}>
                {LEVELS.map((level) => (
                  <Pressable
                    disabled={!canSetLevel || saving}
                    key={level}
                    onPress={() => setSelectedLevel(level)}
                    style={({ pressed }) => [
                      styles.option,
                      selectedLevel === level && styles.optionSelected,
                      pressed && styles.pressed,
                    ]}>
                    <Text
                      style={[
                        styles.optionText,
                        selectedLevel === level && styles.optionTextSelected,
                      ]}>
                      {level}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.hint}>Este nivel es interno y no se muestra al cliente.</Text>
            </AdminCard>

            {canEditMasterData || canSetContract || canSetLevel || canAssignTrainer ? (
              <PrimaryButton
                disabled={saving}
                onPress={() => void saveChanges()}
                style={styles.saveButton}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </PrimaryButton>
            ) : null}
          </>
        ) : null}
      </AdminScrollScreen>

      <Modal
        animationType="slide"
        onRequestClose={() => setTrainerModalVisible(false)}
        presentationStyle="pageSheet"
        visible={trainerModalVisible}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>CLIENTE</Text>
              <Text style={styles.title}>Entrenador asignado</Text>
            </View>
            <Pressable
              accessibilityLabel="Cerrar"
              onPress={() => setTrainerModalVisible(false)}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <Feather color={adminColors.textPrimary} name="x" size={18} />
            </Pressable>
          </View>

          <Pressable
            disabled={saving}
            onPress={() => {
              setSelectedTrainerId(null);
              setTrainerModalVisible(false);
            }}
            style={({ pressed }) => [styles.trainerRow, pressed && styles.pressed]}>
            <Text style={styles.selectValue}>Sin entrenador</Text>
            {!selectedTrainerId ? (
              <Feather color={adminColors.amber} name="check" size={17} />
            ) : null}
          </Pressable>

          {trainers.map((trainer) => (
            <Pressable
              disabled={saving}
              key={trainer.user_id}
              onPress={() => {
                setSelectedTrainerId(trainer.user_id);
                setTrainerModalVisible(false);
              }}
              style={({ pressed }) => [styles.trainerRow, pressed && styles.pressed]}>
              <InitialAvatar
                firstName={trainer.first_name}
                lastName={trainer.last_name}
                staff
              />
              <Text style={styles.selectValue}>{getTrainerName(trainer)}</Text>
              {selectedTrainerId === trainer.user_id ? (
                <Feather color={adminColors.amber} name="check" size={17} />
              ) : null}
            </Pressable>
          ))}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function getName(configuration: CustomerConfiguration) {
  return [configuration.first_name, configuration.last_name].filter(Boolean).join(' ') || 'Cliente';
}

function getTrainerName(trainer: TrainerOption) {
  return [trainer.first_name, trainer.last_name].filter(Boolean).join(' ') || 'Entrenador';
}

function getSelectedTrainerName(
  selectedTrainerId: string | null,
  trainers: TrainerOption[],
  configuration: CustomerConfiguration
) {
  if (!selectedTrainerId) return 'Sin entrenador';
  const selectedTrainer = trainers.find((trainer) => trainer.user_id === selectedTrainerId);
  if (selectedTrainer) return getTrainerName(selectedTrainer);
  if (configuration.assigned_trainer_id === selectedTrainerId) {
    return configuration.assigned_trainer_name || 'Entrenador';
  }
  return 'Entrenador';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  keyboardAvoider: {
    backgroundColor: adminColors.bgPage,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderRadius: adminRadius.input,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    ...adminType.eyebrow,
  },
  title: {
    ...adminType.title,
    marginTop: 5,
  },
  list: {
    gap: 10,
  },
  sectionCard: {
    gap: 13,
  },
  saveButton: {
    marginTop: 22,
  },
  twoColumns: {
    flexDirection: 'row',
    gap: 8,
  },
  column: {
    flex: 1,
  },
  hint: {
    color: adminColors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: -6,
  },
  infoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    color: adminColors.textSecondary,
    fontSize: 11,
  },
  infoValue: {
    color: adminColors.textPrimary,
    fontSize: 12,
    fontWeight: '500',
  },
  fieldLabel: {
    color: adminColors.textSecondary,
    fontSize: 11,
  },
  selectRow: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCardMuted,
    borderColor: adminColors.border,
    borderRadius: adminRadius.input,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  selectValue: {
    ...adminType.rowTitle,
    flex: 1,
  },
  options: {
    flexDirection: 'row',
    gap: 8,
  },
  option: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCardMuted,
    borderRadius: adminRadius.input,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
  },
  optionSelected: {
    backgroundColor: adminColors.amber,
  },
  optionDisabled: {
    opacity: 0.4,
  },
  optionText: {
    color: adminColors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: adminColors.amberOn,
  },
  dayOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modal: {
    backgroundColor: adminColors.bgPage,
    flex: 1,
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderRadius: adminRadius.input,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  trainerRow: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.border,
    borderRadius: adminRadius.input,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 12,
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
