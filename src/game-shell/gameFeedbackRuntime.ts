import type {
  GameFeedbackAction,
  GameFeedbackCue,
  GameFeedbackHaptic,
} from "../../packages/crossword-core/src/gameFeedback.ts";

export type GameFeedbackToneStep = Readonly<{
  durationMs: number;
  frequencyHz: number;
  gain: number;
  offsetMs: number;
  wave: OscillatorType;
}>;

const TONE_PLANS = Object.freeze({
  "cell-commit": Object.freeze([
    Object.freeze({
      durationMs: 64,
      frequencyHz: 1_120,
      gain: 0.035,
      offsetMs: 0,
      wave: "triangle" as const,
    }),
  ]),
  incorrect: Object.freeze([
    Object.freeze({
      durationMs: 150,
      frequencyHz: 196,
      gain: 0.055,
      offsetMs: 0,
      wave: "triangle" as const,
    }),
  ]),
  "word-complete": Object.freeze(
    [0, 108, 216].map((offsetMs, index) =>
      Object.freeze({
        durationMs: 150,
        frequencyHz: [523.25, 659.25, 783.99][index] ?? 523.25,
        gain: 0.06,
        offsetMs,
        wave: "sine" as const,
      }),
    ),
  ),
  "intersection-chain": Object.freeze(
    [0, 105, 210, 315, 420].map((offsetMs, index) =>
      Object.freeze({
        durationMs: 180,
        frequencyHz:
          [523.25, 659.25, 783.99, 987.77, 1_174.66][index] ?? 523.25,
        gain: 0.055,
        offsetMs,
        wave: "sine" as const,
      }),
    ),
  ),
  "board-complete": Object.freeze(
    [0, 260, 520, 780, 1_040].map((offsetMs, index) =>
      Object.freeze({
        durationMs: index === 4 ? 700 : 360,
        frequencyHz: [392, 523.25, 659.25, 783.99, 1_046.5][index] ?? 392,
        gain: index === 4 ? 0.07 : 0.05,
        offsetMs,
        wave: index === 4 ? ("triangle" as const) : ("sine" as const),
      }),
    ),
  ),
}) satisfies Readonly<Record<GameFeedbackCue, readonly GameFeedbackToneStep[]>>;

const WEB_VIBRATION = Object.freeze({
  light: 12,
  warning: 28,
  success: Object.freeze([16, 24, 16]),
  heavy: Object.freeze([24, 32, 32]),
}) satisfies Readonly<Record<GameFeedbackHaptic, number | readonly number[]>>;

export function getGameFeedbackTonePlan(
  cue: GameFeedbackCue,
): readonly GameFeedbackToneStep[] {
  return TONE_PLANS[cue];
}

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

export type GameFeedbackRuntimeOptions = Readonly<{
  playHaptic?: (semantic: GameFeedbackHaptic) => Promise<void> | void;
}>;

export type GameFeedbackRuntime = Readonly<{
  emit(action: GameFeedbackAction): void;
  setBgmEnabled(enabled: boolean): void;
  suspend(): void;
  resume(): void;
  stopSfx(): void;
  stopAudio(): void;
  dispose(): void;
}>;

