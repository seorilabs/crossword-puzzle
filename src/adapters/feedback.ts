// 경량 사운드·햅틱 피드백 (웹/AIT WebView).
// - 사운드: Web Audio API로 짧은 톤을 합성한다(번들에 오디오 에셋을 넣지 않음).
// - 햅틱: navigator.vibrate(지원 환경).
// AudioContext는 첫 호출(사용자 입력 제스처 중) 시 lazy 생성·resume 해 브라우저
// 자동재생 정책을 준수한다. 어떤 채널을 줄지는 crossword-core의 순수 정책
// (resolveFeedbackActions)이 설정값으로 결정하고, 이 어댑터는 실제 출력만 맡는다.

import {
  resolveFeedbackActions,
  type FeedbackKind,
  type FeedbackSettings,
} from "../../packages/crossword-core/src";

type WindowWithWebkitAudio = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const win = window as WindowWithWebkitAudio;
    const Ctor = win.AudioContext ?? win.webkitAudioContext;
    if (Ctor == null) {
      return null;
    }
    if (audioContext == null) {
      audioContext = new Ctor();
    }
    // 자동재생 정책으로 suspended 상태면 사용자 제스처 중에 resume 한다.
    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }
    return audioContext;
  } catch {
    return null;
  }
}

// 시점별 톤(주파수 시퀀스 Hz, 음당 길이 초). 완성/완료는 상승 멜로디, 오답은
// 짧은 저음.
const TONES: Record<FeedbackKind, { freqs: number[]; step: number }> = {
  wordComplete: { freqs: [660, 880], step: 0.1 },
  puzzleComplete: { freqs: [523, 659, 784, 1047], step: 0.13 },
  wrong: { freqs: [196], step: 0.16 },
};

function playFeedbackSound(kind: FeedbackKind): void {
  const ctx = getAudioContext();
  if (ctx == null) {
    return;
  }
  try {
    const { freqs, step } = TONES[kind];
    const now = ctx.currentTime;
    freqs.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === "wrong" ? "sawtooth" : "sine";
      osc.frequency.value = freq;
      const start = now + index * step;
      const end = start + step;
      // 클릭음을 피하려 짧게 페이드 인/아웃.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end);
    });
  } catch {
    // 오디오 실패는 비핵심이므로 조용히 무시한다.
  }
}

const VIBRATION: Record<FeedbackKind, number | number[]> = {
  wordComplete: 18,
  puzzleComplete: [24, 36, 24],
  wrong: 40,
};

function triggerHaptic(kind: FeedbackKind): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }
  try {
    navigator.vibrate(VIBRATION[kind]);
  } catch {
    // 미지원/차단 환경은 무시한다.
  }
}

// 설정에 따라 해당 시점의 사운드·햅틱을 발생시킨다. 정책 판단은 core에 위임한다.
export function emitFeedback(
  kind: FeedbackKind,
  settings: FeedbackSettings,
): void {
  const { playSound, vibrate } = resolveFeedbackActions(kind, settings);
  if (playSound) {
    playFeedbackSound(kind);
  }
  if (vibrate) {
    triggerHaptic(kind);
  }
}
