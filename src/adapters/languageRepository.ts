import { translate } from "../../packages/crossword-core/src/uiCopy.ts";
import {
  defaultLanguage,
  LANGUAGE_STORAGE_KEY,
  type ContentLanguage,
} from "../../packages/crossword-core/src/dailyLanguage.ts";
export function loadLanguage(): ContentLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === "ko" || stored === "en") return stored;
    for (let i = 0; i < localStorage.length; i++)
      if (
        /^crossword-puzzle:(progress|mission|archive)/.test(
          localStorage.key(i) ?? "",
        )
      ) {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, "ko");
        return "ko";
      }
    const initial = defaultLanguage(navigator.language);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, initial);
    return initial;
  } catch {
    /* Use the device locale if storage is unavailable. */
  }
  return defaultLanguage(navigator.language);
}
export function saveLanguage(language: ContentLanguage) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

let activeLanguage: ContentLanguage = "ko";
export function setUiLanguage(language: ContentLanguage) {
  activeLanguage = language;
}
export function t(source: string, ...values: unknown[]) {
  return translate(activeLanguage, source, ...values);
}

export function getUiLanguage() {
  return activeLanguage;
}
