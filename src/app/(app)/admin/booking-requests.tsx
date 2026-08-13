import { Alert, StyleSheet, Text, View } from 'react-native';

import { AdminCard, AdminScrollScreen } from '@/components/admin/admin-ui';
import { AdminRequestCard } from '@/components/admin-request-card';
import { adminColors, adminType } from '@/constants/admin-theme';

const REQUEST_PREVIEWS = [
  {
    id: 'request-preview-1',
    requester: { firstName: 'Alex', lastName: 'López' },
    start: '08:00',
    end: '09:00',
    prettyDate: 'Jueves, 30 de enero',
    booked: 4,
    total: 10,
  },
  {
    id: 'request-preview-2',
    requester: { firstName: 'Marta', lastName: 'Ruiz' },
    start: '18:00',
    end: '19:00',
    prettyDate: 'Viernes, 31 de enero',
    booked: 8,
    total: 10,
  },
] as const;

export default function BookingRequestsScreen() {
  const showPreviewNotice = () => {
    Alert.alert(
      'Vista de desarrollo',
      'La acción se conectará cuando las solicitudes estén disponibles en el backend.'
    );
  };

  return (
    <AdminScrollScreen includeTopInset={false}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>SOLICITUDES ABIERTAS</Text>
        <Text style={styles.title}>Revisar reservas</Text>
        <Text style={styles.subtitle}>
          Acepta o rechaza solicitudes y controla la ocupación de cada clase.
        </Text>
      </View>

      {__DEV__ ? (
        <>
          <View style={styles.previewNotice}>
            <Text style={styles.previewNoticeTitle}>Datos de desarrollo</Text>
            <Text style={styles.previewNoticeText}>
              Estas tarjetas muestran la interfaz final. Todavía no modifican reservas.
            </Text>
          </View>

          {REQUEST_PREVIEWS.map((request) => (
            <AdminRequestCard
              booked={request.booked}
              end={request.end}
              key={request.id}
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
        <AdminCard style={styles.empty}>
          <Text style={styles.emptyTitle}>No hay solicitudes abiertas</Text>
          <Text style={styles.emptyText}>Las nuevas solicitudes aparecerán aquí.</Text>
        </AdminCard>
      )}
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
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
  previewNotice: {
    backgroundColor: adminColors.amberTint,
    borderColor: adminColors.border,
    borderRadius: 12,
    marginBottom: 12,
    padding: 14,
  },
  previewNoticeTitle: {
    color: adminColors.amber,
    fontSize: 13,
    fontWeight: '500',
  },
  previewNoticeText: {
    ...adminType.secondary,
    lineHeight: 17,
    marginTop: 4,
  },
  empty: {
    alignItems: 'center',
    padding: 28,
  },
  emptyTitle: {
    ...adminType.rowTitle,
  },
  emptyText: {
    ...adminType.secondary,
    marginTop: 6,
    textAlign: 'center',
  },
});
