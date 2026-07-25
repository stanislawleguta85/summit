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
  logo_url: string | null;
};

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(true);
  const { signUp } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const loadCompanies = async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, description, logo_url')
        .order('name', { ascending: true });

      if (error) {
        console.error('Fehler beim Laden der Filialen:', error);
        Alert.alert('Fehler', 'Filialen konnten nicht geladen werden. Bitte lade die Seite neu.');
      } else if (data?.length) {
        setCompanies(data);
        setSelectedCompanyId(data[0].id);
      }

      setCompanyLoading(false);
    };

    loadCompanies();
  }, []);

  const handleSignup = async () => {
    if (!email || !password || !confirmPassword || !firstName || !lastName || !selectedCompanyId) {
      Alert.alert('Fehler', 'Bitte alle Felder ausfüllen und eine Filiale wählen');
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
      await signUp(email, password, firstName, lastName, selectedCompanyId);
      Alert.alert(
        'Erfolg',
        'Registrierung erfolgreich! Bitte überprüfe deine Email.',
        [{ text: 'OK', onPress: () => router.push('/auth/login') }]
      );
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

      <Text style={styles.sectionTitle}>Filiale wählen</Text>
      {companyLoading ? (
        <ActivityIndicator style={styles.companyLoader} />
      ) : companies.length === 0 ? (
        <Text style={styles.errorText}>Keine Filialen gefunden. Versuche es später erneut.</Text>
      ) : (
        <View style={styles.companyList}>
          {companies.map((company) => (
            <TouchableOpacity
              key={company.id}
              style={[
                styles.companyItem,
                selectedCompanyId === company.id && styles.companyItemSelected,
              ]}
              onPress={() => setSelectedCompanyId(company.id)}
              disabled={loading}
            >
              <Text style={styles.companyName}>{company.name}</Text>
              {company.description ? <Text style={styles.companyDescription}>{company.description}</Text> : null}
            </TouchableOpacity>
          ))}
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
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSignup}
        disabled={loading}
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
  sectionTitle: {
    fontSize: 14,
    color: '#444',
    marginBottom: 8,
    marginTop: 10,
    fontWeight: '600',
  },
  companyList: {
    marginBottom: 15,
  },
  companyItem: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  companyItemSelected: {
    borderColor: '#208AEF',
    backgroundColor: '#e7f2ff',
  },
  companyName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
  companyDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  companyLoader: {
    marginBottom: 15,
  },
  errorText: {
    color: '#b00020',
    marginBottom: 15,
  },
});
