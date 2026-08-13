import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  adminColors,
  adminHairline,
  adminRadius,
  adminType,
} from '@/constants/admin-theme';
import { formatSpanishMonth, localDateKey } from '@/lib/admin-data';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function MonthCalendar({
  eventDateKeys,
  maximumDate,
  minimumDate,
  month,
  onChangeMonth,
  onSelectDate,
  selectedDate,
}: {
  eventDateKeys: Set<string>;
  maximumDate?: Date;
  minimumDate?: Date;
  month: Date;
  onChangeMonth: (month: Date) => void;
  onSelectDate: (date: Date) => void;
  selectedDate: Date;
}) {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
  const minimumKey = minimumDate ? localDateKey(minimumDate) : null;
  const maximumKey = maximumDate ? localDateKey(maximumDate) : null;
  const firstVisibleMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const minimumMonth = minimumDate
    ? new Date(minimumDate.getFullYear(), minimumDate.getMonth(), 1)
    : null;
  const maximumMonth = maximumDate
    ? new Date(maximumDate.getFullYear(), maximumDate.getMonth(), 1)
    : null;
  const canGoToPreviousMonth = !minimumMonth || firstVisibleMonth > minimumMonth;
  const canGoToNextMonth = !maximumMonth || firstVisibleMonth < maximumMonth;

  const changeMonth = (delta: number) => {
    onChangeMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  };

  return (
    <View style={styles.container}>
      <View style={styles.monthHeader}>
        <Pressable
          accessibilityLabel="Mes anterior"
          disabled={!canGoToPreviousMonth}
          onPress={() => changeMonth(-1)}
          hitSlop={8}
          style={({ pressed }) => pressed && styles.pressed}>
          <Feather
            color={canGoToPreviousMonth ? adminColors.amber : adminColors.textDisabled}
            name="chevron-left"
            size={17}
          />
        </Pressable>
        <Text style={styles.monthLabel}>{formatSpanishMonth(month)}</Text>
        <Pressable
          accessibilityLabel="Mes siguiente"
          disabled={!canGoToNextMonth}
          onPress={() => changeMonth(1)}
          hitSlop={8}
          style={({ pressed }) => pressed && styles.pressed}>
          <Feather
            color={canGoToNextMonth ? adminColors.amber : adminColors.textDisabled}
            name="chevron-right"
            size={17}
          />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((weekday) => (
          <Text key={weekday} style={styles.weekday}>
            {weekday}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((date) => {
          const key = localDateKey(date);
          const isCurrentMonth = date.getMonth() === month.getMonth();
          const isSelected = key === localDateKey(selectedDate);
          const hasEvent = isCurrentMonth && eventDateKeys.has(key);
          const isOutsideRange =
            (minimumKey !== null && key < minimumKey) ||
            (maximumKey !== null && key > maximumKey);
          const isDisabled = !isCurrentMonth || isOutsideRange;

          return (
            <Pressable
              disabled={isDisabled}
              key={key}
              onPress={() => onSelectDate(date)}
              style={({ pressed }) => [styles.dayCell, pressed && styles.pressed]}>
              <View style={[styles.dayNumberCircle, isSelected && styles.daySelected]}>
                <Text
                  style={[
                    styles.dayNumber,
                    isDisabled && styles.dayDisabled,
                    isSelected && styles.dayNumberSelected,
                  ]}>
                  {date.getDate()}
                </Text>
              </View>
              <View style={[styles.dot, hasEvent && styles.dotVisible]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: adminColors.bgCard,
    borderColor: adminColors.border,
    borderRadius: adminRadius.calendar,
    borderWidth: adminHairline,
    padding: 14,
  },
  monthHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 3,
  },
  monthLabel: {
    color: adminColors.amber,
    fontSize: 14,
    fontWeight: '500',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekday: {
    color: adminColors.textMuted,
    fontSize: 9,
    textAlign: 'center',
    width: '14.2857%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: '14.2857%',
  },
  dayNumberCircle: {
    alignItems: 'center',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  daySelected: {
    backgroundColor: adminColors.amber,
  },
  dayNumber: {
    color: adminColors.textPrimary,
    fontSize: 12,
    fontWeight: '400',
  },
  dayNumberSelected: {
    color: adminColors.amberOn,
    fontWeight: '500',
  },
  dayDisabled: {
    color: adminColors.textDisabled,
  },
  dot: {
    backgroundColor: 'transparent',
    borderRadius: 2,
    height: 4,
    marginTop: 1,
    width: 4,
  },
  dotVisible: {
    backgroundColor: adminColors.amber,
  },
  pressed: {
    opacity: 0.7,
  },
});
