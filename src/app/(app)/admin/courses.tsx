import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdminColors } from '@/constants/admin-theme';
import { useAuth } from '@/context/auth-context';
import { supabase, type Course } from '@/lib/supabase';

export default function CoursesScreen() {
  const insets = useSafeAreaInsets();
  const { authenticatedUserProfile } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCourses = async () => {
    if (!authenticatedUserProfile?.company_id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('company_id', authenticatedUserProfile.company_id)
        .order('start_date', { ascending: true });

      if (error) throw error;
      setCourses((data ?? []) as Course[]);
    } catch (error) {
      console.error('Error loading courses:', error);
      Alert.alert('Fehler', 'Die Kurse konnten nicht geladen werden.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadCourses();
  }, [authenticatedUserProfile?.company_id]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={AdminColors.primary} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 110 },
        courses.length === 0 && styles.emptyContent,
      ]}
      data={courses}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={AdminColors.primary}
          onRefresh={() => {
            setRefreshing(true);
            void loadCourses();
          }}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.eyebrow}>KURSPLAN</Text>
          <Text style={styles.title}>{courses.length} Kurse</Text>
          <Text style={styles.subtitle}>
            Überblick über geplante Kurse, Zeiten und Teilnehmerkapazitäten.
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const start = item.start_date ? new Date(item.start_date) : null;
        const end = item.end_date ? new Date(item.end_date) : null;

        return (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.dateBadge}>
                <Text style={styles.dateDay}>{start ? start.getDate() : '–'}</Text>
                <Text style={styles.dateMonth}>
                  {start
                    ? start.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')
                    : 'OFFEN'}
                </Text>
              </View>
              <View style={styles.courseCopy}>
                <Text style={styles.courseTitle}>{item.title}</Text>
                <Text style={styles.courseTime}>{formatCourseTime(start, end)}</Text>
              </View>
              <View style={styles.capacityBadge}>
                <Text style={styles.capacityValue}>{item.max_participants ?? '∞'}</Text>
                <Text style={styles.capacityLabel}>Plätze</Text>
              </View>
            </View>

            {item.description ? (
              <Text style={styles.description} numberOfLines={3}>
                {item.description}
              </Text>
            ) : (
              <Text style={styles.descriptionMuted}>Keine Beschreibung hinterlegt.</Text>
            )}
          </View>
        );
      }}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Noch keine Kurse</Text>
          <Text style={styles.emptyText}>Sobald Kurse angelegt wurden, erscheinen sie hier.</Text>
        </View>
      }
      style={styles.screen}
    />
  );
}

function formatCourseTime(start: Date | null, end: Date | null) {
  if (!start) return 'Termin noch offen';

  const date = start.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
  const startTime = start.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const endTime = end?.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${date} · ${startTime}${endTime ? `–${endTime}` : ''}`;
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: AdminColors.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  emptyContent: {
    flexGrow: 1,
  },
  loading: {
    alignItems: 'center',
    backgroundColor: AdminColors.background,
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 22,
  },
  eyebrow: {
    color: AdminColors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    color: AdminColors.textPrimary,
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginTop: 7,
  },
  subtitle: {
    color: AdminColors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  card: {
    backgroundColor: AdminColors.surface,
    borderColor: AdminColors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    padding: 15,
  },
  cardTop: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  dateBadge: {
    alignItems: 'center',
    backgroundColor: AdminColors.primaryMuted,
    borderRadius: 13,
    height: 56,
    justifyContent: 'center',
    marginRight: 12,
    width: 56,
  },
  dateDay: {
    color: AdminColors.primary,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  dateMonth: {
    color: AdminColors.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  courseCopy: {
    flex: 1,
    minWidth: 0,
  },
  courseTitle: {
    color: AdminColors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  courseTime: {
    color: AdminColors.textMuted,
    fontSize: 12,
    marginTop: 5,
  },
  capacityBadge: {
    alignItems: 'center',
    backgroundColor: AdminColors.surfaceRaised,
    borderRadius: 11,
    marginLeft: 10,
    minWidth: 48,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  capacityValue: {
    color: AdminColors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  capacityLabel: {
    color: AdminColors.textMuted,
    fontSize: 8,
    marginTop: 1,
    textTransform: 'uppercase',
  },
  description: {
    borderTopColor: AdminColors.border,
    borderTopWidth: 1,
    color: AdminColors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 14,
    paddingTop: 13,
  },
  descriptionMuted: {
    borderTopColor: AdminColors.border,
    borderTopWidth: 1,
    color: AdminColors.textMuted,
    fontSize: 12,
    marginTop: 14,
    paddingTop: 13,
  },
  empty: {
    alignItems: 'center',
    backgroundColor: AdminColors.surface,
    borderColor: AdminColors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 28,
  },
  emptyTitle: {
    color: AdminColors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  emptyText: {
    color: AdminColors.textMuted,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
});
