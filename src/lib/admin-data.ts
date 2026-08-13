import { adminColors } from '@/constants/admin-theme';

export function occupancyStatus(taken: number, capacity: number) {
  const ratio = capacity > 0 ? taken / capacity : 0;

  if (ratio >= 1) {
    return { color: adminColors.urgent, label: 'Lleno' };
  }
  if (ratio >= 0.8) {
    return { color: adminColors.warning, label: 'Casi lleno' };
  }
  if (ratio >= 0.5) {
    return { color: adminColors.amber, label: 'Pocas plazas disponibles' };
  }
  return { color: adminColors.available, label: 'Plazas disponibles' };
}

export function formatSpanishDay(date: Date) {
  const value = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(date);

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatSpanishDayWithYear(date: Date) {
  const value = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    year: 'numeric',
  }).format(date);

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatSpanishMonth(date: Date) {
  const value = new Intl.DateTimeFormat('es-ES', {
    month: 'long',
    year: 'numeric',
  }).format(date);

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function timeRange(start: string | null, end: string | null) {
  if (!start) return 'Sin horario';

  const startDate = new Date(start);
  const startTime = startDate.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (!end) return startTime;

  const endTime = new Date(end).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${startTime}–${endTime}`;
}
