import AsyncStorage from '@react-native-async-storage/async-storage';

type AsyncKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

const FIRST_INPUT_GUIDE_SEEN_KEY = 'crossword:first-input-guide-seen';

export async function loadFirstInputGuideSeen(
  storage: AsyncKeyValueStorage = AsyncStorage,
) {
  try {
    return (await storage.getItem(FIRST_INPUT_GUIDE_SEEN_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markFirstInputGuideSeen(
  storage: AsyncKeyValueStorage = AsyncStorage,
) {
  try {
    await storage.setItem(FIRST_INPUT_GUIDE_SEEN_KEY, '1');
  } catch {
    // 저장 실패는 현재 세션의 dismiss와 퍼즐 플레이를 막지 않는다.
  }
}
