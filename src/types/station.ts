export type BacStatus = 'idle' | 'active' | 'warning' | 'danger';

export type FilterTab = 'all' | 'active' | 'alert' | 'idle';

export type AppSection = 'station' | 'journal' | 'assistant';

export type AssistantMode = 'fast' | 'standard' | 'deep';

export interface GarnishItem {
  id: string;
  name: string;
  icon: string;
  dureeTxt: string;
  sec: number;
}

export interface BacState {
  startTime: number;
  endTime: number;
  warnTriggered: boolean;
  expiredTriggered: boolean;
}

export type ConfirmAction = 'start' | 'stop';

export interface ShiftLogEntry {
  id: string;
  timestamp: number;
  timeFormatted: string;
  itemId: string;
  itemName: string;
  itemIcon: string;
  action: 'Démarré' | 'Rechargé' | 'Renouvelé' | 'Vidé' | 'Alerte 5 min' | 'Périmé';
  tone: 'ok' | 'warn' | 'danger' | 'neutral';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  mode?: AssistantMode;
  timestamp: number;
}
