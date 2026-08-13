import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { OwnerTabs } from '@/components/admin/owner-tabs';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme ?? 'light'];
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
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <Label>Home</Label>
        <Icon src={require('@/assets/images/tabIcons/home.png')} />
      </NativeTabs.Trigger>

      {canReadEligibleCourses ? (
        <NativeTabs.Trigger name="courses">
          <Label>Cursos</Label>
          <Icon src={require('@/assets/images/tabIcons/explore.png')} />
        </NativeTabs.Trigger>
      ) : null}

      {canReadAssignedCourses ? (
        <NativeTabs.Trigger name="classes">
          <Label>Clases</Label>
          <Icon src={require('@/assets/images/tabIcons/explore.png')} />
        </NativeTabs.Trigger>
      ) : null}

      {canReadAssignedClients ? (
        <NativeTabs.Trigger name="clients">
          <Label>Clientes</Label>
          <Icon src={require('@/assets/images/tabIcons/explore.png')} />
        </NativeTabs.Trigger>
      ) : null}

      {canReadAssignedRequests ? (
        <NativeTabs.Trigger name="training-requests">
          <Label>Solicitudes</Label>
          <Icon src={require('@/assets/images/tabIcons/explore.png')} />
        </NativeTabs.Trigger>
      ) : null}

      {canReadOwnChanges || canReadAssignedChanges ? (
        <NativeTabs.Trigger name="changes">
          <Label>Cambios</Label>
          <Icon src={require('@/assets/images/tabIcons/explore.png')} />
        </NativeTabs.Trigger>
      ) : null}

      <NativeTabs.Trigger name="explore" hidden>
        <Label>Explore</Label>
        <Icon src={require('@/assets/images/tabIcons/explore.png')} />
      </NativeTabs.Trigger>

    </NativeTabs>
  );
}
