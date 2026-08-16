import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
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
  PrimaryButton,
  SectionHeading,
} from '@/components/admin/admin-ui';
import { AvatarEditor } from '@/components/profile/avatar-editor';
import { ProfileAvatar } from '@/components/profile-avatar';
import { adminColors, adminHairline, adminType } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';

// This screen lives outside the tab group and is opened from the account entry.
const AVATAR_BUCKET = 'profile-photos';

type CountryCallingCode = {
  code: string;
  dialCode: string;
  name: string;
};

const EUROPEAN_CALLING_CODES: CountryCallingCode[] = [
  { code: 'ES', dialCode: '+34', name: 'Espa\u00f1a' },
  { code: 'DE', dialCode: '+49', name: 'Alemania' },
  { code: 'AT', dialCode: '+43', name: 'Austria' },
  { code: 'BE', dialCode: '+32', name: 'B\u00e9lgica' },
  { code: 'BG', dialCode: '+359', name: 'Bulgaria' },
  { code: 'CY', dialCode: '+357', name: 'Chipre' },
  { code: 'HR', dialCode: '+385', name: 'Croacia' },
  { code: 'DK', dialCode: '+45', name: 'Dinamarca' },
  { code: 'SK', dialCode: '+421', name: 'Eslovaquia' },
  { code: 'SI', dialCode: '+386', name: 'Eslovenia' },
  { code: 'EE', dialCode: '+372', name: 'Estonia' },
  { code: 'FI', dialCode: '+358', name: 'Finlandia' },
  { code: 'FR', dialCode: '+33', name: 'Francia' },
  { code: 'GR', dialCode: '+30', name: 'Grecia' },
  { code: 'HU', dialCode: '+36', name: 'Hungr\u00eda' },
  { code: 'IE', dialCode: '+353', name: 'Irlanda' },
  { code: 'IT', dialCode: '+39', name: 'Italia' },
  { code: 'LV', dialCode: '+371', name: 'Letonia' },
  { code: 'LT', dialCode: '+370', name: 'Lituania' },
  { code: 'LU', dialCode: '+352', name: 'Luxemburgo' },
  { code: 'MT', dialCode: '+356', name: 'Malta' },
  { code: 'NL', dialCode: '+31', name: 'Pa\u00edses Bajos' },
  { code: 'PL', dialCode: '+48', name: 'Polonia' },
  { code: 'PT', dialCode: '+351', name: 'Portugal' },
  { code: 'CZ', dialCode: '+420', name: 'Rep\u00fablica Checa' },
  { code: 'RO', dialCode: '+40', name: 'Ruman\u00eda' },
  { code: 'SE', dialCode: '+46', name: 'Suecia' },
];

const DEFAULT_COUNTRY = EUROPEAN_CALLING_CODES[0];

function splitPhoneNumber(value: string | null | undefined) {
  const trimmedValue = value?.trim() ?? '';
  const internationalValue = trimmedValue.startsWith('00')
    ? `+${trimmedValue.slice(2)}`
    : trimmedValue;
  const country = internationalValue.startsWith('+')
    ? [...EUROPEAN_CALLING_CODES]
        .sort((left, right) => right.dialCode.length - left.dialCode.length)
        .find((item) => internationalValue.startsWith(item.dialCode))
    : undefined;

  return {
    country: country ?? DEFAULT_COUNTRY,
    nationalNumber: (country
      ? internationalValue.slice(country.dialCode.length)
      : internationalValue
    ).replace(/\D/g, ''),
  };
}

function joinPhoneNumber(country: CountryCallingCode, nationalNumber: string) {
  const digits = nationalNumber.replace(/\D/g, '');
  return digits ? `${country.dialCode}${digits}` : '';
}

