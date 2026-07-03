// 사운드·햅틱·글자 크기 설정의 로컬 영속.
// localStorage 접근을 어댑터로 분리해 주입 가능한 storage로 단위 테스트한다.

import {
  DEFAULT_TEXT_SCALE,
  normalizeTextScale,
  type TextScale,
} from "../../packages/crossword-core/src/textScale.ts";

type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const SOUND_STORAGE_KEY = "crossword:sound-enabled";
const HAPTIC_STORAGE_KEY = "crossword:haptic-enabled";
const TEXT_SCALE_STORAGE_KEY = "crossword:text-scale";

function getDefaultStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// 기본값은 켜짐. "0"으로 저장된 경우에만 꺼짐으로 본다.
function loadEnabled(key: string, storage: KeyValueStorage | null): boolean {
  if (storage == null) {
    return true;
  }
  try {
    return storage.getItem(key) !== "0";
  } catch {
    return true;
  }
}

function saveEnabled(
  key: string,
  enabled: boolean,
  storage: KeyValueStorage | null,
): void {
  if (storage == null) {
    return;
  }
  try {
    storage.setItem(key, enabled ? "1" : "0");
  } catch {
    // Storage blocked; the preference applies for this session only.
  }
}

export function loadSoundEnabled(
  storage: KeyValueStorage | null = getDefaultStorage(),
): boolean {
  return loadEnabled(SOUND_STORAGE_KEY, storage);
}

export function saveSoundEnabled(
  enabled: boolean,
  storage: KeyValueStorage | null = getDefaultStorage(),
): void {
  saveEnabled(SOUND_STORAGE_KEY, enabled, storage);
}

export function loadHapticEnabled(
  storage: KeyValueStorage | null = getDefaultStorage(),
): boolean {
  return loadEnabled(HAPTIC_STORAGE_KEY, storage);
}

export function saveHapticEnabled(
  enabled: boolean,
  storage: KeyValueStorage | null = getDefaultStorage(),
): void {
  saveEnabled(HAPTIC_STORAGE_KEY, enabled, storage);
}

// 글자 크기(접근성). 저장값은 core의 normalizeTextScale로 정규화해 오염/구버전
// 값도 안전한 기본값(보통)으로 폴백한다.
export function loadTextScale(
  storage: KeyValueStorage | null = getDefaultStorage(),
): TextScale {
  if (storage == null) {
    return DEFAULT_TEXT_SCALE;
  }
  try {
    return normalizeTextScale(storage.getItem(TEXT_SCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_TEXT_SCALE;
  }
}

export function saveTextScale(
  scale: TextScale,
  storage: KeyValueStorage | null = getDefaultStorage(),
): void {
  if (storage == null) {
    return;
  }
  try {
    storage.setItem(TEXT_SCALE_STORAGE_KEY, normalizeTextScale(scale));
  } catch {
    // Storage blocked; the preference applies for this session only.
  }
}
