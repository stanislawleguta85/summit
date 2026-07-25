import React, { useEffect, useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';

const DEV_KEY = 'dev_is_admin';

export default function DevAdminToggle({ onChange }: { onChange?: (v: boolean) => void }) {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(DEV_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(DEV_KEY, enabled ? 'true' : 'false');
    } catch {}
    onChange?.(enabled);
  }, [enabled]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, enabled && styles.buttonOn]}
        onPress={() => setEnabled((s) => !s)}
      >
        <Text style={[styles.text, enabled && styles.textOn]}>{enabled ? 'Dev Admin ON' : 'Dev Admin OFF'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 12, left: 12, zIndex: 9999 },
  button: {
    backgroundColor: '#fff',
    borderColor: '#999',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  buttonOn: {
    borderColor: '#4CAF50',
  },
  text: { color: '#333', fontWeight: '600' },
  textOn: { color: '#4CAF50' },
});
