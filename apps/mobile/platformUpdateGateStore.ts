import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GatePromptLog, GateStore } from '@seorilabs/platform-sdk';

type AsyncKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

const UPDATE_GATE_STORAGE_KEY = 'crossword-puzzle:update-gate';

function isGatePromptLog(value: unknown): value is GatePromptLog {
  if (value == null || typeof value !== 'object') {
    return false;
  }
  const log = value as Partial<GatePromptLog>;
  return typeof log.version === 'string' && typeof log.promptedAt === 'number';
}

/**
 * RN에는 localStorage가 없다 — SDK 기본 gateStore(브라우저 저장소)는 메모리로
 * 떨어져 앱을 다시 켤 때마다 권장 안내가 다시 뜬다. AsyncStorage로 노출 이력을
 * 영속해 하루 1회 제한이 재시작 후에도 유지되게 한다.
 */
export function createAsyncStorageGateStore(
  storage: AsyncKeyValueStorage = AsyncStorage,
): GateStore {
  return {
    async load() {
      try {
        const raw = await storage.getItem(UPDATE_GATE_STORAGE_KEY);
        if (!raw) {
          return null;
        }
        const value: unknown = JSON.parse(raw);
        return isGatePromptLog(value) ? value : null;
      } catch {
        return null;
      }
    },
    async save(log: GatePromptLog) {
      try {
        await storage.setItem(UPDATE_GATE_STORAGE_KEY, JSON.stringify(log));
      } catch {
        // 저장 실패가 안내 노출을 막으면 안 된다. 다음에 한 번 더 뜰 뿐이다.
      }
    },
  };
}
