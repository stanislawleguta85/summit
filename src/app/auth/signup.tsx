import React, { useEffect, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';

type Company = {
  id: string;
  name: string;
  description: string | null;
};

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const loadCompanies = async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, description')
        .order('name');

      if (!active) return;

      if (error) {
        console.error('Error loading companies:', error);
        Alert.alert('Fehler', 'Die Filialen konnten nicht geladen werden.');
      } else {
        const availableCompanies = data ?? [];
        setCompanies(availableCompanies);

        if (availableCompanies.length === 1) {
          setSelectedCompanyId(availableCompanies[0].id);
        }
      }

      setCompaniesLoading(false);
    };

    void loadCompanies();

    return () => {
      active = false;
    };
  }, []);

  const handleSignup = async () => {
    if (
      !email ||
      !password ||
      !confirmPassword ||
      !firstName ||
      !lastName ||
      !phoneNumber ||
      !selectedCompanyId
    ) {
      Alert.alert('Fehler', 'Bitte alle Felder ausfüllen');
      return;
    }

    const cleanPhoneNumber = phoneNumber.trim();
    const phoneDigits = cleanPhoneNumber.replace(/\D/g, '');
    if (
      !/^[+0-9][0-9\s().-]*$/.test(cleanPhoneNumber) ||
      cleanPhoneNumber.length > 30 ||
      phoneDigits.length < 7 ||
      phoneDigits.length > 15
    ) {
      Alert.alert('Fehler', 'Bitte eine gültige Telefonnummer eingeben');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Fehler', 'Passwörter stimmen nicht überein');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Fehler', 'Passwort muss mindestens 6 Zeichen lang sein');
      return;
    }

    setLoading(true);
    try {
      const result = await signUp(
        email,
        password,
        firstName,
        lastName,
        cleanPhoneNumber,
        selectedCompanyId
      );

      if (result.requiresEmailConfirmation) {
        Alert.alert(
          'Registrierung erfolgreich',
          'Bitte bestätige jetzt deine E-Mail-Adresse. Danach kannst du dich anmelden.',
          [{ text: 'OK', onPress: () => router.replace('/auth/login') }]
        );
      } else {
        Alert.alert(
          'Registrierung erfolgreich',
          'Dein Konto wartet jetzt auf die Freigabe durch den Studio-Owner.'
        );
      }
    } catch (error: any) {
      Alert.alert('Registrierung Fehler', error.message || 'Registrierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Summit</Text>
      <Text style={styles.subtitle}>Neues Konto erstellen</Text>

      <TextInput
        style={styles.input}
        placeholder="Vorname"
        placeholderTextColor="#999"
        value={firstName}
        onChangeText={setFirstName}
        editable={!loading}
      />

      <TextInput
        style={styles.input}
        placeholder="Nachname"
        placeholderTextColor="#999"
        value={lastName}
        onChangeText={setLastName}
        editable={!loading}
      />

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#999"
        value={email}
        onChangeText={setEmail}
        editable={!loading}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Telefonnummer"
        placeholderTextColor="#999"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        editable={!loading}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />

      <Text style={styles.sectionTitle}>Filiale</Text>
      {companiesLoading ? (
        <ActivityIndicator style={styles.companiesLoading} color="#208AEF" />
      ) : companies.length === 0 ? (
        <Text style={styles.companyError}>
          Keine Filiale verfügbar. Bitte wende dich an das Studio.
        </Text>
      ) : (
        <View style={styles.companyList}>
          {companies.map((company) => {
            const selected = company.id === selectedCompanyId;

            return (
              <TouchableOpacity
                key={company.id}
                style={[styles.companyCard, selected && styles.companyCardSelected]}
                onPress={() => setSelectedCompanyId(company.id)}
                disabled={loading}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
              >
                <Text style={[styles.companyName, selected && styles.companyNameSelected]}>
                  {company.name}
                </Text>
                {company.description ? (
                  <Text style={styles.companyDescription}>{company.description}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <TextInput
        style={styles.input}
        placeholder="Passwort"
        placeholderTextColor="#999"
        value={password}
        onChangeText={setPassword}
        editable={!loading}
        secureTextEntry
      />

      <TextInput
        style={styles.input}
        placeholder="Passwort wiederholen"
        placeholderTextColor="#999"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        editable={!loading}
        secureTextEntry
      />

      <TouchableOpacity
        style={[
          styles.button,
          (loading || companiesLoading || companies.length === 0) && styles.buttonDisabled,
        ]}
        onPress={handleSignup}
        disabled={loading || companiesLoading || companies.length === 0}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Registrieren</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/auth/login')} disabled={loading}>
        <Text style={styles.linkText}>
          Du hast bereits ein Konto? <Text style={styles.linkBold}>Hier anmelden</Text>
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    justifyContent: 'center',
    minHeight: '100%',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: '#208AEF',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
  },
  sectionTitle: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  companiesLoading: {
    marginVertical: 16,
  },
  companyError: {
    color: '#b00020',
    marginBottom: 15,
  },
  companyList: {
    marginBottom: 5,
  },
  companyCard: {
    backgroundColor: '#fafafa',
    borderColor: '#ddd',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 12,
  },
  companyCardSelected: {
    backgroundColor: '#E8F4FE',
    borderColor: '#208AEF',
    borderWidth: 2,
  },
  companyName: {
    color: '#222',
    fontSize: 16,
    fontWeight: '600',
  },
  companyNameSelected: {
    color: '#0066CC',
  },
  companyDescription: {
    color: '#666',
    fontSize: 13,
    marginTop: 4,
  },
  button: {
    backgroundColor: '#208AEF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#666',
  },
  linkBold: {
    color: '#208AEF',
    fontWeight: '600',
  },
});
