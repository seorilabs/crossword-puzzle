// 정답 입력 방식(box/cell) 설정의 로컬 영속.
// localStorage 직접 접근을 어댑터로 분리해 주입 가능한 storage로 단위 테스트한다.

// Two answer input strategies coexist because per-cell IME handling behaves
// differently across the AIT / Play Store / App Store WebView engines.
// "box": one plain text field per word (stable, IME-safe, default).
// "cell": the hidden native input overlaid on the cells (faster, but fragile).
export type AnswerInputMode = "box" | "cell";

type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const ANSWER_INPUT_MODE_STORAGE_KEY = "crossword:answer-input-mode";

function getDefaultStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// 기본값은 "box"(안정적). 명시적으로 "cell"이 저장된 경우에만 cell로 본다.
export function loadAnswerInputMode(
  storage: KeyValueStorage | null = getDefaultStorage(),
): AnswerInputMode {
  if (storage == null) {
    return "box";
  }
  try {
    return storage.getItem(ANSWER_INPUT_MODE_STORAGE_KEY) === "cell"
      ? "cell"
      : "box";
  } catch {
    return "box";
  }
}

export function saveAnswerInputMode(
  mode: AnswerInputMode,
  storage: KeyValueStorage | null = getDefaultStorage(),
): void {
  if (storage == null) {
    return;
  }
  try {
    storage.setItem(ANSWER_INPUT_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage blocked; the preference applies for this session only.
  }
}
