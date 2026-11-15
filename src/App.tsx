import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Bell,
  BellOff,
  Bot,
  ClipboardList,
  Play,
  Sun,
  Timer,
  Trash2,
  Volume2,
} from 'lucide-react';
import {
  ALARM_REPEAT_MS,
  CHAT_STORAGE_KEY,
  GARNISH_ITEMS,
  LOGS_STORAGE_KEY,
  SORT_STORAGE_KEY,
  STORAGE_PREFIX,
  WARN_THRESHOLD_SEC,
  formatClock,
  formatHMS,
} from './data/garnishItems';
import {
  AppSection,
  AssistantMode,
  BacState,
  BacStatus,
  ChatMessage,
  ConfirmAction,
  FilterTab,
  GarnishItem,
  ShiftLogEntry,
} from './types/station';
import {
  WakeLockStatus,
  beep,
  isAudioRunning,
  playDangerSound,
  playWarningSound,
  requestScreenWakeLock,
  unlockAudio,
} from './utils/audioWakeLock';
import { GarnishCard } from './components/GarnishCard';
import { ShiftLogView } from './components/ShiftLogView';
import { AssistantPanel } from './components/AssistantPanel';
import { StartAllModal } from './components/StartAllModal';

function readStoredBacState(id: string): BacState | null {
  const raw = localStorage.getItem(STORAGE_PREFIX + id);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<BacState>;
    if (parsed && typeof parsed.endTime === 'number') {
      return {
        startTime: typeof parsed.startTime === 'number' ? parsed.startTime : Date.now(),
        endTime: parsed.endTime,
        warnTriggered: Boolean(parsed.warnTriggered),
        expiredTriggered: Boolean(parsed.expiredTriggered),
      };
    }
  } catch {
    localStorage.removeItem(STORAGE_PREFIX + id);
  }
  return null;
}

function loadAllBacStates(): Record<string, BacState | null> {
  const map: Record<string, BacState | null> = {};
  for (const item of GARNISH_ITEMS) {
    map[item.id] = readStoredBacState(item.id);
  }
  return map;
}

function loadStoredLogs(): ShiftLogEntry[] {
  const raw = localStorage.getItem(LOGS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ShiftLogEntry[]) : [];
  } catch {
    return [];
  }
}