export function createGameFeedbackRuntime(
  options: GameFeedbackRuntimeOptions = {},
): GameFeedbackRuntime {
  let context: AudioContext | null = null;
  let disposed = false;
  let suspended = false;
  let bgmEnabled = false;
  let bgmTimer: number | null = null;
  const activeSfxOscillators = new Set<OscillatorNode>();
  const activeBgmOscillators = new Set<OscillatorNode>();
  const emittedKeys = new Set<string>();

  const stopOscillators = (oscillators: Set<OscillatorNode>): void => {
    for (const oscillator of oscillators) {
      try {
        oscillator.stop();
      } catch {
        // Already stopped oscillators are safe to ignore.
      }
    }
    oscillators.clear();
  };

  const scheduleBgmBar = (audio: AudioContext): void => {
    if (!bgmEnabled || disposed || suspended) return;
    const beatMs = 60_000 / 72;
    const startAt = audio.currentTime + 0.03;
    const frequencies = [261.63, 329.63, 392, 329.63];
    for (const [index, frequencyHz] of frequencies.entries()) {
      try {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const start = startAt + (index * beatMs) / 1_000;
        const end = start + 0.42;
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(frequencyHz, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.012, start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.addEventListener(
          "ended",
          () => activeBgmOscillators.delete(oscillator),
          { once: true },
        );
        activeBgmOscillators.add(oscillator);
        oscillator.start(start);
        oscillator.stop(end);
      } catch {
        // BGM is non-authoritative and may be unavailable on the host.
      }
    }
  };

  const stopBgm = (): void => {
    if (bgmTimer != null && typeof window !== "undefined") {
      window.clearInterval(bgmTimer);
    }
    bgmTimer = null;
    stopOscillators(activeBgmOscillators);
  };

  const startBgm = (audio: AudioContext): void => {
    if (
      !bgmEnabled ||
      disposed ||
      suspended ||
      bgmTimer != null ||
      typeof window === "undefined"
    ) {
      return;
    }
    scheduleBgmBar(audio);
    bgmTimer = window.setInterval(
      () => scheduleBgmBar(audio),
      Math.round((60_000 / 72) * 4),
    );
  };

  const audioContext = (): AudioContext | null => {
    if (disposed || suspended || typeof window === "undefined") return null;
    try {
      const audioWindow = window as AudioWindow;
      const Constructor =
        audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
      if (Constructor == null) return null;
      context ??= new Constructor();
      if (context.state === "suspended") void context.resume().catch(() => {});
      startBgm(context);
      return context;
    } catch {
      return null;
    }
  };

  const stopAudio = (): void => {
    stopOscillators(activeSfxOscillators);
    stopBgm();
  };

  const playTonePlan = (cue: GameFeedbackCue): void => {
    const audio = audioContext();
    if (audio == null) return;
    if (cue === "board-complete") stopOscillators(activeSfxOscillators);

    const startAt = audio.currentTime;
    for (const step of TONE_PLANS[cue]) {
      try {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const start = startAt + step.offsetMs / 1_000;
        const end = start + step.durationMs / 1_000;
        oscillator.type = step.wave;
        oscillator.frequency.setValueAtTime(step.frequencyHz, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(
          step.gain,
          start + Math.min(0.018, step.durationMs / 4_000),
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.addEventListener(
          "ended",
          () => activeSfxOscillators.delete(oscillator),
          { once: true },
        );
        activeSfxOscillators.add(oscillator);
        oscillator.start(start);
        oscillator.stop(end);
      } catch {
        // Feedback is non-authoritative and must never stop gameplay.
      }
    }
  };

  const playHaptic = (semantic: GameFeedbackHaptic): void => {
    try {
      if (options.playHaptic != null) {
        void Promise.resolve(options.playHaptic(semantic)).catch(() => {});
        return;
      }
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.vibrate === "function"
      ) {
        const pattern = WEB_VIBRATION[semantic];
        const vibration =
          typeof pattern === "number" ? pattern : Array.from(pattern);
        navigator.vibrate(vibration);
      }
    } catch {
      // Unsupported/blocked haptics are an expected platform capability gap.
    }
  };

  return Object.freeze({
    emit(action) {
      if (disposed || suspended) return;
      const key = `${action.commandSequence}:${action.cue}`;
      if (emittedKeys.has(key)) return;
      if (emittedKeys.size >= 512) emittedKeys.clear();
      emittedKeys.add(key);
      if (bgmEnabled) audioContext();
      if (action.playSound) playTonePlan(action.cue);
      if (action.haptic != null) playHaptic(action.haptic);
    },
    setBgmEnabled(enabled) {
      if (disposed || bgmEnabled === enabled) return;
      bgmEnabled = enabled;
      if (!enabled) {
        stopBgm();
        return;
      }
      if (context != null) startBgm(context);
    },
    suspend() {
      if (disposed || suspended) return;
      suspended = true;
      stopAudio();
      if (context?.state === "running") void context.suspend().catch(() => {});
    },
    resume() {
      if (disposed || !suspended) return;
      suspended = false;
      if (context?.state === "suspended") void context.resume().catch(() => {});
      if (context != null) startBgm(context);
    },
    stopSfx() {
      stopOscillators(activeSfxOscillators);
    },
    stopAudio,
    dispose() {
      if (disposed) return;
      disposed = true;
      stopAudio();
      const closing = context;
      context = null;
      if (closing != null && closing.state !== "closed") {
        void closing.close().catch(() => {});
      }
    },
  });
}
