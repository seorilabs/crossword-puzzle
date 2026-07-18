import type { KeyValueStoragePort } from "./gameSaveRepository.ts";

const LOWER_SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

export const LAUNCH_PREVIEW_BOARD_COUNT = 7;

export type BrowserStorageLike = Readonly<{
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}>;

export type CreateCanonicalStorageOptions = Readonly<{
  canonical: KeyValueStoragePort;
  migrationSource?: KeyValueStoragePort | null;
  /** Keys that must remain readable by the legacy rollback runtime. */
  shouldMirrorMigrationSource?: (key: string) => boolean;
}>;

export function getLaunchPreviewStoragePrefix(checkpointHash: string): string {
  if (!LOWER_SHA256_HEX_PATTERN.test(checkpointHash)) {
    throw new Error(
      "launch preview storage hash must be exactly 64 lowercase hexadecimal characters",
    );
  }
  return `crossword:dev-launch-preview:${checkpointHash}:${LAUNCH_PREVIEW_BOARD_COUNT}:`;
}

/**
 * 개발 checkpoint 미리보기는 일반 save, migration, boot marker와 같은 key를
 * 사용하더라도 물리적으로 분리된 browser-storage namespace에만 접근한다.
 */
export function createLaunchPreviewGameRuntimeStorage(
  browserStorage: KeyValueStoragePort,
  checkpointHash: string,
): KeyValueStoragePort {
  const prefix = getLaunchPreviewStoragePrefix(checkpointHash);
  const namespacedKey = (key: string) => `${prefix}${key}`;

  return {
    getItem: (key) => browserStorage.getItem(namespacedKey(key)),
    setItem: (key, value) => browserStorage.setItem(namespacedKey(key), value),
    removeItem: (key) => browserStorage.removeItem(namespacedKey(key)),
  };
}

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
  shouldMirrorMigrationSource = () => false,
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
      if (!shouldMirrorMigrationSource(key)) {
        await migrationSource.removeItem(key);
      }
      return legacyValue;
    },
    async setItem(key, value) {
      await canonical.setItem(key, value);
      if ((await canonical.getItem(key)) !== value) {
        throw durableAckError("set");
      }
      if (migrationSource != null) {
        if (shouldMirrorMigrationSource(key)) {
          await migrationSource.setItem(key, value);
          if ((await migrationSource.getItem(key)) !== value) {
            throw durableAckError("set");
          }
        } else {
          await migrationSource.removeItem(key);
        }
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
