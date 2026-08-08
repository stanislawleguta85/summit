import { StyleSheet } from 'react-native';

export const adminColors = {
  bgPage: '#0b0b0c',
  bgCard: '#17171a',
  bgCardMuted: '#131316',

  border: 'rgba(255,255,255,0.08)',
  borderInput: 'rgba(255,255,255,0.10)',
  borderStrong: 'rgba(255,255,255,0.12)',

  textPrimary: '#f5f5f0',
  textSecondary: '#8f8e88',
  textMuted: '#6b6a65',
  textFaint: '#5f5e5a',
  textDisabled: '#3f3f3d',
  iconDefault: '#9b9a94',

  amber: '#e0ac52',
  amberOn: '#241505',
  amberTint: 'rgba(224,172,82,0.14)',
  amberAvatar: 'rgba(224,172,82,0.20)',

  urgent: '#e2684a',
  urgentOn: '#2a0e08',
  urgentTint: 'rgba(226,104,74,0.14)',
  urgentBg: 'rgba(226,104,74,0.08)',
  urgentBorder: 'rgba(226,104,74,0.25)',

  available: '#6fc27a',
  availableTint: 'rgba(111,194,122,0.14)',
  warning: '#e08a3a',
  trackBg: 'rgba(255,255,255,0.08)',
} as const;

export const adminRadius = {
  card: 12,
  calendar: 16,
  input: 10,
  iconBox: 10,
  chip: 8,
  day: 7,
  pill: 999,
} as const;

export const adminSpacing = {
  screen: 20,
  card: 14,
  section: 20,
  item: 8,
  iconText: 10,
} as const;

export const adminHairline = StyleSheet.hairlineWidth;

export const adminType = {
  eyebrow: {
    color: adminColors.amber,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: adminColors.textPrimary,
    fontSize: 19,
    fontWeight: '500',
  },
  section: {
    color: adminColors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
  },
  rowTitle: {
    color: adminColors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
  body: {
    color: adminColors.textPrimary,
    fontSize: 13,
    fontWeight: '400',
  },
  secondary: {
    color: adminColors.textSecondary,
    fontSize: 11,
    fontWeight: '400',
  },
  label: {
    color: adminColors.textSecondary,
    fontSize: 10,
    fontWeight: '400',
  },
  kpi: {
    color: adminColors.textPrimary,
    fontSize: 19,
    fontWeight: '500',
  },
  badge: {
    fontSize: 9,
    fontWeight: '500',
  },
} as const;

// Compatibility alias for the existing detail screens while they are migrated.
export const AdminColors = {
  background: adminColors.bgPage,
  surface: adminColors.bgCard,
  surfaceRaised: adminColors.bgCardMuted,
  border: adminColors.border,
  primary: adminColors.amber,
  primaryMuted: adminColors.amberTint,
  textPrimary: adminColors.textPrimary,
  textSecondary: adminColors.textSecondary,
  textMuted: adminColors.textMuted,
  danger: adminColors.urgent,
  success: adminColors.available,
} as const;
