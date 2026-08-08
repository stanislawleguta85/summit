import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import type { Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, useColorScheme, View, StyleSheet } from 'react-native';

import { ExternalLink } from './external-link';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { OwnerTabs } from './admin/owner-tabs';

export default function AppTabs() {
  const { hasPermission, hasRole } = useAuth();
  const isOwner = hasRole('owner');
  const canReadAssignedCourses = hasPermission('courses', 'read', 'assigned');
  const canReadEligibleCourses = hasPermission('courses', 'read', 'eligible');
  const canReadAssignedClients = hasPermission('clients', 'read', 'assigned');
  const canReadAssignedRequests = hasPermission(
    'training_requests',
    'read',
    'assigned'
  );
  const canReadOwnChanges =
    hasRole('customer') && hasPermission('booking_changes', 'read', 'own');
  const canReadAssignedChanges =
    hasRole('trainer') && hasPermission('booking_changes', 'read', 'assigned');

  if (isOwner) {
    return <OwnerTabs trainerEnabled={canReadAssignedCourses} />;
  }

  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/(app)" asChild>
            <TabButton>Home</TabButton>
          </TabTrigger>
          {canReadEligibleCourses ? (
            <TabTrigger name="courses" href="/(app)/courses" asChild>
              <TabButton>Cursos</TabButton>
            </TabTrigger>
          ) : null}
          {canReadAssignedCourses ? (
            <TabTrigger name="classes" href="/(app)/classes" asChild>
              <TabButton>Clases</TabButton>
            </TabTrigger>
          ) : null}
          {canReadAssignedClients ? (
            <TabTrigger name="clients" href="/(app)/clients" asChild>
              <TabButton>Clientes</TabButton>
            </TabTrigger>
          ) : null}
          {canReadAssignedRequests ? (
            <TabTrigger
              name="training-requests"
              href="/(app)/training-requests"
              asChild>
              <TabButton>Solicitudes</TabButton>
            </TabTrigger>
          ) : null}
          {canReadOwnChanges || canReadAssignedChanges ? (
            <TabTrigger name="changes" href={'/(app)/changes' as Href} asChild>
              <TabButton>Cambios</TabButton>
            </TabTrigger>
          ) : null}
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}>
        <ThemedText type="small" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme ?? 'light'];

  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        <ThemedText type="smallBold" style={styles.brandText}>
          Expo Starter
        </ThemedText>

        {props.children}

        <ExternalLink href="https://docs.expo.dev" asChild>
          <Pressable style={styles.externalPressable}>
            <ThemedText type="link">Docs</ThemedText>
            <SymbolView
              tintColor={colors.text}
              name="arrow.up.right.square"
              fallback={<ThemedText type="small">↗</ThemedText>}
              size={12}
            />
          </Pressable>
        </ExternalLink>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  brandText: {
    marginRight: 'auto',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  externalPressable: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.one,
    marginLeft: Spacing.three,
  },
});
