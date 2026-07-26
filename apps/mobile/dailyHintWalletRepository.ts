import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  normalizeDailyHintWallet,
  type DailyHintWallet,
  type DailyHintWalletRepository,
} from '../../packages/crossword-core/src';

type AsyncKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type MobileDailyHintWalletRepositoryOptions = {
  keyPrefix?: string;
  storage?: AsyncKeyValueStorage;
};

function getWalletKey(keyPrefix: string, date: string) {
  return `${keyPrefix}:${date}`;
}

export function createMobileDailyHintWalletRepository({
  keyPrefix = 'crossword-puzzle:daily-hints',
  storage = AsyncStorage,
}: MobileDailyHintWalletRepositoryOptions = {}): DailyHintWalletRepository {
  return {
    async loadWallet(date) {
      try {
        const raw = await storage.getItem(getWalletKey(keyPrefix, date));
        if (raw == null) {
          return null;
        }

        return normalizeDailyHintWallet(
          JSON.parse(raw) as Partial<DailyHintWallet>,
          date,
        );
      } catch {
        return null;
      }
    },

    async saveWallet(wallet) {
      try {
        await storage.setItem(
          getWalletKey(keyPrefix, wallet.date),
          JSON.stringify(wallet),
        );
      } catch {
        // Local persistence is best effort.
      }
    },
  };
}