export default function ProfileConfigurationScreen() {
  const router = useRouter();
  const {
    authenticatedUserProfile: userProfile,
    isImpersonating,
    refreshUserProfile,
    session,
  } = useAuth();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [savingMasterData, setSavingMasterData] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_COUNTRY);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);

  useEffect(() => {
    const parsedPhoneNumber = splitPhoneNumber(userProfile?.phone_number);
    setFirstName(userProfile?.first_name ?? '');
    setLastName(userProfile?.last_name ?? '');
    setPhoneCountry(parsedPhoneNumber.country);
    setPhoneNumber(parsedPhoneNumber.nationalNumber);
  }, [userProfile?.first_name, userProfile?.last_name, userProfile?.phone_number]);

  useEffect(() => {
    let active = true;

    const loadAvatar = async () => {
      if (!userProfile?.avatar_path) {
        setAvatarUrl(null);
        return;
      }

      const { data, error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(userProfile.avatar_path, 60 * 60, {
          cacheNonce: String(Date.now()),
        });
      if (!active) return;
      setAvatarUrl(error ? null : data.signedUrl);
    };

    void loadAvatar();
    return () => {
      active = false;
    };
  }, [userProfile?.avatar_path]);

  if (isImpersonating || !userProfile || !session?.user) {
    return (
      <View style={styles.denied}>
        <Text style={styles.secondary}>
          La configuración del perfil está disponible para el usuario autenticado.
        </Text>
      </View>
    );
  }

  const pickPhoto = async () => {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permiso necesario',
          'Permite el acceso a tus fotos para seleccionar una imagen de perfil.'
        );
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      mediaTypes: ['images'],
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      setAsset(result.assets[0]);
    }
  };

  const uploadPhoto = async (croppedUri: string) => {
    if (saving) return;
    setSaving(true);
    const previousPath = userProfile.avatar_path;
    const nextPath = `${userProfile.company_id}/${userProfile.user_id}/avatar-${Date.now()}.jpg`;

    try {
      const response = await fetch(croppedUri);
      const file = await response.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(nextPath, file, {
          cacheControl: '3600',
          contentType: 'image/jpeg',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { error: profileError } = await supabase.rpc('update_own_avatar_path', {
        new_avatar_path: nextPath,
      });
      if (profileError) {
        await supabase.storage.from(AVATAR_BUCKET).remove([nextPath]);
        throw profileError;
      }

      if (previousPath && previousPath !== nextPath) {
        await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]);
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(nextPath, 60 * 60, { cacheNonce: String(Date.now()) });
      if (signedError) throw signedError;

      setAvatarUrl(signedData.signedUrl);
      setAsset(null);
      await refreshUserProfile();
      Alert.alert('Foto guardada', 'Tu foto de perfil se ha actualizado.');
    } catch (uploadError: any) {
      Alert.alert(
        'No se pudo guardar la foto',
        uploadError.message || 'Inténtalo de nuevo.'
      );
    } finally {
      setSaving(false);
    }
  };

  const removePhoto = async () => {
    const previousPath = userProfile.avatar_path;
    if (!previousPath || removing) return;

    setRemoving(true);
    try {
      const { error: profileError } = await supabase.rpc('update_own_avatar_path', {
        new_avatar_path: null,
      });
      if (profileError) throw profileError;

      await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]);
      setAvatarUrl(null);
      await refreshUserProfile();
    } catch (removeError: any) {
      Alert.alert(
        'No se pudo eliminar la foto',
        removeError.message || 'Inténtalo de nuevo.'
      );
    } finally {
      setRemoving(false);
    }
  };

  const saveMasterData = async () => {
    if (savingMasterData) return;
    setSavingMasterData(true);
    try {
      const originalPhoneNumber = splitPhoneNumber(userProfile.phone_number);
      const phoneNumberChanged =
        phoneCountry.code !== originalPhoneNumber.country.code ||
        phoneNumber.replace(/\D/g, '') !== originalPhoneNumber.nationalNumber;
      const storedPhoneNumber = phoneNumberChanged
        ? joinPhoneNumber(phoneCountry, phoneNumber)
        : (userProfile.phone_number ?? '');
      const { error } = await supabase.rpc('update_own_master_data', {
        selected_first_name: firstName,
        selected_last_name: lastName,
        selected_phone_number: storedPhoneNumber,
      });
      if (error) throw error;

      await refreshUserProfile();
      Alert.alert('Datos guardados', 'Tus datos personales se han actualizado.');
    } catch (saveError: any) {
      Alert.alert(
        'No se pudieron guardar los datos',
        saveError.message || 'Comprueba los datos e inténtalo de nuevo.'
      );
    } finally {
      setSavingMasterData(false);
    }
  };

  const name = [userProfile.first_name, userProfile.last_name].filter(Boolean).join(' ');
  const originalPhoneNumber = splitPhoneNumber(userProfile.phone_number);
  const masterDataChanged =
    firstName.trim() !== (userProfile.first_name ?? '') ||
    lastName.trim() !== (userProfile.last_name ?? '') ||
    phoneCountry.code !== originalPhoneNumber.country.code ||
    phoneNumber.replace(/\D/g, '') !== originalPhoneNumber.nationalNumber;

  return (
    <>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoider}>
      <AdminScrollScreen
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Volver"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Feather color={adminColors.textPrimary} name="arrow-left" size={18} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>CONFIGURACIÓN</Text>
            <Text style={styles.title}>Mi perfil</Text>
          </View>
        </View>

        <AdminCard style={styles.photoCard}>
          <ProfileAvatar
            firstName={userProfile.first_name}
            imageUrl={avatarUrl}
            lastName={userProfile.last_name}
            size={120}
          />
          <Text style={styles.name}>{name || 'Cliente'}</Text>
          <Text style={styles.help}>
            Selecciona una foto y ajusta el encuadre dentro del círculo.
          </Text>
          <PrimaryButton
            disabled={saving || removing || savingMasterData}
            onPress={() => void pickPhoto()}>
            {avatarUrl ? 'Cambiar foto' : 'Añadir foto'}
          </PrimaryButton>
          {avatarUrl ? (
            <PrimaryButton
              disabled={saving || removing || savingMasterData}
              onPress={() => void removePhoto()}
              secondary>
              {removing ? 'Eliminando…' : 'Eliminar foto'}
            </PrimaryButton>
          ) : null}
        </AdminCard>

        <SectionHeading title="Datos personales" />
        <AdminCard style={styles.dataCard}>
          <AdminTextInput
            autoCapitalize="words"
            editable={!savingMasterData}
            label="Nombre"
            onChangeText={setFirstName}
            value={firstName}
          />
          <AdminTextInput
            autoCapitalize="words"
            editable={!savingMasterData}
            label="Apellidos"
            onChangeText={setLastName}
            value={lastName}
          />
          <AdminTextInput
            editable={false}
            label="Correo de acceso"
            value={session.user.email ?? '—'}
          />
          <Text style={styles.emailHint}>
            El correo pertenece al inicio de sesión y requiere un proceso de cambio independiente.
          </Text>
          <View style={styles.phoneRow}>
            <View style={styles.countryField}>
              <Text style={styles.fieldLabel}>{'Pa\u00eds'}</Text>
              <Pressable
                accessibilityLabel={`Pa\u00eds y prefijo, ${phoneCountry.name} ${phoneCountry.dialCode}`}
                accessibilityRole="button"
                disabled={savingMasterData}
                onPress={() => {
                  Keyboard.dismiss();
                  setCountryPickerVisible(true);
                }}
                style={({ pressed }) => [
                  styles.countrySelect,
                  pressed && styles.pressed,
                ]}>
                <View style={styles.countryCopy}>
                  <Text numberOfLines={1} style={styles.countryName}>
                    {phoneCountry.name}
                  </Text>
                  <Text style={styles.dialCode}>{phoneCountry.dialCode}</Text>
                </View>
                <Feather color={adminColors.iconDefault} name="chevron-down" size={16} />
              </Pressable>
            </View>
            <View style={styles.phoneField}>
              <AdminTextInput
                editable={!savingMasterData}
                keyboardType="phone-pad"
                label={'Tel\u00e9fono'}
                onChangeText={setPhoneNumber}
                value={phoneNumber}
              />
            </View>
          </View>
        </AdminCard>

        <PrimaryButton
          disabled={!masterDataChanged || savingMasterData || saving || removing}
          onPress={() => void saveMasterData()}
          style={styles.saveDataButton}>
          {savingMasterData ? 'Guardando…' : 'Guardar cambios'}
        </PrimaryButton>
      </AdminScrollScreen>
      </KeyboardAvoidingView>

      <AvatarEditor
        asset={asset}
        onCancel={() => {
          if (!saving) setAsset(null);
        }}
        onConfirm={uploadPhoto}
        saving={saving}
      />

      <Modal
        animationType="fade"
        onRequestClose={() => setCountryPickerVisible(false)}
        transparent
        visible={countryPickerVisible}>
        <View style={styles.modalOverlay}>
          <Pressable
            accessibilityLabel={'Cerrar selector de pa\u00eds'}
            onPress={() => setCountryPickerVisible(false)}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.countrySheet}>
            <View style={styles.countrySheetHeader}>
              <Text style={styles.countrySheetTitle}>{'Seleccionar pa\u00eds'}</Text>
              <Pressable
                accessibilityLabel="Cerrar"
                accessibilityRole="button"
                onPress={() => setCountryPickerVisible(false)}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                <Feather color={adminColors.textPrimary} name="x" size={18} />
              </Pressable>
            </View>
            <FlatList
              data={EUROPEAN_CALLING_CODES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => {
                const selected = item.code === phoneCountry.code;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setPhoneCountry(item);
                      setCountryPickerVisible(false);
                    }}
                    style={({ pressed }) => [
                      styles.countryOption,
                      selected && styles.countryOptionSelected,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={styles.countryOptionName}>{item.name}</Text>
                    <Text style={styles.countryOptionCode}>{item.dialCode}</Text>
                    <Feather
                      color={selected ? adminColors.amber : 'transparent'}
                      name="check"
                      size={17}
                    />
                  </Pressable>
                );
              }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  keyboardAvoider: {
    backgroundColor: adminColors.bgPage,
    flex: 1,
  },
  denied: {
    alignItems: 'center',
    backgroundColor: adminColors.bgPage,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  secondary: {
    ...adminType.secondary,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  backButton: {
    alignItems: 'center',
    borderColor: adminColors.borderStrong,
    borderRadius: 17,
    borderWidth: adminHairline,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    ...adminType.eyebrow,
  },
  title: {
    ...adminType.title,
    marginTop: 4,
  },
  photoCard: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
  },
  dataCard: {
    gap: 13,
  },
  phoneRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  countryField: {
    gap: 6,
    width: 138,
  },
  fieldLabel: {
    color: adminColors.textSecondary,
    fontSize: 11,
    fontWeight: '400',
  },
  countrySelect: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.borderInput,
    borderRadius: 8,
    borderWidth: adminHairline,
    flexDirection: 'row',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  countryCopy: {
    flex: 1,
    minWidth: 0,
  },
  countryName: {
    color: adminColors.textPrimary,
    fontSize: 11,
  },
  dialCode: {
    color: adminColors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  phoneField: {
    flex: 1,
    minWidth: 0,
  },
  emailHint: {
    color: adminColors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: -6,
  },
  saveDataButton: {
    marginTop: 22,
  },
  name: {
    ...adminType.section,
    marginTop: 2,
  },
  help: {
    ...adminType.secondary,
    lineHeight: 17,
    marginBottom: 4,
    maxWidth: 270,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  countrySheet: {
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.borderStrong,
    borderRadius: 8,
    borderWidth: adminHairline,
    maxHeight: '78%',
    maxWidth: 460,
    overflow: 'hidden',
    width: '100%',
  },
  countrySheetHeader: {
    alignItems: 'center',
    borderBottomColor: adminColors.border,
    borderBottomWidth: adminHairline,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  countrySheetTitle: {
    ...adminType.section,
  },
  closeButton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  countryOption: {
    alignItems: 'center',
    borderBottomColor: adminColors.border,
    borderBottomWidth: adminHairline,
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  countryOptionSelected: {
    backgroundColor: adminColors.amberTint,
  },
  countryOptionName: {
    ...adminType.body,
    flex: 1,
  },
  countryOptionCode: {
    color: adminColors.textSecondary,
    fontSize: 12,
    marginRight: 12,
  },
});
