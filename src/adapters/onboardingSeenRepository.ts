// 온보딩 1회성 노출 플래그(사용법 안내·첫 입력 가이드)의 로컬 영속.
// localStorage 직접 접근을 어댑터로 분리해 주입 가능한 storage로 단위 테스트한다.

type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const HOW_TO_PLAY_SEEN_KEY = "crossword:how-to-play-seen";
const FIRST_INPUT_GUIDE_SEEN_KEY = "crossword:first-input-guide-seen";

function getDefaultStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function loadSeen(
  key: string,
  storage: KeyValueStorage | null = getDefaultStorage(),
): boolean {
  if (storage == null) {
    return false;
  }
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markSeen(
  key: string,
  storage: KeyValueStorage | null = getDefaultStorage(),
): void {
  if (storage == null) {
    return;
  }
  try {
    storage.setItem(key, "1");
  } catch {
    // Storage blocked; the flag applies for this session only.
  }
}

export function loadHowToPlaySeen(storage?: KeyValueStorage | null): boolean {
  return loadSeen(HOW_TO_PLAY_SEEN_KEY, storage);
}

export function markHowToPlaySeen(storage?: KeyValueStorage | null): void {
  markSeen(HOW_TO_PLAY_SEEN_KEY, storage);
}

export function loadFirstInputGuideSeen(
  storage?: KeyValueStorage | null,
): boolean {
  return loadSeen(FIRST_INPUT_GUIDE_SEEN_KEY, storage);
}

export function markFirstInputGuideSeen(storage?: KeyValueStorage | null): void {
  markSeen(FIRST_INPUT_GUIDE_SEEN_KEY, storage);
}
