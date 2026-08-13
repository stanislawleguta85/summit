import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
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
} from '@/components/admin/admin-ui';
import { adminColors, adminRadius, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';

type CreationTrainer = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
};

type TrainingModel = 'group' | 'individual';

export default function NewStaffScreen() {
  const router = useRouter();
  const { hasPermission, userProfile } = useAuth();
  const canCreateMember = hasPermission('members', 'create');
  const canCreateTrainer = hasPermission('members', 'create', 'all');
  const params = useLocalSearchParams();
  const [role, setRole] = useState<'customer' | 'trainer'>(
    (params?.role === 'trainer' ? 'trainer' : 'customer') as 'customer' | 'trainer'
  );
  const [trainers, setTrainers] = useState<CreationTrainer[]>([]);
  const [assignedTrainerId, setAssignedTrainerId] = useState<string | null>(null);
  const [trainerModalVisible, setTrainerModalVisible] = useState(false);
  const [trainersLoading, setTrainersLoading] = useState(true);
  const [trainersError, setTrainersError] = useState<string | null>(null);
  const [trainingModel, setTrainingModel] = useState<TrainingModel>('group');
  const [groupDaysPerWeek, setGroupDaysPerWeek] = useState(1);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!canCreateMember) {
      setTrainersLoading(false);
      return;
    }

    let active = true;
    const loadTrainers = async () => {
      setTrainersLoading(true);
      setTrainersError(null);
      const { data, error } = await supabase.rpc('get_customer_creation_trainers');
      if (!active) return;

      if (error) {
        setTrainersError(error.message || 'No se pudieron cargar los entrenadores.');
        setTrainersLoading(false);
        return;
      }

      const loadedTrainers = (data ?? []) as CreationTrainer[];
      setTrainers(loadedTrainers);
      setAssignedTrainerId((current) => {
        if (current && loadedTrainers.some((trainer) => trainer.user_id === current)) {
          return current;
        }
        const currentUserTrainer = loadedTrainers.find(
          (trainer) => trainer.user_id === userProfile?.user_id
        );
        return currentUserTrainer?.user_id ?? loadedTrainers[0]?.user_id ?? null;
      });
      setTrainersLoading(false);
    };

    void loadTrainers();
    return () => {
      active = false;
    };
  }, [canCreateMember, userProfile?.user_id]);

  if (!canCreateMember) {
    return (
      <View style={styles.denied}>
        <Text style={styles.error}>No tienes permiso para crear cuentas.</Text>
      </View>
    );
  }

  const assignedTrainer = trainers.find(
    (trainer) => trainer.user_id === assignedTrainerId
  );

  const submit = async () => {
    if (submitting) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phoneNumber.trim();
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      Alert.alert('Datos incompletos', 'Introduce el nombre y los apellidos.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      Alert.alert('Correo incorrecto', 'Introduce una dirección de correo válida.');
      return;
    }
    if (
      cleanPhone.length < 7 ||
      cleanPhone.length > 30 ||
      !/^[+0-9][0-9\s().-]*$/.test(cleanPhone) ||
      cleanPhone.replace(/\D/g, '').length < 7 ||
      cleanPhone.replace(/\D/g, '').length > 15
    ) {
      Alert.alert('Teléfono incorrecto', 'Introduce un número de teléfono válido.');
      return;
    }
    if (password.length < 10) {
      Alert.alert(
        'Contraseña demasiado corta',
        'La contraseña temporal necesita al menos 10 caracteres.'
      );
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Contraseñas diferentes', 'Las dos contraseñas deben coincidir.');
      return;
    }
    if (role === 'customer' && !assignedTrainerId) {
      Alert.alert('Falta el entrenador', 'Selecciona el entrenador asignado al cliente.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: functionError } = await supabase.functions.invoke(
        'create-staff-user',
        {
          body: {
            assigned_trainer_id: role === 'customer' ? assignedTrainerId : null,
            email: cleanEmail,
            first_name: firstName.trim(),
            group_days_per_week:
              role === 'customer' && trainingModel === 'group'
                ? groupDaysPerWeek
                : null,
            last_name: lastName.trim(),
            password,
            phone_number: cleanPhone,
            role,
            training_model: role === 'customer' ? trainingModel : null,
          },
        }
      );
      if (functionError) {
        throw new Error(await getFunctionErrorMessage(functionError));
      }

      Alert.alert(
        role === 'customer' ? 'Cliente creado' : 'Entrenador creado',
        `${firstName.trim()} ya puede iniciar sesión con ${cleanEmail} y la contraseña temporal. Tendrá que cambiarla en el primer acceso.`,
        [{ text: 'Aceptar', onPress: () => router.back() }]
      );
    } catch (createError: any) {
      Alert.alert(
        'No se pudo crear',
        createError.message || 'Comprueba los datos e inténtalo de nuevo.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardAvoider}>
      <AdminScrollScreen
        includeTabInset={false}
        includeTopInset={true}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <Pressable
          accessibilityLabel="Volver"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Feather color={adminColors.textPrimary} name="arrow-left" size={18} />
        </Pressable>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>NUEVA CUENTA</Text>
          <Text style={styles.title}>{role === 'customer' ? 'Crear cliente' : 'Crear entrenador'}</Text>
          <Text style={styles.subtitle}>
            La cuenta quedará aprobada en tu sede y podrá iniciar sesión inmediatamente.
          </Text>
        </View>
      </View>

      {canCreateTrainer && !params?.role ? (
        <View style={styles.roleSelector}>
          <Text style={styles.roleSelectorLabel}>Tipo de cuenta</Text>
          <View style={styles.roleOptions}>
            <FilterChip
              active={role === 'customer'}
              label="Cliente"
              onPress={() => setRole('customer')}
            />
            <FilterChip
              active={role === 'trainer'}
              label="Entrenador"
              onPress={() => setRole('trainer')}
            />
          </View>
        </View>
      ) : null}

      <AdminCard style={styles.roleCard}>
        <View style={styles.roleIcon}>
          <Feather
            color={adminColors.amber}
            name={role === 'customer' ? 'user' : 'user-check'}
            size={18}
          />
        </View>
        <View style={styles.roleCopy}>
          <Text style={styles.cardTitle}>
            {role === 'customer' ? 'Cliente' : 'Entrenador'}
          </Text>
          <Text style={styles.secondary}>
            {role === 'customer'
              ? canCreateTrainer
                ? 'Se creará como cliente aprobado de tu sede.'
                : 'Se creará como cliente aprobado y quedará asignado automáticamente a ti.'
              : 'Recibirá los permisos estándar para clientes, solicitudes, clases y sesiones asignadas.'}
          </Text>
        </View>
      </AdminCard>

      {role === 'customer' ? (
        <>
          <View style={styles.trainerAssignment}>
            <Text style={styles.roleSelectorLabel}>Entrenador asignado</Text>
            <Pressable
              disabled={trainersLoading || trainers.length === 0}
              onPress={() => setTrainerModalVisible(true)}
              style={({ pressed }) => [styles.trainerSelect, pressed && styles.pressed]}>
              <InitialAvatar
                firstName={assignedTrainer?.first_name}
                lastName={assignedTrainer?.last_name}
                staff
              />
              <View style={styles.trainerSelectCopy}>
                <Text style={styles.trainerSelectName}>
                  {trainersLoading
                    ? 'Cargando entrenadores...'
                    : getTrainerName(assignedTrainer) || 'Seleccionar entrenador'}
                </Text>
                <Text style={styles.trainerSelectHint}>Toca para cambiar</Text>
              </View>
              <Feather color={adminColors.textMuted} name="chevron-down" size={16} />
            </Pressable>
            {trainersError ? <Text style={styles.inlineError}>{trainersError}</Text> : null}
          </View>

          <View style={styles.contractSection}>
            <Text style={styles.roleSelectorLabel}>Modelo de entrenamiento</Text>
            <View style={styles.roleOptions}>
              <FilterChip
                active={trainingModel === 'group'}
                label="Grupo"
                onPress={() => setTrainingModel('group')}
              />
              <FilterChip
                active={trainingModel === 'individual'}
                label="Individual"
                onPress={() => setTrainingModel('individual')}
              />
            </View>

            {trainingModel === 'group' ? (
              <View style={styles.groupDaysSection}>
                <Text style={styles.roleSelectorLabel}>Días contratados por semana</Text>
                <View style={styles.dayOptions}>
                  {Array.from({ length: 7 }, (_, index) => index + 1).map((dayCount) => (
                    <FilterChip
                      active={groupDaysPerWeek === dayCount}
                      key={dayCount}
                      label={String(dayCount)}
                      onPress={() => setGroupDaysPerWeek(dayCount)}
                    />
                  ))}
                </View>
                <Text style={styles.contractHint}>
                  Los entrenamientos individuales no cuentan para este límite semanal.
                </Text>
              </View>
            ) : (
              <Text style={styles.contractHint}>
                El modelo individual no utiliza un número de días de grupo por semana.
              </Text>
            )}
          </View>
        </>
      ) : null}

      <View style={styles.form}>
        <View style={styles.twoColumns}>
          <View style={styles.column}>
            <AdminTextInput
              autoCapitalize="words"
              autoComplete="given-name"
              label="Nombre"
              onChangeText={setFirstName}
              value={firstName}
            />
          </View>
          <View style={styles.column}>
            <AdminTextInput
              autoCapitalize="words"
              autoComplete="family-name"
              label="Apellidos"
              onChangeText={setLastName}
              value={lastName}
            />
          </View>
        </View>

        <AdminTextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          label="Correo electrónico"
          onChangeText={setEmail}
          placeholder={role === 'customer' ? 'cliente2@example.com' : 'trainer2@example.com'}
          value={email}
        />
        <Text style={styles.hint}>
          Para una cuenta de prueba puedes utilizar una dirección ficticia con formato válido.
        </Text>

        <AdminTextInput
          autoComplete="tel"
          keyboardType="phone-pad"
          label="Teléfono"
          onChangeText={setPhoneNumber}
          placeholder="+34 600 000 000"
          value={phoneNumber}
        />

        <View style={styles.passwordGroup}>
          <AdminTextInput
            autoCapitalize="none"
            autoComplete="new-password"
            label="Contraseña temporal"
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            value={password}
          />
          <Pressable
            accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onPress={() => setShowPassword((current) => !current)}
            style={styles.passwordToggle}>
            <Feather
              color={adminColors.textMuted}
              name={showPassword ? 'eye-off' : 'eye'}
              size={17}
            />
          </Pressable>
        </View>
        <AdminTextInput
          autoCapitalize="none"
          autoComplete="new-password"
          label="Repetir contraseña temporal"
          onChangeText={setConfirmPassword}
          secureTextEntry={!showPassword}
          value={confirmPassword}
        />
        <Text style={styles.hint}>
          Mínimo 10 caracteres. Comunícala de forma segura; se sustituirá en el primer acceso.
        </Text>
      </View>

      <PrimaryButton disabled={submitting} onPress={() => void submit()}>
        {submitting
          ? 'Creando…'
          : role === 'customer'
            ? 'Crear cliente'
            : 'Crear entrenador'}
      </PrimaryButton>
      </AdminScrollScreen>

      <Modal
        animationType="slide"
        onRequestClose={() => setTrainerModalVisible(false)}
        presentationStyle="pageSheet"
        visible={trainerModalVisible}>
        <View style={styles.trainerModal}>
          <View style={styles.trainerModalHeader}>
            <View>
              <Text style={styles.eyebrow}>CLIENTE</Text>
              <Text style={styles.title}>Seleccionar entrenador</Text>
            </View>
            <Pressable
              accessibilityLabel="Cerrar"
              onPress={() => setTrainerModalVisible(false)}
              style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}>
              <Feather color={adminColors.textPrimary} name="x" size={18} />
            </Pressable>
          </View>

          <View style={styles.trainerList}>
            {trainers.map((trainer) => {
              const selected = trainer.user_id === assignedTrainerId;
              return (
                <Pressable
                  key={trainer.user_id}
                  onPress={() => {
                    setAssignedTrainerId(trainer.user_id);
                    setTrainerModalVisible(false);
                  }}
                  style={({ pressed }) => [styles.trainerRow, pressed && styles.pressed]}>
                  <InitialAvatar
                    firstName={trainer.first_name}
                    lastName={trainer.last_name}
                    staff
                  />
                  <Text style={styles.trainerRowName}>{getTrainerName(trainer)}</Text>
                  {selected ? (
                    <Feather color={adminColors.amber} name="check" size={17} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function getTrainerName(trainer: CreationTrainer | undefined) {
  return trainer
    ? [trainer.first_name, trainer.last_name].filter(Boolean).join(' ')
    : '';
}

async function getFunctionErrorMessage(error: any) {
  const response = error?.context;
  if (response && typeof response.json === 'function') {
    try {
      const payload = await response.json();
      if (payload && typeof payload.error === 'string') return payload.error;
    } catch {
      // Die generische Functions-Fehlermeldung bleibt als Rueckfall erhalten.
    }
  }
  return error?.message || 'La función no respondió correctamente.';
}

const styles = StyleSheet.create({
  keyboardAvoider: {
    backgroundColor: adminColors.bgPage,
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  headerLeft: { flex: 1 },
  denied: {
    alignItems: 'center',
    backgroundColor: adminColors.bgPage,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
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
  roleSelector: {
    gap: 8,
    marginBottom: 12,
  },
  roleSelectorLabel: {
    color: adminColors.textSecondary,
    fontSize: 11,
  },
  roleOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  roleCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
  },
  roleIcon: {
    alignItems: 'center',
    backgroundColor: adminColors.amberTint,
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  roleCopy: {
    flex: 1,
  },
  trainerAssignment: {
    gap: 7,
    marginTop: 14,
  },
  contractSection: {
    gap: 8,
    marginTop: 16,
  },
  groupDaysSection: {
    gap: 8,
    marginTop: 4,
  },
  dayOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  contractHint: {
    color: adminColors.textMuted,
    fontSize: 10,
    lineHeight: 15,
  },
  trainerSelect: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.borderInput,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 12,
  },
  trainerSelectCopy: {
    flex: 1,
  },
  trainerSelectName: {
    ...adminType.rowTitle,
  },
  trainerSelectHint: {
    ...adminType.secondary,
    marginTop: 2,
  },
  inlineError: {
    color: adminColors.urgent,
    fontSize: 11,
  },
  cardTitle: {
    ...adminType.rowTitle,
  },
  secondary: {
    ...adminType.secondary,
    lineHeight: 17,
    marginTop: 3,
  },
  form: {
    gap: 12,
    marginBottom: 22,
    marginTop: 18,
  },
  twoColumns: {
    flexDirection: 'row',
    gap: 8,
  },
  column: {
    flex: 1,
  },
  passwordGroup: {
    position: 'relative',
  },
  passwordToggle: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    width: 42,
    height: 44,
  },
  hint: {
    color: adminColors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: -7,
  },
  error: {
    color: adminColors.urgent,
    fontSize: 12,
    textAlign: 'center',
  },
  trainerModal: {
    backgroundColor: adminColors.bgPage,
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  trainerModalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderRadius: adminRadius.input,
    height: 38,
    justifyContent: 'center',
    marginRight: 10,
    width: 38,
  },
  modalClose: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  trainerList: {
    gap: 8,
  },
  trainerRow: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.borderInput,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 12,
  },
  trainerRowName: {
    ...adminType.rowTitle,
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
