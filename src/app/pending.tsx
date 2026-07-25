import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'expo-router';

export default function PendingScreen() {
  const { userProfile, signOut } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    Alert.alert('Abmelden', 'Möchtest du dich abmelden?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Abmelden',
        onPress: async () => {
          await signOut();
        },
        style: 'destructive',
      },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Willkommen! 👋</Text>
        <Text style={styles.subtitle}>
          Hallo {userProfile?.first_name}, danke dass du dich registriert hast!
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔔 Dein Konto wartet auf Bestätigung</Text>
        <Text style={styles.cardText}>
          Der Studio-Inhaber muss dein Konto zuerst genehmigen, bevor du Zugriff auf alle Kurse und
          Features hast.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📋 Was siehst du jetzt?</Text>
        <Text style={styles.cardText}>
          • Studio-Informationen und Stammdaten{'\n'}
          • Öffnungszeiten und Kontakt{'\n'}
          • Allgemeine Informationen
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>✨ Was kommt später?</Text>
        <Text style={styles.cardText}>
          Sobald dein Konto genehmigt wird, erhältst du:{'\n'}
          • Zugriff auf alle Kurse{'\n'}
          • Buchung von Trainingseinheiten{'\n'}
          • Persönliche Trainingspläne{'\n'}
          • Benachrichtigungen und Updates
        </Text>
      </View>

      <View style={styles.info}>
        <Text style={styles.infoText}>
          ⏱️ Bestätigung erfolgt normalerweise innerhalb von 24 Stunden.
        </Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleLogout}>
        <Text style={styles.buttonText}>Abmelden</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  header: {
    marginBottom: 30,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#208AEF',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#000',
  },
  cardText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  info: {
    backgroundColor: '#E8F4FE',
    padding: 15,
    borderRadius: 8,
    marginBottom: 30,
  },
  infoText: {
    fontSize: 14,
    color: '#0066CC',
    textAlign: 'center',
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#f44336',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 40,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
