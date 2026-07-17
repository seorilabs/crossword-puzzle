import type { KeyValueStoragePort } from "./gameSaveRepository.ts";

export type BrowserStorageLike = Readonly<{
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}>;

export type CreateCanonicalStorageOptions = Readonly<{
  canonical: KeyValueStoragePort;
  migrationSource?: KeyValueStoragePort | null;
}>;

function durableAckError(operation: "set" | "remove"): Error {
  return new Error(`game runtime storage ${operation} acknowledgement failed`);
}

/**
 * Browser/local test host storage. Mutations resolve only after a read-back,
 * so the runtime watchdog never clears a boot marker on a best-effort write.
 */
export function createBrowserGameRuntimeStorage(
  storage: BrowserStorageLike,
): KeyValueStoragePort {
  return {
    async getItem(key) {
      return storage.getItem(key);
    },
    async setItem(key, value) {
      storage.setItem(key, value);
      if (storage.getItem(key) !== value) {
        throw durableAckError("set");
      }
    },
    async removeItem(key) {
      storage.removeItem(key);
      if (storage.getItem(key) != null) {
        throw durableAckError("remove");
      }
    },
  };
}

/**
 * AIT/native canonical storage with one-way migration from the previous host.
 *
 * The migration source is removed only after canonical read-back succeeds.
 * This prevents a stale localStorage/legacy value from being promoted again
 * after a canonical delete and makes repeated migration idempotent.
 */
export function createCanonicalGameRuntimeStorage({
  canonical,
  migrationSource = null,
}: CreateCanonicalStorageOptions): KeyValueStoragePort {
  return {
    async getItem(key) {
      const canonicalValue = await canonical.getItem(key);
      if (canonicalValue != null || migrationSource == null) {
        return canonicalValue;
      }

      const legacyValue = await migrationSource.getItem(key);
      if (legacyValue == null) {
        return null;
      }

      await canonical.setItem(key, legacyValue);
      if ((await canonical.getItem(key)) !== legacyValue) {
        throw durableAckError("set");
      }
      await migrationSource.removeItem(key);
      return legacyValue;
    },
    async setItem(key, value) {
      await canonical.setItem(key, value);
      if ((await canonical.getItem(key)) !== value) {
        throw durableAckError("set");
      }
      if (migrationSource != null) {
        await migrationSource.removeItem(key);
      }
    },
    async removeItem(key) {
      await canonical.removeItem(key);
      if ((await canonical.getItem(key)) != null) {
        throw durableAckError("remove");
      }
      if (migrationSource != null) {
        await migrationSource.removeItem(key);
      }
    },
  };
}
