import { GarnishItem } from '../types/station';

export const GARNISH_ITEMS: GarnishItem[] = [
  { id: 'tomate', name: 'Tomate', icon: '🍅', dureeTxt: '2h', sec: 2 * 3600 },
  { id: 'fromage', name: 'Fromage', icon: '🧀', dureeTxt: '2h', sec: 2 * 3600 },
  { id: 'raclette_p', name: 'Raclette Poivre', icon: '🫕', dureeTxt: '2h', sec: 2 * 3600 },
  { id: 'raclette_a', name: 'Raclette Ail', icon: '🧄', dureeTxt: '2h', sec: 2 * 3600 },
  { id: 'iceberg', name: 'Salade Iceberg', icon: '🥬', dureeTxt: '2h', sec: 2 * 3600 },
  { id: 'bacon', name: 'Bacon', icon: '🥓', dureeTxt: '4h', sec: 4 * 3600 },
  { id: 'bacon_pep', name: 'Bacon Pépites', icon: '🥓', dureeTxt: '4h', sec: 4 * 3600 },
  { id: 'oignon_frais', name: 'Oignons Frais', icon: '🧅', dureeTxt: '4h', sec: 4 * 3600 },
  { id: 'oignon_frit', name: 'Oignons Frits', icon: '🧅', dureeTxt: '12h', sec: 12 * 3600 },
  { id: 'oignon_cara', name: 'Oignons Caramélisés', icon: '🍯', dureeTxt: '2h', sec: 2 * 3600 },
  { id: 'sauce_frites', name: 'Sauce Frites', icon: '🍟', dureeTxt: '2h', sec: 2 * 3600 },
  { id: 'sauce_raclette', name: 'Sauce Raclette', icon: '🫕', dureeTxt: '1h30', sec: 1.5 * 3600 },
];

export const STORAGE_PREFIX = 'time_app_';
export const SORT_STORAGE_KEY = 'time_app_sort_urgency';
export const LOGS_STORAGE_KEY = 'time_app_shift_logs';
export const CHAT_STORAGE_KEY = 'time_app_chat_history';
export const WARN_THRESHOLD_SEC = 300; // 5 minutes
export const ALARM_REPEAT_MS = 8000; // Rappel sonore toutes les 8s si périmé

export function formatHMS(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatClock(timestamp: number, withSeconds: boolean): string {
  const d = new Date(timestamp);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  if (!withSeconds) return `${h}:${m}`;
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
