import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AdminCard,
  AdminScrollScreen,
  AdminTextInput,
  PrimaryButton,
} from '@/components/admin/admin-ui';
import { adminColors, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';

export default function ChangePasswordScreen() {
  const { changeInitialPassword, signOut, userProfile } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    if (password.length < 10) {
      Alert.alert(
        'Contraseña demasiado corta',
        'La nueva contraseña necesita al menos 10 caracteres.'
      );
      return;
    }
    if (password !== confirmation) {
      Alert.alert('Contraseñas diferentes', 'Las dos contraseñas deben coincidir.');
      return;
    }

    setSaving(true);
    try {
      await changeInitialPassword(password);
      Alert.alert('Contraseña actualizada', 'Ya puedes utilizar Summit normalmente.');
    } catch (passwordError: any) {
      Alert.alert(
        'No se pudo actualizar',
        passwordError.message || 'Inténtalo de nuevo.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminScrollScreen includeTabInset={false}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Feather color={adminColors.amber} name="lock" size={22} />
        </View>
        <Text style={styles.eyebrow}>PRIMER ACCESO</Text>
        <Text style={styles.title}>Crea tu contraseña</Text>
        <Text style={styles.subtitle}>
          Hola {userProfile?.first_name || 'entrenador'}. Sustituye la contraseña temporal antes
          de continuar.
        </Text>
      </View>

      <AdminCard>
        <View style={styles.form}>
          <View style={styles.passwordGroup}>
            <AdminTextInput
              autoCapitalize="none"
              autoComplete="new-password"
              label="Nueva contraseña"
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
            label="Repetir nueva contraseña"
            onChangeText={setConfirmation}
            secureTextEntry={!showPassword}
            value={confirmation}
          />
          <Text style={styles.hint}>Utiliza al menos 10 caracteres.</Text>
        </View>
      </AdminCard>

      <View style={styles.actions}>
        <PrimaryButton disabled={saving} onPress={() => void submit()}>
          {saving ? 'Guardando…' : 'Guardar nueva contraseña'}
        </PrimaryButton>
        <PrimaryButton disabled={saving} onPress={() => void signOut()} secondary>
          Cerrar sesión
        </PrimaryButton>
      </View>
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: 22,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: adminColors.amberTint,
    borderRadius: 16,
    height: 54,
    justifyContent: 'center',
    marginBottom: 16,
    width: 54,
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
    lineHeight: 18,
    marginTop: 8,
    maxWidth: 320,
    textAlign: 'center',
  },
  form: {
    gap: 13,
  },
  passwordGroup: {
    position: 'relative',
  },
  passwordToggle: {
    alignItems: 'center',
    bottom: 0,
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    width: 42,
  },
  hint: {
    color: adminColors.textMuted,
    fontSize: 10,
  },
  actions: {
    gap: 9,
    marginTop: 18,
  },
});
