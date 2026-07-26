import { Pressable, StyleSheet, Text, View } from 'react-native';

const COLORS = {
  background: '#080808',
  surface: '#141414',
  surfaceRaised: '#1C1C1C',
  border: '#2A2A2A',
  primary: '#F2C300',
  primaryPressed: '#D8AE00',
  textPrimary: '#FFFFFF',
  textSecondary: '#B5B5B5',
};

type Requester = {
  firstName: string;
  lastName: string;
};

type AdminRequestCardProps = {
  requester: Requester;
  start: string;
  end: string;
  prettyDate: string;
  booked: number;
  total: number;
  isFull?: boolean;
  disabled?: boolean;
  confirmLabel?: string;
  rejectLabel?: string;
  onConfirm: () => void;
  onReject: () => void;
};

export function AdminRequestCard({
  requester,
  start,
  end,
  prettyDate,
  booked,
  total,
  isFull = false,
  disabled = false,
  confirmLabel = 'Bestätigen',
  rejectLabel = 'Ablehnen',
  onConfirm,
  onReject,
}: AdminRequestCardProps) {
  const fullName = `${requester.firstName} ${requester.lastName}`.trim();
  const initials =
    [requester.firstName, requester.lastName]
      .filter(Boolean)
      .map((name) => name.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2) || '?';
  const confirmDisabled = disabled || isFull;

  return (
    <View style={styles.card}>
      <View pointerEvents="none" style={styles.lightEdge} />

      <View style={styles.content}>
        <View>
          <Text style={styles.time}>
            {start} – {end}
          </Text>

          <View style={styles.dateRow}>
            <View style={styles.calendarIcon} accessibilityElementsHidden>
              <View style={styles.calendarTop} />
              <View style={styles.calendarDot} />
            </View>
            <Text style={styles.date}>{prettyDate}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.userRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>

          <View style={styles.userContent}>
            <Text style={styles.userName} numberOfLines={1}>
              {fullName || 'Unbekannter Benutzer'}
            </Text>
            <Text style={styles.capacityText}>
              <Text style={styles.capacityStrong}>
                {booked} / {total} Plätze{' '}
              </Text>
              <Text>belegt</Text>
            </Text>
            <CapacityBar booked={booked} total={total} />
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={confirmDisabled}
            onPress={onConfirm}
            style={({ pressed }) => [
              styles.button,
              styles.confirmButton,
              pressed && !confirmDisabled && styles.confirmButtonPressed,
              confirmDisabled && styles.buttonDisabled,
            ]}>
            <Text style={styles.confirmButtonText}>{isFull ? 'Ausgebucht' : `✓  ${confirmLabel}`}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onReject}
            style={({ pressed }) => [
              styles.button,
              styles.rejectButton,
              pressed && !disabled && styles.rejectButtonPressed,
              disabled && styles.buttonDisabled,
            ]}>
            <Text style={styles.rejectButtonText}>×  {rejectLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function CapacityBar({ booked, total }: { booked: number; total: number }) {
  const segmentCount = 10;
  const ratio = total > 0 ? Math.min(Math.max(booked / total, 0), 1) : 0;
  const filledSegments = Math.round(ratio * segmentCount);

  return (
    <View
      accessibilityLabel={`${booked} von ${total} Plätzen belegt`}
      accessibilityRole="progressbar"
      style={styles.capacityBar}>
      {Array.from({ length: segmentCount }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.capacitySegment,
            index < filledSegments ? styles.capacitySegmentFilled : styles.capacitySegmentEmpty,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    width: '96%',
    maxWidth: 520,
    position: 'relative',
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.primary,
    marginBottom: 16,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: -10, height: 0 },
    elevation: 2,
  },
  lightEdge: {
    position: 'absolute',
    left: -1,
    top: 27,
    bottom: 27,
    width: 2,
    backgroundColor: 'rgba(242, 195, 0, 0.26)',
    shadowColor: COLORS.primary,
    shadowOpacity: 0.99,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    zIndex: 2,
    elevation: 12,
  },
  content: {
    zIndex: 1,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 24,
  },
  time: {
    color: COLORS.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  dateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 12,
  },
  calendarIcon: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: 7,
    height: 24,
    justifyContent: 'center',
    marginRight: 10,
    overflow: 'hidden',
    width: 24,
  },
  calendarTop: {
    backgroundColor: COLORS.primary,
    height: 3,
    left: 5,
    position: 'absolute',
    right: 5,
    top: 5,
  },
  calendarDot: {
    backgroundColor: COLORS.textSecondary,
    borderRadius: 2,
    height: 4,
    marginTop: 5,
    width: 4,
  },
  date: {
    color: COLORS.textSecondary,
    flex: 1,
    fontSize: 15,
  },
  divider: {
    backgroundColor: COLORS.border,
    height: 1,
    marginVertical: 18,
    opacity: 0.9,
  },
  userRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceRaised,
    borderColor: '#333333',
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    marginRight: 12,
    width: 40,
  },
  avatarText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  userContent: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  capacityText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    marginTop: 8,
  },
  capacityStrong: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  capacityBar: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 11,
    marginBottom: 2,
  },
  capacitySegment: {
    borderRadius: 999,
    flex: 1,
    height: 6,
  },
  capacitySegmentFilled: {
    backgroundColor: COLORS.primary,
  },
  capacitySegmentEmpty: {
    backgroundColor: COLORS.border,
    opacity: 0.7,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 24,
  },
  button: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 10,
  },
  confirmButton: {
    backgroundColor: COLORS.primary,
    marginRight: 8,
  },
  confirmButtonPressed: {
    backgroundColor: COLORS.primaryPressed,
    transform: [{ scale: 0.98 }],
  },
  confirmButtonText: {
    color: COLORS.background,
    fontSize: 14,
    fontWeight: '800',
  },
  rejectButton: {
    borderColor: '#454545',
    borderWidth: 1,
  },
  rejectButtonPressed: {
    backgroundColor: '#232323',
    transform: [{ scale: 0.98 }],
  },
  rejectButtonText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
