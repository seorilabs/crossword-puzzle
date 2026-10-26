import { translate } from '../../packages/crossword-core/src/uiCopy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  defaultLanguage,
  LANGUAGE_STORAGE_KEY,
  type ContentLanguage,
} from '../../packages/crossword-core/src/dailyLanguage';
export async function loadLanguage(): Promise<ContentLanguage> {
  const fallback = defaultLanguage(
    Intl.DateTimeFormat().resolvedOptions().locale,
  );
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'ko' || stored === 'en') return stored;
    const legacy = (await AsyncStorage.getAllKeys()).some(key =>
      /^crossword-puzzle:(progress|mission|archive)/.test(key),
    );
    const initial = legacy ? 'ko' : fallback;
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, initial);
    return initial;
  } catch {
    return fallback;
  }
}
export async function saveLanguage(language: ContentLanguage) {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

let activeLanguage: ContentLanguage = 'ko';
export function setUiLanguage(language: ContentLanguage) {
  activeLanguage = language;
}
export function t(source: string, ...values: unknown[]) {
  return translate(activeLanguage, source, ...values);
}

export function getUiLanguage() {
  return activeLanguage;
}
