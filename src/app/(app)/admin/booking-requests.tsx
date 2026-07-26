import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdminRequestCard } from '@/components/admin-request-card';
import { AdminColors } from '@/constants/admin-theme';

const REQUEST_PREVIEWS = [
  {
    id: 'request-preview-1',
    requester: { firstName: 'Alex', lastName: 'López' },
    start: '08:00',
    end: '09:00',
    prettyDate: 'Donnerstag, 30. Januar',
    booked: 4,
    total: 10,
  },
  {
    id: 'request-preview-2',
    requester: { firstName: 'Marta', lastName: 'Ruiz' },
    start: '18:00',
    end: '19:00',
    prettyDate: 'Freitag, 31. Januar',
    booked: 8,
    total: 10,
  },
] as const;

export default function BookingRequestsScreen() {
  const insets = useSafeAreaInsets();

  const showPreviewNotice = () => {
    Alert.alert(
      'UI-Vorschau',
      'Die Aktion wird mit den echten Buchungsanfragen verbunden, sobald diese Datenquelle in der App verfügbar ist.'
    );
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
      style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>OFFENE ANFRAGEN</Text>
        <Text style={styles.title}>Buchungen prüfen</Text>
        <Text style={styles.subtitle}>
          Bestätige oder lehne Anfragen ab und behalte die Kursauslastung im Blick.
        </Text>
      </View>

      {__DEV__ ? (
        <>
          <View style={styles.previewNotice}>
            <Text style={styles.previewNoticeTitle}>Entwicklungsdaten</Text>
            <Text style={styles.previewNoticeText}>
              Diese Cards zeigen das finale UI. Es werden noch keine Buchungen verändert.
            </Text>
          </View>

          {REQUEST_PREVIEWS.map((request) => (
            <AdminRequestCard
              key={request.id}
              booked={request.booked}
              end={request.end}
              onConfirm={showPreviewNotice}
              onReject={showPreviewNotice}
              prettyDate={request.prettyDate}
              requester={request.requester}
              start={request.start}
              total={request.total}
            />
          ))}
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Keine offenen Buchungsanfragen</Text>
          <Text style={styles.emptyText}>Neue Anfragen erscheinen später automatisch hier.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: AdminColors.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  header: {
    marginBottom: 22,
  },
  eyebrow: {
    color: AdminColors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    color: AdminColors.textPrimary,
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginTop: 7,
  },
  subtitle: {
    color: AdminColors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  previewNotice: {
    backgroundColor: AdminColors.primaryMuted,
    borderColor: '#4A4000',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
    padding: 14,
  },
  previewNoticeTitle: {
    color: AdminColors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  previewNoticeText: {
    color: AdminColors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  empty: {
    alignItems: 'center',
    backgroundColor: AdminColors.surface,
    borderColor: AdminColors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 28,
  },
  emptyTitle: {
    color: AdminColors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyText: {
    color: AdminColors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    textAlign: 'center',
  },
});
