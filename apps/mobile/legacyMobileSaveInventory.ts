import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  createLegacyRawSnapshot,
  isLegacyCrosswordStorageKey,
  type LegacyRawSnapshotV1,
  type LegacySaveMarket,
} from '../../packages/crossword-core/src/legacySaveMigration.ts';

export type MobileLegacyInventoryStorage = Readonly<{
  getAllKeys(): Promise<readonly string[]>;
  getMany(keys: string[]): Promise<Readonly<Record<string, string | null>>>;
}>;

export type CaptureMobileLegacySaveOptions = Readonly<{
  market: Extract<LegacySaveMarket, 'app-store' | 'google-play'>;
  sourceVersion: string;
  capturedAt: string;
  storage?: MobileLegacyInventoryStorage;
}>;

/**
 * Runs in the native host, before the WebView is imported. Full archive values
 * therefore never cross the 64 KiB game bridge wire limit.
 */
export async function captureMobileLegacySaveSnapshot({
  market,
  sourceVersion,
  capturedAt,
  storage = AsyncStorage,
}: CaptureMobileLegacySaveOptions): Promise<LegacyRawSnapshotV1> {
  const keys = [...new Set(await storage.getAllKeys())]
    .filter(isLegacyCrosswordStorageKey)
    .sort();
  const valueByKey = await storage.getMany(keys);
  const records = keys.flatMap(key => {
    const rawValue = valueByKey[key] ?? null;
    return rawValue == null ? [] : [{ key, rawValue }];
  });
  return createLegacyRawSnapshot({
    market,
    sourceVersion,
    capturedAt,
    records,
  });
}
