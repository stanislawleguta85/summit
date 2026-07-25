import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

export default function DevSignOut() {
  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      // Also remove any leftover localStorage tokens as a fallback
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          Object.keys(localStorage)
            .filter((k) => k.toLowerCase().includes('supabase') || k.toLowerCase().includes('sb:') || k.toLowerCase().includes('auth'))
            .forEach((k) => localStorage.removeItem(k));
        }
      } catch (e) {
        // ignore
      }

      Alert.alert('Abgemeldet', 'Du wurdest abgemeldet.');
      // reload to clear any local UI state
      if (typeof window !== 'undefined') window.location.reload();
    } catch (err: any) {
      console.warn('Dev signOut failed', err);
      Alert.alert('Fehler', err.message || 'Abmelden fehlgeschlagen');
    }
  };

  return (
    <TouchableOpacity style={styles.button} onPress={handleSignOut}>
      <Text style={styles.text}>Dev Sign Out</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: Platform.OS === 'web' ? ('fixed' as any) : ('absolute' as any),
    top: 12,
    right: 12,
    backgroundColor: '#fff',
    borderColor: '#208AEF',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    zIndex: 99999,
    pointerEvents: 'auto',
  },
  text: {
    color: '#208AEF',
    fontWeight: '600',
  },
});