function loadStoredChat(): ChatMessage[] {
  const raw = localStorage.getItem(CHAT_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [bacStates, setBacStates] = useState<Record<string, BacState | null>>(loadAllBacStates);
  const [now, setNow] = useState<number>(() => Date.now());
  const [sortByUrgency, setSortByUrgency] = useState<boolean>(
    () => localStorage.getItem(SORT_STORAGE_KEY) === '1'
  );
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [activeSection, setActiveSection] = useState<AppSection>('station');
  const [assistantDocked, setAssistantDocked] = useState<boolean>(false);

  const [audioReady, setAudioReady] = useState<boolean>(false);
  const [wakeLockStatus, setWakeLockStatus] = useState<WakeLockStatus>('idle');
  const [alarmSilenced, setAlarmSilenced] = useState<boolean>(false);

  const [confirmPending, setConfirmPending] = useState<Record<string, ConfirmAction>>({});
  const [stopAllConfirming, setStopAllConfirming] = useState<boolean>(false);
  const [startAllModalOpen, setStartAllModalOpen] = useState<boolean>(false);

  const [shiftLogs, setShiftLogs] = useState<ShiftLogEntry[]>(loadStoredLogs);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(loadStoredChat);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('standard');

  const wakeLockDesiredRef = useRef<boolean>(false);
  const lastDangerBeepAtRef = useRef<number>(0);
  const confirmTimersRef = useRef<Record<string, number>>({});
  const stopAllTimerRef = useRef<number | null>(null);

  const appendLog = useCallback(
    (
      item: GarnishItem,
      action: ShiftLogEntry['action'],
      tone: ShiftLogEntry['tone'],
      timestamp = Date.now()
    ) => {
      const entry: ShiftLogEntry = {
        id: `${timestamp}_${item.id}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp,
        timeFormatted: formatClock(timestamp, true),
        itemId: item.id,
        itemName: item.name,
        itemIcon: item.icon,
        action,
        tone,
      };
      setShiftLogs((prev) => {
        const next = [entry, ...prev].slice(0, 120);
        localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages.slice(-40)));
  }, [chatMessages]);

  const ensureAudioAndWakeLock = useCallback(async (playTest = false) => {
    const ready = await unlockAudio(playTest);
    setAudioReady(ready);
    wakeLockDesiredRef.current = true;
    await requestScreenWakeLock(setWakeLockStatus);
  }, []);

  // Déblocage audio automatique au premier toucher n'importe où + reprise visibilité
  useEffect(() => {
    const handlePointerDown = async () => {
      if (!isAudioRunning()) {
        const ready = await unlockAudio(false);
        setAudioReady(ready);
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        const ready = await unlockAudio(false);
        setAudioReady(ready);
        if (wakeLockDesiredRef.current) {
          await requestScreenWakeLock(setWakeLockStatus);
        }
        setNow(Date.now());
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Boucle 1s pour chronos, alertes et sons
  useEffect(() => {
    const interval = window.setInterval(() => {
      const tickNow = Date.now();
      setNow(tickNow);

      setBacStates((prev) => {
        let changed = false;
        let hasNewDanger = false;
        let hasNewWarn = false;
        let dangerCount = 0;
        const next = { ...prev };

        for (const item of GARNISH_ITEMS) {
          const st = next[item.id];
          if (!st) continue;
          const remainingSec = Math.ceil((st.endTime - tickNow) / 1000);

          if (remainingSec <= 0) {
            dangerCount++;
            if (!st.expiredTriggered) {
              const updated = { ...st, expiredTriggered: true };
              next[item.id] = updated;
              localStorage.setItem(STORAGE_PREFIX + item.id, JSON.stringify(updated));
              changed = true;
              hasNewDanger = true;
              setAlarmSilenced(false);
              appendLog(item, 'Périmé', 'danger', tickNow);
            }
          } else if (remainingSec <= WARN_THRESHOLD_SEC) {
            if (!st.warnTriggered) {
              const updated = { ...st, warnTriggered: true };
              next[item.id] = updated;
              localStorage.setItem(STORAGE_PREFIX + item.id, JSON.stringify(updated));
              changed = true;
              hasNewWarn = true;
              appendLog(item, 'Alerte 5 min', 'warn', tickNow);
            }
          }
        }

        if (dangerCount > 0) {
          if (
            hasNewDanger ||
            (!alarmSilenced && tickNow - lastDangerBeepAtRef.current >= ALARM_REPEAT_MS)
          ) {
            playDangerSound();
            lastDangerBeepAtRef.current = tickNow;
          }
        } else {
          if (alarmSilenced) setAlarmSilenced(false);
          if (hasNewWarn) {
            playWarningSound();
          }
        }

        return changed ? next : prev;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [alarmSilenced, appendLog]);

  const clearBacConfirm = useCallback((id: string) => {
    if (confirmTimersRef.current[id]) {
      window.clearTimeout(confirmTimersRef.current[id]);
      delete confirmTimersRef.current[id];
    }
    setConfirmPending((prev) => {
      if (!(id in prev)) return prev;
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }, []);

  const startBac = useCallback(
    (item: GarnishItem, silent = false) => {
      clearBacConfirm(item.id);
      if (!silent) {
        void ensureAudioAndWakeLock(false);
      }

      const startTime = Date.now();
      const prevState = bacStates[item.id];
      const wasExpired =
        prevState && Math.ceil((prevState.endTime - startTime) / 1000) <= 0;

      const nextState: BacState = {
        startTime,
        endTime: startTime + item.sec * 1000,
        warnTriggered: false,
        expiredTriggered: false,
      };
      localStorage.setItem(STORAGE_PREFIX + item.id, JSON.stringify(nextState));

      setBacStates((prev) => ({ ...prev, [item.id]: nextState }));
      setNow(startTime);

      if (!silent) {
        const logAction = !prevState ? 'Démarré' : wasExpired ? 'Renouvelé' : 'Rechargé';
        appendLog(item, logAction, 'ok', startTime);
      }
    },
    [appendLog, bacStates, clearBacConfirm, ensureAudioAndWakeLock]
  );

  const stopBac = useCallback(
    (item: GarnishItem, silent = false) => {
      clearBacConfirm(item.id);
      localStorage.removeItem(STORAGE_PREFIX + item.id);
      setBacStates((prev) => ({ ...prev, [item.id]: null }));
      if (!silent) {
        appendLog(item, 'Vidé', 'neutral');
      }
    },
    [appendLog, clearBacConfirm]
  );

  const setBacConfirm = useCallback(
    (id: string, action: ConfirmAction) => {
      clearBacConfirm(id);
      setConfirmPending((prev) => ({ ...prev, [id]: action }));
      confirmTimersRef.current[id] = window.setTimeout(() => {
        clearBacConfirm(id);
      }, 3500);
    },
    [clearBacConfirm]
  );

  const handlePrimaryClick = (item: GarnishItem) => {
    const state = bacStates[item.id];
    const remainingSec = state ? Math.ceil((state.endTime - Date.now()) / 1000) : null;

    if (!state || (remainingSec !== null && remainingSec <= 0)) {
      startBac(item);
      return;
    }

    if (confirmPending[item.id] === 'start') {
      startBac(item);
    } else {
      setBacConfirm(item.id, 'start');
    }
  };

  const handleStopClick = (item: GarnishItem) => {
    const state = bacStates[item.id];
    if (!state) return;

    const remainingSec = Math.ceil((state.endTime - Date.now()) / 1000);
    if (remainingSec <= 0) {
      stopBac(item);
      return;
    }

    if (confirmPending[item.id] === 'stop') {
      stopBac(item);
    } else {
      setBacConfirm(item.id, 'stop');
    }
  };

  const launchAll = (resetExisting: boolean) => {
    setStartAllModalOpen(false);
    void ensureAudioAndWakeLock(false);

    const ts = Date.now();
    setBacStates((prev) => {
      const next = { ...prev };
      for (const item of GARNISH_ITEMS) {
        if (resetExisting || !next[item.id]) {
          clearBacConfirm(item.id);
          const state: BacState = {
            startTime: ts,
            endTime: ts + item.sec * 1000,
            warnTriggered: false,
            expiredTriggered: false,
          };
          localStorage.setItem(STORAGE_PREFIX + item.id, JSON.stringify(state));
          next[item.id] = state;
        }
      }
      return next;
    });

    setNow(ts);
    beep(880, 0.12, 0.22);
    appendLog(
      GARNISH_ITEMS[0],
      resetExisting ? 'Démarré' : 'Rechargé',
      'ok',
      ts
    );
  };

  const handleStartAllClick = () => {
    void ensureAudioAndWakeLock(false);
    const activeItems = GARNISH_ITEMS.filter((item) => bacStates[item.id] !== null);
    if (activeItems.length === 0) {
      launchAll(true);
      return;
    }
    setStartAllModalOpen(true);
  };

  const handleStopAllClick = () => {
    const hasAnyActive = GARNISH_ITEMS.some((item) => bacStates[item.id] !== null);
    if (!hasAnyActive) return;

    if (stopAllConfirming) {
      if (stopAllTimerRef.current) window.clearTimeout(stopAllTimerRef.current);
      setStopAllConfirming(false);
      for (const item of GARNISH_ITEMS) {
        clearBacConfirm(item.id);
        localStorage.removeItem(STORAGE_PREFIX + item.id);
      }
      setBacStates(() => {
        const empty: Record<string, BacState | null> = {};
        for (const item of GARNISH_ITEMS) empty[item.id] = null;
        return empty;
      });
      setAlarmSilenced(false);
    } else {
      setStopAllConfirming(true);
      stopAllTimerRef.current = window.setTimeout(() => {
        setStopAllConfirming(false);
      }, 3500);
    }
  };

  const toggleSortMode = () => {
    setSortByUrgency((prev) => {
      const next = !prev;
      localStorage.setItem(SORT_STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  };

  const computedBacs = useMemo(() => {
    return GARNISH_ITEMS.map((item, index) => {
      const state = bacStates[item.id];
      if (!state) {
        return {
          item,
          status: 'idle' as BacStatus,
          remainingSec: item.sec,
          endTime: null,
          priority: 3000 + index,
        };
      }
      const remainingSec = Math.ceil((state.endTime - now) / 1000);
      if (remainingSec <= 0) {
        return {
          item,
          status: 'danger' as BacStatus,
          remainingSec: 0,
          endTime: state.endTime,
          priority: remainingSec, // plus négatif = plus urgent
        };
      }
      if (remainingSec <= WARN_THRESHOLD_SEC) {
        return {
          item,
          status: 'warning' as BacStatus,
          remainingSec,
          endTime: state.endTime,
          priority: 1000 + remainingSec,
        };
      }
      return {
        item,
        status: 'active' as BacStatus,
        remainingSec,
        endTime: state.endTime,
        priority: 2000 + index,
      };
    });
  }, [bacStates, now]);

  const counts = useMemo(() => {
    let active = 0;
    let warning = 0;
    let danger = 0;
    let idle = 0;
    for (const b of computedBacs) {
      if (b.status === 'active') active++;
      else if (b.status === 'warning') warning++;
      else if (b.status === 'danger') danger++;
      else idle++;
    }
    return { active, warning, danger, idle, totalRunning: active + warning + danger };
  }, [computedBacs]);

  const displayedBacs = useMemo(() => {
    const filtered = computedBacs.filter((b) => {
      if (filterTab === 'active') return b.status === 'active';
      if (filterTab === 'alert') return b.status === 'warning' || b.status === 'danger';
      if (filterTab === 'idle') return b.status === 'idle';
      return true;
    });
    if (!sortByUrgency) return filtered;
    return [...filtered].sort((a, b) => a.priority - b.priority);
  }, [computedBacs, filterTab, sortByUrgency]);

  const getStationContext = useCallback(() => {
    return {
      currentClock: formatClock(Date.now(), true),
      summary: {
        active: counts.active,
        warning: counts.warning,
        danger: counts.danger,
        idle: counts.idle,
      },
      bacs: computedBacs.map((b) => ({
        id: b.item.id,
        name: b.item.name,
        dureeTxt: b.item.dureeTxt,
        status: b.status,
        remainingFormatted: formatHMS(b.remainingSec),
        endClock: b.endTime ? formatClock(b.endTime, false) : null,
      })),
      recentLogs: shiftLogs.slice(0, 10).map((l) => ({
        time: l.timeFormatted,
        itemName: l.itemName,
        action: l.action,
      })),
    };
  }, [computedBacs, counts, shiftLogs]);

  const wakeLockLabel =
    wakeLockStatus === 'active'
      ? 'Écran anti-veille actif'
      : wakeLockStatus === 'paused'
      ? 'Anti-veille en pause'
      : wakeLockStatus === 'blocked'
      ? 'Anti-veille bloqué'
      : wakeLockStatus === 'https_required'
      ? 'Anti-veille : HTTPS requis'
      : wakeLockStatus === 'unsupported'
      ? 'Anti-veille : non supporté'
      : 'Anti-veille : inactif';

  const handleNavClick = (section: AppSection) => {
    if (section === 'assistant') {
      // Sur desktop grand écran, bascule le panneau latéral si on est sur le poste
      if (window.innerWidth >= 1024 && activeSection === 'station') {
        setAssistantDocked((v) => !v);
        return;
      }
    }
    setActiveSection(section);
  };

  return (
    <div className="min-h-dvh bg-[#090d16] text-slate-50 pb-20 md:pb-8">
      {/* Top Bar Contract : 3 zones strictes */}
      <header className="sticky top-0 z-30 bg-[#090d16]/90 backdrop-blur-md border-b border-[#263147]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActiveSection('station')}
            className="text-xl font-extrabold tracking-[0.2em] text-sky-400 whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-sky-400 rounded"
          >
            TIME
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setActiveSection('station')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                activeSection === 'station'
                  ? 'text-slate-50 border-sky-400'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              Poste
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('journal')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                activeSection === 'journal'
                  ? 'text-slate-50 border-sky-400'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              Journal
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('assistant')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                activeSection === 'assistant' || (activeSection === 'station' && assistantDocked)
                  ? 'text-sky-400 border-sky-400'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              Assistant
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleStartAllClick}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-transform active:scale-[0.97]"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Tout lancer</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-3 sm:px-6 pt-4 space-y-4">
        {/* Barre d'état & outils opérationnels */}
        <section className="bg-[#121826] border border-[#263147] rounded-2xl p-3.5 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-mono-tabular text-base sm:text-lg font-extrabold text-slate-100 bg-[#1a2234] border border-[#263147] px-3 py-1.5 rounded-lg">
                {formatClock(now, true)}
              </span>
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-semibold">
                <span className="font-mono-tabular text-emerald-400">
                  {counts.totalRunning}/12 actifs
                </span>
                {counts.warning > 0 && (
                  <>
                    <span className="text-slate-600" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono-tabular text-amber-400">
                      {counts.warning} à prévoir
                    </span>
                  </>
                )}
                {counts.danger > 0 && (
                  <>
                    <span className="text-slate-600" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono-tabular text-red-400 font-bold">
                      {counts.danger} périmé{counts.danger > 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold">
              <Sun
                className={`w-4 h-4 ${
                  wakeLockStatus === 'active' ? 'text-emerald-400' : 'text-slate-500'
                }`}
              />
              <span
                className={
                  wakeLockStatus === 'active' ? 'text-emerald-400' : 'text-slate-400'
                }
              >
                {wakeLockLabel}
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-[#263147] flex flex-wrap items-center justify-between gap-2.5">
            <div
              className="flex items-center gap-1 p-1 bg-[#090d16] rounded-xl border border-[#263147] overflow-x-auto max-w-full"
              role="tablist"
              aria-label="Filtrer les bacs"
            >
              {(
                [
                  { id: 'all', label: 'Tous' },
                  { id: 'active', label: 'Actifs' },
                  { id: 'alert', label: 'Alertes' },
                  { id: 'idle', label: 'Arrêtés' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={filterTab === tab.id}
                  onClick={() => {
                    setFilterTab(tab.id);
                    if (activeSection !== 'station') setActiveSection('station');
                  }}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    filterTab === tab.id
                      ? 'bg-[#1a2234] text-slate-50'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleSortMode}
                className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold border inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                  sortByUrgency
                    ? 'bg-sky-500/15 text-sky-300 border-sky-400/60'
                    : 'bg-[#1a2234] text-slate-300 border-[#263147] hover:text-white'
                }`}
              >
                <ArrowUpDown className="w-4 h-4" />
                <span>{sortByUrgency ? 'Tri : Urgence' : 'Urgences en haut'}</span>
              </button>

              <button
                type="button"
                onClick={() => void ensureAudioAndWakeLock(true)}
                className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                  audioReady
                    ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                    : 'bg-amber-600 hover:bg-amber-500 text-white'
                }`}
              >
                {audioReady ? <Volume2 className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                <span>{audioReady ? 'Son prêt' : 'Activer Son'}</span>
              </button>

              <button
                type="button"
                onClick={handleStopAllClick}
                disabled={counts.totalRunning === 0}
                className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold border inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  stopAllConfirming
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-[#1a2234] text-slate-300 border-[#263147] hover:text-white'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>{stopAllConfirming ? 'Confirmer vider ?' : 'Tout vider'}</span>
              </button>
            </div>
          </div>
        </section>

        {/* Bandeau d'alarme actif si >= 1 bac périmé */}
        {counts.danger > 0 && (
          <div
            role="alert"
            className="bg-red-500/15 border-2 border-red-500 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 card-pulse-danger"
          >
            <span className="font-bold text-sm sm:text-base text-red-100">
              🚨 {counts.danger} bac{counts.danger > 1 ? 's' : ''} périmé
              {counts.danger > 1 ? 's' : ''} : renouvellement ou retrait requis !
            </span>
            {!alarmSilenced && (
              <button
                type="button"
                onClick={() => setAlarmSilenced(true)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-white text-red-900 text-xs sm:text-sm font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <BellOff className="w-4 h-4" />
                <span>Couper la sonnerie</span>
              </button>
            )}
          </div>
        )}

        {/* Contenu principal */}
        {activeSection === 'station' && (
          <div
            className={
              assistantDocked
                ? 'grid grid-cols-1 lg:grid-cols-[1fr_390px] xl:grid-cols-[1fr_420px] gap-4 items-start'
                : ''
            }
          >
            <div>
              {displayedBacs.length === 0 ? (
                <div className="bg-[#121826] border border-[#263147] rounded-2xl p-10 text-center">
                  <p className="text-base font-semibold text-slate-200">
                    Aucun bac dans ce filtre
                  </p>
                  <button
                    type="button"
                    onClick={() => setFilterTab('all')}
                    className="mt-3 min-h-[42px] px-4 py-2 rounded-xl bg-[#1a2234] border border-[#263147] text-sm font-semibold text-sky-400 hover:text-sky-300"
                  >
                    Afficher les 12 bacs
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {displayedBacs.map((entry) => (
                    <GarnishCard
                      key={entry.item.id}
                      item={entry.item}
                      status={entry.status}
                      remainingSec={entry.remainingSec}
                      endTime={entry.endTime}
                      confirmPending={confirmPending[entry.item.id]}
                      onPrimaryClick={handlePrimaryClick}
                      onStopClick={handleStopClick}
                    />
                  ))}
                </div>
              )}
            </div>

            {assistantDocked && (
              <div className="hidden lg:block sticky top-20">
                <AssistantPanel
                  messages={chatMessages}
                  mode={assistantMode}
                  onModeChange={setAssistantMode}
                  onUpdateMessages={setChatMessages}
                  getStationContext={getStationContext}
                  onClose={() => setAssistantDocked(false)}
                />
              </div>
            )}
          </div>
        )}

        {activeSection === 'journal' && (
          <ShiftLogView
            logs={shiftLogs}
            onClearLogs={() => {
              localStorage.removeItem(LOGS_STORAGE_KEY);
              setShiftLogs([]);
            }}
            onReturnToStation={() => setActiveSection('station')}
          />
        )}

        {activeSection === 'assistant' && (
          <div className="max-w-3xl mx-auto">
            <AssistantPanel
              messages={chatMessages}
              mode={assistantMode}
              onModeChange={setAssistantMode}
              onUpdateMessages={setChatMessages}
              getStationContext={getStationContext}
            />
          </div>
        )}
      </main>

      {/* Navigation tactile mobile (pouce en bas, <= 15% hauteur) */}
      <nav
        aria-label="Navigation principale"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#090d16]/95 backdrop-blur-md border-t border-[#263147] grid grid-cols-3 items-center"
      >
        <button
          type="button"
          onClick={() => setActiveSection('station')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
            activeSection === 'station' ? 'text-sky-400' : 'text-slate-400'
          }`}
        >
          <Timer className="w-5 h-5" />
          <span>Poste</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('journal')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
            activeSection === 'journal' ? 'text-sky-400' : 'text-slate-400'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          <span>Journal</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('assistant')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
            activeSection === 'assistant' ? 'text-sky-400' : 'text-slate-400'
          }`}
        >
          <Bot className="w-5 h-5" />
          <span>Assistant</span>
        </button>
      </nav>

      <StartAllModal
        isOpen={startAllModalOpen}
        activeCount={counts.totalRunning}
        idleCount={counts.idle}
        onClose={() => setStartAllModalOpen(false)}
        onLaunchIdleOnly={() => launchAll(false)}
        onRestartAll={() => launchAll(true)}
      />
    </div>
  );
}
