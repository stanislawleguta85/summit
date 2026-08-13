import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@summit/admin-local-courses-v1';

export type LocalAdminCourse = {
  id: string;
  title: string;
  category: string;
  trainerId: string;
  trainerName: string;
  repetition: 'once' | 'weekly';
  weekdays: string[];
  startTime: string;
  endTime: string;
  capacity: number;
  price: string;
  room: string;
  waitlistEnabled: boolean;
  approvalRequired: boolean;
  published: boolean;
  createdAt: string;
};

export async function loadLocalAdminCourses(): Promise<LocalAdminCourse[]> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as LocalAdminCourse[]) : [];
  } catch {
    return [];
  }
}

export async function saveLocalAdminCourse(
  course: Omit<LocalAdminCourse, 'id' | 'createdAt'>
): Promise<LocalAdminCourse> {
  const current = await loadLocalAdminCourses();
  const saved: LocalAdminCourse = {
    ...course,
    id: `local-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([saved, ...current]));
  return saved;
}
