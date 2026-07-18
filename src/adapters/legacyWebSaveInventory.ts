import {
  createLegacyRawSnapshot,
  isLegacyCrosswordStorageKey,
  type LegacyRawSnapshotV1,
  type LegacySaveMarket,
} from "../../packages/crossword-core/src/legacySaveMigration.ts";

export type EnumerableBrowserStorage = Readonly<{
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
}>;

export type CaptureLegacyWebSaveOptions = Readonly<{
  storage: EnumerableBrowserStorage;
  market: Extract<LegacySaveMarket, "apps-in-toss" | "web">;
  sourceVersion: string;
  capturedAt: string;
}>;

/** Captures raw values before the migration performs its first mutation. */
export function captureLegacyWebSaveSnapshot({
  storage,
  market,
  sourceVersion,
  capturedAt,
}: CaptureLegacyWebSaveOptions): LegacyRawSnapshotV1 {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key != null && isLegacyCrosswordStorageKey(key)) keys.push(key);
  }

  const records = [...new Set(keys)].sort().flatMap((key) => {
    const rawValue = storage.getItem(key);
    return rawValue == null ? [] : [{ key, rawValue }];
  });
  return createLegacyRawSnapshot({
    market,
    sourceVersion,
    capturedAt,
    records,
  });
}
