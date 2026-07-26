import { Link, type Href } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AdminColors } from '@/constants/admin-theme';

type AdminDashboardTileProps = {
  title: string;
  description: string;
  icon: SFSymbol;
  fallbackIcon: string;
  href: Href;
  count?: number;
  countLabel?: string;
  urgent?: boolean;
};

export function AdminDashboardTile({
  title,
  description,
  icon,
  fallbackIcon,
  href,
  count,
  countLabel,
  urgent = false,
}: AdminDashboardTileProps) {
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityHint={`Öffnet ${title}`}
        accessibilityRole="button"
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}>
        <View style={[styles.iconContainer, urgent && styles.iconContainerUrgent]}>
          <SymbolView
            fallback={<Text style={styles.fallbackIcon}>{fallbackIcon}</Text>}
            name={icon}
            size={25}
            tintColor={urgent ? AdminColors.danger : AdminColors.primary}
            weight="semibold"
          />
        </View>

        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        </View>

        <View style={styles.footer}>
          {typeof count === 'number' ? (
            <Text style={[styles.count, urgent && styles.countUrgent]}>
              {count} {countLabel}
            </Text>
          ) : (
            <View />
          )}
          <SymbolView
            fallback={<Text style={styles.chevronFallback}>›</Text>}
            name="chevron.right"
            size={12}
            tintColor={AdminColors.textMuted}
            weight="bold"
          />
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: AdminColors.surface,
    borderColor: AdminColors.border,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 190,
    padding: 16,
    width: '48.5%',
  },
  tilePressed: {
    backgroundColor: AdminColors.surfaceRaised,
    borderColor: '#4A4200',
    transform: [{ scale: 0.98 }],
  },
  iconContainer: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: AdminColors.primaryMuted,
    borderRadius: 13,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  iconContainerUrgent: {
    backgroundColor: '#2D1416',
  },
  fallbackIcon: {
    color: AdminColors.primary,
    fontSize: 20,
  },
  copy: {
    flex: 1,
    paddingTop: 15,
  },
  title: {
    color: AdminColors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  description: {
    color: AdminColors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  count: {
    color: AdminColors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  countUrgent: {
    color: AdminColors.danger,
  },
  chevronFallback: {
    color: AdminColors.textMuted,
    fontSize: 20,
    lineHeight: 20,
  },
});
