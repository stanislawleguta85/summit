import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewProps,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  adminColors,
  adminHairline,
  adminRadius,
  adminSpacing,
  adminType,
} from '@/constants/admin-theme';
import { ProfileAvatar } from '@/components/profile-avatar';

type FeatherName = ComponentProps<typeof Feather>['name'];

type AdminScrollScreenProps = ScrollViewProps & {
  children: ReactNode;
  includeTabInset?: boolean;
  includeTopInset?: boolean;
};

export function AdminScrollScreen({
  children,
  contentContainerStyle,
  includeTabInset = true,
  includeTopInset = true,
  ...props
}: AdminScrollScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      {...props}
      style={[styles.screen, props.style]}
      contentContainerStyle={[
        styles.screenContent,
        {
          paddingTop: includeTopInset ? insets.top + 18 : 18,
          paddingBottom: includeTabInset ? insets.bottom + 94 : insets.bottom + 24,
        },
        contentContainerStyle,
      ]}>
      {children}
    </ScrollView>
  );
}

export function AdminHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string;
  title?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        {title ? <Text style={styles.title}>{title}</Text> : null}
      </View>
      {right ? <View style={styles.headerActions}>{right}</View> : null}
    </View>
  );
}

export function HeaderIconButton({
  accessibilityLabel,
  badge,
  badgeTone = 'amber',
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  badge?: number;
  badgeTone?: 'amber' | 'urgent';
  icon: FeatherName;
  onPress: () => void;
}) {
  const showBadge = typeof badge === 'number' && badge > 0;
  const badgeBackground =
    badgeTone === 'urgent' ? adminColors.urgent : adminColors.amber;
  const badgeColor = badgeTone === 'urgent' ? adminColors.urgentOn : adminColors.amberOn;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <Feather color={adminColors.iconDefault} name={icon} size={16} />
      {showBadge ? (
        <View style={[styles.badge, { backgroundColor: badgeBackground }]}>
          <Text style={[styles.badgeText, { color: badgeColor }]}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function SectionHeading({
  action,
  title,
}: {
  action?: ReactNode;
  title: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

export function AdminCard({
  children,
  muted = false,
  style,
}: {
  children: ReactNode;
  muted?: boolean;
  style?: object;
}) {
  return (
    <View style={[styles.card, muted && styles.cardMuted, style]}>
      {children}
    </View>
  );
}

export function ProgressBar({
  capacity,
  taken,
}: {
  capacity: number;
  taken: number;
}) {
  const percentage = capacity > 0 ? Math.min(100, Math.max(0, (taken / capacity) * 100)) : 0;

  return (
    <View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percentage}%` }]} />
      </View>
      <Text style={styles.progressLabel}>
        {taken} / {capacity} plazas
      </Text>
    </View>
  );
}

export function FilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function AdminTextInput(props: TextInputProps & { label?: string }) {
  return (
    <View style={styles.inputGroup}>
      {props.label ? <Text style={styles.inputLabel}>{props.label}</Text> : null}
      <TextInput
        {...props}
        placeholderTextColor={adminColors.textFaint}
        style={[styles.input, props.style]}
      />
    </View>
  );
}

export function SearchInput({
  onChangeText,
  placeholder,
  value,
}: {
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={styles.search}>
      <Feather color={adminColors.iconDefault} name="search" size={15} />
      <TextInput
        autoCapitalize="none"
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={adminColors.textFaint}
        returnKeyType="search"
        style={styles.searchInput}
        value={value}
      />
      <Pressable
        accessibilityLabel="Borrar búsqueda"
        accessibilityRole="button"
        disabled={!value}
        hitSlop={6}
        onPress={() => onChangeText('')}
        style={({ pressed }) => [
          styles.searchClear,
          !value && styles.searchClearHidden,
          pressed && styles.pressed,
        ]}>
        <Feather color={adminColors.iconDefault} name="x" size={16} />
      </Pressable>
    </View>
  );
}

export function SkeletonBlock({
  height = 58,
  style,
}: {
  height?: number;
  style?: object;
}) {
  return <View style={[styles.skeleton, { height }, style]} />;
}

export function EmptyState({
  actionLabel,
  message,
  onAction,
  title,
}: {
  actionLabel?: string;
  message?: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <AdminCard style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </AdminCard>
  );
}

export function InitialAvatar({
  firstName,
  imageUrl,
  lastName,
  staff = false,
}: {
  firstName?: string | null;
  imageUrl?: string | null;
  lastName?: string | null;
  staff?: boolean;
}) {
  return (
    <ProfileAvatar
      firstName={firstName}
      imageUrl={imageUrl}
      lastName={lastName}
      staff={staff}
    />
  );
}

export function ChevronRow({
  icon,
  label,
  onPress,
  secondary,
}: {
  icon?: FeatherName;
  label: string;
  onPress?: () => void;
  secondary?: string;
}) {
  const content = (
    <>
      {icon ? (
        <View style={styles.rowIcon}>
          <Feather color={adminColors.iconDefault} name={icon} size={15} />
        </View>
      ) : null}
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{label}</Text>
        {secondary ? <Text style={styles.rowSecondary}>{secondary}</Text> : null}
      </View>
      <Feather color={adminColors.textMuted} name="chevron-right" size={15} />
    </>
  );

  if (!onPress) {
    return <View style={styles.chevronRow}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chevronRow, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

export function PrimaryButton({
  children,
  disabled,
  onPress,
  secondary = false,
  style,
}: {
  children: ReactNode;
  disabled?: boolean;
  onPress: () => void;
  secondary?: boolean;
  style?: object;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        secondary && styles.secondaryButton,
        style,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.primaryButtonText, secondary && styles.secondaryButtonText]}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: adminColors.bgPage,
    flex: 1,
  },
  screenContent: {
    paddingHorizontal: adminSpacing.screen,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: adminSpacing.section,
  },
  headerCopy: {
    flex: 1,
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 12,
  },
  eyebrow: {
    ...adminType.eyebrow,
  },
  title: {
    ...adminType.title,
    marginTop: 6,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.border,
    borderRadius: adminRadius.iconBox,
    borderWidth: adminHairline,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  badge: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 15,
    minWidth: 15,
    paddingHorizontal: 3,
    position: 'absolute',
    right: -5,
    top: -5,
  },
  badgeText: {
    ...adminType.badge,
  },
  pressed: {
    opacity: 0.7,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: adminSpacing.section,
  },
  sectionTitle: {
    ...adminType.section,
  },
  card: {
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.border,
    borderRadius: adminRadius.card,
    borderWidth: adminHairline,
    padding: adminSpacing.card,
  },
  cardMuted: {
    backgroundColor: adminColors.bgCardMuted,
  },
  progressTrack: {
    backgroundColor: adminColors.trackBg,
    borderRadius: 2,
    height: 4,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: adminColors.amber,
    borderRadius: 2,
    height: '100%',
  },
  progressLabel: {
    ...adminType.secondary,
    marginTop: 7,
  },
  chip: {
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.borderInput,
    borderRadius: adminRadius.chip,
    borderWidth: adminHairline,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActive: {
    backgroundColor: adminColors.amber,
    borderColor: adminColors.amber,
  },
  chipText: {
    color: adminColors.textMuted,
    fontSize: 12,
    fontWeight: '400',
  },
  chipTextActive: {
    color: adminColors.amberOn,
    fontWeight: '500',
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    color: adminColors.textSecondary,
    fontSize: 11,
    fontWeight: '400',
  },
  input: {
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.borderInput,
    borderRadius: adminRadius.input,
    borderWidth: adminHairline,
    color: adminColors.textPrimary,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  search: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.borderInput,
    borderRadius: adminRadius.input,
    borderWidth: adminHairline,
    flexDirection: 'row',
    gap: 9,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: adminColors.textPrimary,
    flex: 1,
    fontSize: 13,
    paddingVertical: 9,
  },
  searchClear: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  searchClearHidden: {
    opacity: 0,
  },
  skeleton: {
    backgroundColor: adminColors.bgCard,
    borderRadius: adminRadius.card,
    marginBottom: 8,
    opacity: 0.72,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  emptyTitle: {
    ...adminType.rowTitle,
    textAlign: 'center',
  },
  emptyMessage: {
    ...adminType.secondary,
    marginTop: 6,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: adminColors.amber,
    borderColor: adminColors.amber,
    borderRadius: adminRadius.input,
    borderWidth: adminHairline,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  primaryButtonText: {
    color: adminColors.amberOn,
    fontSize: 13,
    fontWeight: '500',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  secondaryButtonText: {
    color: adminColors.textMuted,
  },
  disabled: {
    opacity: 0.45,
  },
  chevronRow: {
    alignItems: 'center',
    borderBottomColor: adminColors.border,
    borderBottomWidth: adminHairline,
    flexDirection: 'row',
    gap: adminSpacing.iconText,
    minHeight: 49,
    paddingVertical: 9,
  },
  rowIcon: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  rowCopy: {
    flex: 1,
    flexShrink: 1,
  },
  rowTitle: {
    ...adminType.rowTitle,
  },
  rowSecondary: {
    ...adminType.secondary,
    marginTop: 2,
  },
});
