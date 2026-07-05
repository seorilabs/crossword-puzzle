// 라이브 타이머 표시/숨김 설정의 로컬 영속(#233).
// 타이머 표시 여부는 표시 취향일 뿐 코어/시장 공유가 필요한 정책값이 아니므로,
// autocheck 등 다른 표시 설정과 동일하게 localStorage 어댑터로 분리해 주입
// 가능한 storage로 단위 테스트한다.

type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const TIMER_VISIBLE_STORAGE_KEY = "crossword:timer-visible";

function getDefaultStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// 기본값은 표시(기존 동작 유지). "0"으로 저장된 경우에만 숨김으로 본다.
export function loadTimerVisible(
  storage: KeyValueStorage | null = getDefaultStorage(),
): boolean {
  if (storage == null) {
    return true;
  }
  try {
    return storage.getItem(TIMER_VISIBLE_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveTimerVisible(
  visible: boolean,
  storage: KeyValueStorage | null = getDefaultStorage(),
): void {
  if (storage == null) {
    return;
  }
  try {
    storage.setItem(TIMER_VISIBLE_STORAGE_KEY, visible ? "1" : "0");
  } catch {
    // Storage blocked; the preference applies for this session only.
  }
}
