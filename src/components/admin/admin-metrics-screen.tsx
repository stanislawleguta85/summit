import Feather from '@expo/vector-icons/Feather';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import {
  AdminCard,
  AdminHeader,
  AdminScrollScreen,
  SkeletonBlock,
} from '@/components/admin/admin-ui';
import {
  adminColors,
  adminHairline,
  adminRadius,
  adminType,
} from '@/constants/admin-theme';
import { useAdminData } from '@/hooks/use-admin-data';
import { localDateKey } from '@/lib/admin-data';

const MEMBER_BARS = [36, 45, 51, 58, 66, 74];
const PEAK_BARS = [25, 39, 46, 58, 91, 68, 42];
const PEAK_LABELS = ['07', '09', '12', '15', '18', '20', '22'];

export function AdminMetricsScreen() {
  const { courses, enrollments, profiles, loading, refreshing, error, reload } = useAdminData();
  const [monthOffset, setMonthOffset] = useState(0);
  const currentMonth = new Date();
  currentMonth.setMonth(currentMonth.getMonth() + monthOffset);
  const monthLabel = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(currentMonth);
  const activeMembers = profiles.filter(
    (profile) => profile.status === 'approved' && profile.role === 'customer'
  ).length;
  const newMembers = profiles.filter((profile) => {
    const created = new Date(profile.created_at);
    return (
      profile.status === 'approved' &&
      created.getMonth() === currentMonth.getMonth() &&
      created.getFullYear() === currentMonth.getFullYear()
    );
  }).length;
  const capacity = courses.reduce(
    (total, course) => total + Math.max(0, course.max_participants ?? 0),
    0
  );
  const occupancy = capacity > 0 ? Math.round((enrollments.length / capacity) * 100) : 0;
  const revenue = activeMembers * 33;

  const eventDateKeys = useMemo(
    () =>
      new Set(
        courses
          .filter((course) => course.start_date)
          .map((course) => localDateKey(new Date(course.start_date as string)))
      ),
    [courses]
  );

  const cycleMonth = () => {
    setMonthOffset((current) => (current <= -2 ? 0 : current - 1));
  };

  return (
    <AdminScrollScreen
      refreshControl={
        <RefreshControl
          onRefresh={reload}
          refreshing={refreshing}
          tintColor={adminColors.amber}
        />
      }>
      <AdminHeader
        eyebrow="MÉTRICAS"
        right={
          <Pressable
            onPress={cycleMonth}
            style={({ pressed }) => [styles.monthPicker, pressed && styles.pressed]}>
            <Text style={styles.monthPickerText}>
              {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
            </Text>
            <Feather color={adminColors.textMuted} name="chevron-down" size={14} />
          </Pressable>
        }
      />

      {loading ? (
        <>
          <View style={styles.kpiGrid}>
            <SkeletonBlock height={92} style={styles.kpiSkeleton} />
            <SkeletonBlock height={92} style={styles.kpiSkeleton} />
            <SkeletonBlock height={92} style={styles.kpiSkeleton} />
            <SkeletonBlock height={92} style={styles.kpiSkeleton} />
          </View>
          <SkeletonBlock height={150} />
          <SkeletonBlock height={170} />
        </>
      ) : (
        <>
          {error ? (
            <AdminCard style={styles.errorCard}>
              <Text style={styles.error}>{error}</Text>
            </AdminCard>
          ) : null}

          <View style={styles.kpiGrid}>
            <KpiCard
              comparison="+4 % vs. mes anterior"
              comparisonColor={adminColors.available}
              label="Ocupación mensual"
              value={`${occupancy}%`}
            />
            <KpiCard
              comparison={`+${newMembers} este mes`}
              comparisonColor={adminColors.available}
              label="Miembros activos"
              value={String(activeMembers)}
            />
            <KpiCard
              comparison="33 € / cliente"
              label="Ingresos del mes"
              value={`${revenue.toLocaleString('es-ES')} €`}
            />
            <KpiCard
              comparison={__DEV__ ? '140 € total' : '0 € total'}
              label="Facturas pendientes"
              value={__DEV__ ? '3' : '0'}
              valueColor={__DEV__ ? adminColors.urgent : adminColors.textPrimary}
            />
          </View>

          <AdminCard style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Evolución de miembros</Text>
              <Text style={styles.chartCaption}>6 meses</Text>
            </View>
            <View style={styles.memberChart}>
              {MEMBER_BARS.map((height, index) => (
                <View
                  key={`${height}-${index}`}
                  style={[
                    styles.memberBar,
                    { height },
                    index === MEMBER_BARS.length - 1 && styles.memberBarActive,
                  ]}
                />
              ))}
            </View>
          </AdminCard>

          <AdminCard style={styles.chartCard}>
            <Text style={styles.chartTitle}>Hora punta</Text>
            <View style={styles.peakChart}>
              {PEAK_BARS.map((height, index) => (
                <View key={PEAK_LABELS[index]} style={styles.peakColumn}>
                  <View
                    style={[
                      styles.peakBar,
                      { height },
                      index === 4 && styles.peakBarUrgent,
                    ]}
                  />
                  <Text style={styles.peakLabel}>{PEAK_LABELS[index]}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.peakSummary}>18:00 – 19:00 es la franja más llena</Text>
          </AdminCard>

          <View style={styles.smallKpis}>
            <SmallKpi label="Tasa de no-show" value="8%" />
            <SmallKpi label="Bajas este mes" value="2" />
          </View>

          <AdminCard style={styles.calendarCard}>
            <Text style={styles.chartTitle}>Calendario</Text>
            <TwoWeekCalendar eventDateKeys={eventDateKeys} />
          </AdminCard>
        </>
      )}
    </AdminScrollScreen>
  );
}

function KpiCard({
  comparison,
  comparisonColor,
  label,
  value,
  valueColor,
}: {
  comparison: string;
  comparisonColor?: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <AdminCard style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
      <Text
        style={[
          styles.kpiComparison,
          comparisonColor ? { color: comparisonColor } : null,
        ]}>
        {comparison}
      </Text>
    </AdminCard>
  );
}

function SmallKpi({ label, value }: { label: string; value: string }) {
  return (
    <AdminCard style={styles.smallKpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </AdminCard>
  );
}

function TwoWeekCalendar({ eventDateKeys }: { eventDateKeys: Set<string> }) {
  const today = new Date();
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - mondayOffset);
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });

  return (
    <View style={styles.miniCalendar}>
      {days.map((date) => {
        const key = localDateKey(date);
        const isToday = key === localDateKey(today);
        return (
          <View key={key} style={styles.miniDay}>
            <Text style={styles.miniWeekday}>
              {new Intl.DateTimeFormat('es-ES', { weekday: 'short' })
                .format(date)
                .slice(0, 2)}
            </Text>
            <View style={[styles.miniCircle, isToday && styles.miniCircleActive]}>
              <Text style={[styles.miniNumber, isToday && styles.miniNumberActive]}>
                {date.getDate()}
              </Text>
            </View>
            <View
              style={[
                styles.miniDot,
                eventDateKeys.has(key) && styles.miniDotVisible,
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  monthPicker: {
    alignItems: 'center',
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.border,
    borderRadius: adminRadius.chip,
    borderWidth: adminHairline,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  monthPickerText: {
    color: adminColors.textPrimary,
    fontSize: 11,
    fontWeight: '500',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  kpiCard: {
    minHeight: 96,
    width: '48.5%',
  },
  kpiSkeleton: {
    marginBottom: 0,
    width: '48.5%',
  },
  kpiLabel: {
    ...adminType.label,
  },
  kpiValue: {
    ...adminType.kpi,
    marginTop: 8,
  },
  kpiComparison: {
    ...adminType.label,
    marginTop: 5,
  },
  chartCard: {
    marginTop: 8,
  },
  chartHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chartTitle: {
    ...adminType.rowTitle,
  },
  chartCaption: {
    ...adminType.label,
  },
  memberChart: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
    height: 88,
    justifyContent: 'space-between',
    marginTop: 16,
  },
  memberBar: {
    backgroundColor: adminColors.trackBg,
    borderRadius: 4,
    flex: 1,
  },
  memberBarActive: {
    backgroundColor: adminColors.amber,
  },
  peakChart: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 7,
    height: 112,
    justifyContent: 'space-between',
    marginTop: 16,
  },
  peakColumn: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  peakBar: {
    backgroundColor: adminColors.trackBg,
    borderRadius: 3,
    width: '100%',
  },
  peakBarUrgent: {
    backgroundColor: adminColors.urgent,
  },
  peakLabel: {
    ...adminType.label,
    marginTop: 5,
  },
  peakSummary: {
    ...adminType.secondary,
    marginTop: 14,
    textAlign: 'center',
  },
  smallKpis: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  smallKpi: {
    flex: 1,
  },
  calendarCard: {
    marginTop: 8,
  },
  miniCalendar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  miniDay: {
    alignItems: 'center',
    height: 54,
    width: '14.2857%',
  },
  miniWeekday: {
    color: adminColors.textMuted,
    fontSize: 8,
  },
  miniCircle: {
    alignItems: 'center',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    marginTop: 3,
    width: 22,
  },
  miniCircleActive: {
    backgroundColor: adminColors.amber,
  },
  miniNumber: {
    color: adminColors.textPrimary,
    fontSize: 10,
  },
  miniNumberActive: {
    color: adminColors.amberOn,
    fontWeight: '500',
  },
  miniDot: {
    backgroundColor: 'transparent',
    borderRadius: 2,
    height: 3,
    marginTop: 2,
    width: 3,
  },
  miniDotVisible: {
    backgroundColor: adminColors.amber,
  },
  errorCard: {
    marginBottom: 8,
  },
  error: {
    color: adminColors.urgent,
    fontSize: 12,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
