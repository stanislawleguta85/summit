import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '@/components/admin/admin-ui';
import {
  adminColors,
  adminHairline,
  adminRadius,
  adminType,
} from '@/constants/admin-theme';

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
  confirmLabel = 'Aceptar',
  rejectLabel = 'Rechazar',
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
      <View style={styles.header}>
        <View style={styles.timeBlock}>
          <Text style={styles.time}>
            {start} – {end}
          </Text>
          <View style={styles.dateRow}>
            <Feather color={adminColors.iconDefault} name="calendar" size={13} />
            <Text style={styles.date}>{prettyDate}</Text>
          </View>
        </View>
        {isFull ? (
          <View style={styles.fullBadge}>
            <Text style={styles.fullBadgeText}>Lleno</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.divider} />

      <View style={styles.userRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.userContent}>
          <Text style={styles.userName} numberOfLines={2}>
            {fullName || 'Usuario desconocido'}
          </Text>
          <ProgressBar capacity={total} taken={booked} />
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          disabled={confirmDisabled}
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.button,
            styles.confirmButton,
            pressed && styles.pressed,
            confirmDisabled && styles.disabled,
          ]}>
          <Feather color={adminColors.amberOn} name="check" size={14} />
          <Text style={styles.confirmText}>{isFull ? 'Sin plazas' : confirmLabel}</Text>
        </Pressable>
        <Pressable
          disabled={disabled}
          onPress={onReject}
          style={({ pressed }) => [
            styles.button,
            styles.rejectButton,
            pressed && styles.pressed,
            disabled && styles.disabled,
          ]}>
          <Feather color={adminColors.textMuted} name="x" size={14} />
          <Text style={styles.rejectText}>{rejectLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.border,
    borderRadius: adminRadius.card,
    borderWidth: adminHairline,
    marginBottom: 8,
    padding: 14,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  timeBlock: {
    flex: 1,
    flexShrink: 1,
  },
  time: {
    ...adminType.rowTitle,
  },
  dateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 6,
  },
  date: {
    ...adminType.secondary,
    flexShrink: 1,
  },
  fullBadge: {
    backgroundColor: adminColors.urgentTint,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fullBadgeText: {
    color: adminColors.urgent,
    fontSize: 9,
    fontWeight: '500',
  },
  divider: {
    backgroundColor: adminColors.border,
    height: adminHairline,
    marginVertical: 12,
  },
  userRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  avatarText: {
    color: adminColors.textPrimary,
    fontSize: 11,
    fontWeight: '500',
  },
  userContent: {
    flex: 1,
    flexShrink: 1,
    gap: 8,
  },
  userName: {
    ...adminType.rowTitle,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  button: {
    alignItems: 'center',
    borderRadius: adminRadius.input,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 40,
  },
  confirmButton: {
    backgroundColor: adminColors.amber,
  },
  rejectButton: {
    borderColor: 'rgba(255,255,255,0.15)',
    borderWidth: adminHairline,
  },
  confirmText: {
    color: adminColors.amberOn,
    fontSize: 12,
    fontWeight: '500',
  },
  rejectText: {
    color: adminColors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.45,
  },
});
