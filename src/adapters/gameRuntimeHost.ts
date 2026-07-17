import { Storage } from "@apps-in-toss/web-framework";

import type { KeyValueStoragePort } from "../game-shell/gameSaveRepository.ts";
import {
  createBrowserGameRuntimeStorage,
  createCanonicalGameRuntimeStorage,
  type BrowserStorageLike,
} from "../game-shell/gameRuntimeStorage.ts";
import type { GameRuntimeHostKind } from "../game-shell/runtimeSelection.ts";

function getBrowserStorage(): BrowserStorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createAppsInTossStoragePort(): KeyValueStoragePort {
  return {
    getItem: (key) => Storage.getItem(key),
    setItem: (key, value) => Storage.setItem(key, value),
    removeItem: (key) => Storage.removeItem(key),
  };
}

/**
 * Selects the durable storage authority before the game chunk is imported.
 * AIT Storage is canonical; Web Storage is read once only as the live-origin
 * migration source. Native WebView must supply its bridge-backed port instead.
 */
export function createGameRuntimeHostStorage(
  hostKind: GameRuntimeHostKind,
): KeyValueStoragePort {
  const browserStorage = getBrowserStorage();

  if (hostKind === "apps-in-toss") {
    return createCanonicalGameRuntimeStorage({
      canonical: createAppsInTossStoragePort(),
      migrationSource:
        browserStorage == null
          ? null
          : createBrowserGameRuntimeStorage(browserStorage),
    });
  }

  if (hostKind === "web" && browserStorage != null) {
    return createBrowserGameRuntimeStorage(browserStorage);
  }

  throw new Error(`durable runtime storage unavailable for ${hostKind}`);
}
