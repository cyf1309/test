export type WakeLockStatus = 'idle' | 'active' | 'paused' | 'blocked' | 'unsupported' | 'https_required';

let audioContext: AudioContext | null = null;
let wakeLockSentinel: WakeLockSentinel | null = null;

export function isAudioRunning(): boolean {
  return Boolean(audioContext && audioContext.state === 'running');
}

export async function unlockAudio(playTestBeep = false): Promise<boolean> {
  try {
    if (!audioContext) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return false;
      audioContext = new AudioCtx();
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    const ready = audioContext.state === 'running';
    if (playTestBeep && ready) {
      beep(740, 0.1, 0.22);
    }
    return ready;
  } catch {
    return false;
  }
}

export function beep(
  freq: number,
  duration: number,
  volume = 0.28,
  type: OscillatorType = 'sine'
): void {
  if (!audioContext || audioContext.state !== 'running') return;
  try {
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  } catch {
    // Ignore audio node errors on restricted devices
  }
}

export function vibrate(pattern: number[]): void {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore vibration errors
  }
}

export function playWarningSound(): void {
  beep(660, 0.14, 0.22);
  window.setTimeout(() => beep(880, 0.18, 0.25), 180);
  vibrate([120]);
}

export function playDangerSound(): void {
  beep(987, 0.14, 0.35, 'triangle');
  window.setTimeout(() => beep(987, 0.14, 0.35, 'triangle'), 180);
  window.setTimeout(() => beep(1318, 0.28, 0.38, 'triangle'), 360);
  vibrate([220, 100, 220]);
}

export async function requestScreenWakeLock(
  onStatusChange: (status: WakeLockStatus) => void
): Promise<void> {
  if (!('wakeLock' in navigator)) {
    onStatusChange(window.isSecureContext ? 'unsupported' : 'https_required');
    return;
  }

  if (wakeLockSentinel && !wakeLockSentinel.released) {
    onStatusChange('active');
    return;
  }

  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    onStatusChange('active');

    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
      onStatusChange('paused');
    });
  } catch {
    onStatusChange('blocked');
  }
}
