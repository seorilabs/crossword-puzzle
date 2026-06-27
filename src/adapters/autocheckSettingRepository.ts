// 상시 오답표시(autocheck) on/off 설정의 로컬 영속.
// localStorage 접근을 어댑터로 분리해 주입 가능한 storage로 단위 테스트한다.

type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const AUTOCHECK_STORAGE_KEY = "crossword:autocheck-enabled";

function getDefaultStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// 기본값은 켜짐(기존 동작 유지). "0"으로 저장된 경우에만 꺼짐으로 본다.
export function loadAutocheckEnabled(
  storage: KeyValueStorage | null = getDefaultStorage(),
): boolean {
  if (storage == null) {
    return true;
  }
  try {
    return storage.getItem(AUTOCHECK_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveAutocheckEnabled(
  enabled: boolean,
  storage: KeyValueStorage | null = getDefaultStorage(),
): void {
  if (storage == null) {
    return;
  }
  try {
    storage.setItem(AUTOCHECK_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Storage blocked; the preference applies for this session only.
  }
}
