import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { adminColors, adminHairline } from '@/constants/admin-theme';

const ICON_SLOT = 30;

function TabIcon({ children, focused }: { children: ReactNode; focused: boolean }) {
  return (
    <View style={[styles.iconSlot, focused && styles.iconSlotFocused]}>
      {children}
    </View>
  );
}

function TabLabel({ focused, label }: { focused: boolean; label: string }) {
  return <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text>;
}

export function OwnerTabs({ trainerEnabled = false }: { trainerEnabled?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeIconColor = adminColors.bgPage;
  const inactiveIconColor = adminColors.textMuted;

  return (
    <Fragment>
      <StatusBar style="light" />
      <Tabs
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: adminColors.bgPage },
        tabBarActiveTintColor: adminColors.amber,
        tabBarInactiveTintColor: adminColors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 66 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 6),
          },
        ],
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: ({ focused }) => <TabLabel focused={focused} label="Home" />,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <Feather
                color={focused ? activeIconColor : inactiveIconColor}
                name="home"
                size={focused ? 15 : 18}
              />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="classes"
        options={{
          title: 'Clases',
          tabBarLabel: ({ focused }) => <TabLabel focused={focused} label="Clases" />,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <MaterialCommunityIcons
                color={focused ? activeIconColor : inactiveIconColor}
                name="run"
                size={focused ? 15 : 18}
              />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="metrics"
        options={{
          title: 'Métricas',
          tabBarLabel: ({ focused }) => <TabLabel focused={focused} label="Métricas" />,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <MaterialCommunityIcons
                color={focused ? activeIconColor : inactiveIconColor}
                name="calendar-month-outline"
                size={focused ? 15 : 18}
              />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          href: trainerEnabled ? undefined : null,
          title: 'Clientes',
          tabBarLabel: ({ focused }) => <TabLabel focused={focused} label="Clientes" />,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <Feather
                color={focused ? activeIconColor : inactiveIconColor}
                name="users"
                size={focused ? 15 : 18}
              />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="training-requests"
        options={{
          href: trainerEnabled ? undefined : null,
          title: 'Solicitudes',
          tabBarLabel: ({ focused }) => <TabLabel focused={focused} label="Solicitudes" />,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <Feather
                color={focused ? activeIconColor : inactiveIconColor}
                name="calendar"
                size={focused ? 15 : 18}
              />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.replace('/admin');
          },
        }}
        options={{
          title: 'Admin',
          popToTopOnBlur: true,
          tabBarLabel: ({ focused }) => <TabLabel focused={focused} label="Admin" />,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <Feather
                color={focused ? activeIconColor : inactiveIconColor}
                name="user"
                size={focused ? 15 : 18}
              />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="courses" options={{ href: null }} />
      <Tabs.Screen name="changes" options={{ href: null }} />
      </Tabs>
    </Fragment>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: adminColors.bgPage,
    borderTopColor: adminColors.border,
    borderTopWidth: adminHairline,
    elevation: 0,
    paddingTop: 10,
  },
  item: {
    paddingTop: 0,
  },
  label: {
    color: adminColors.textMuted,
    fontSize: 10,
    fontWeight: '400',
    marginTop: 1,
  },
  labelFocused: {
    color: adminColors.amber,
    fontWeight: '500',
  },
  iconSlot: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: ICON_SLOT / 2,
    height: ICON_SLOT,
    justifyContent: 'center',
    width: ICON_SLOT,
  },
  iconSlotFocused: {
    backgroundColor: adminColors.amber,
  },
});
