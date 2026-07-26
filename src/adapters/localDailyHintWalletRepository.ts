import {
  normalizeDailyHintWallet,
  type DailyHintWallet,
} from "../../packages/crossword-core/src/dailyHintWallet.ts";
import type { DailyHintWalletRepository } from "../../packages/crossword-core/src/repositories.ts";

type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type LocalDailyHintWalletRepositoryOptions = {
  keyPrefix?: string;
  storage?: KeyValueStorage | null;
};

function getDefaultStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function getWalletKey(keyPrefix: string, date: string) {
  return `${keyPrefix}:${date}`;
}

export function createLocalDailyHintWalletRepository({
  keyPrefix = "crossword-puzzle:daily-hints",
  storage = getDefaultStorage(),
}: LocalDailyHintWalletRepositoryOptions = {}): DailyHintWalletRepository {
  return {
    async loadWallet(date) {
      if (storage == null) {
        return null;
      }

      try {
        const raw = storage.getItem(getWalletKey(keyPrefix, date));
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
      if (storage == null) {
        return;
      }

      storage.setItem(
        getWalletKey(keyPrefix, wallet.date),
        JSON.stringify(wallet),
      );
    },
  };
}
