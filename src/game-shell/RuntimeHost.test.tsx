import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const CHECKPOINT_HASH = "a".repeat(64);
const PREVIEW_PREFIX = `crossword:dev-launch-preview:${CHECKPOINT_HASH}:7:`;

const mocks = vi.hoisted(() => {
  const storageValues = new Map<string, string>();
  const storageOperations: Array<Readonly<{ key: string; operation: string }>> =
    [];
  const session = {
    waitForWebGlContext: vi.fn(async () => undefined),
    waitForBridgeHandshake: vi.fn(async () => undefined),
    waitForFirstInteractiveAck: vi.fn(async () => undefined),
    probeVisibleSurface: vi.fn(() => true),
    dispose: vi.fn(async () => undefined),
  };
  const previewItems = Object.freeze([
    Object.freeze({
      content: Object.freeze({ puzzleId: "preview-1" }),
      mapNodeId: "preview-node-1",
      cardIds: Object.freeze([]),
    }),
  ]);
  const hostStorage = {
    async getItem(key: string) {
      storageOperations.push({ key, operation: "get" });
      return storageValues.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      storageOperations.push({ key, operation: "set" });
      storageValues.set(key, value);
    },
    async removeItem(key: string) {
      storageOperations.push({ key, operation: "remove" });
      storageValues.delete(key);
    },
  };

  return {
    bootSelectedRuntime: vi.fn(),
    captureLegacyWebSaveSnapshot: vi.fn(() => ({ snapshot: "legacy" })),
    createGameRuntimeHostStorage: vi.fn(() => hostStorage),
    fetchFirebaseRuntimeGateSnapshot: vi.fn(),
    hostStorage,
    launchConfig: { gameRuntimeEnabled: false },
    loadLaunchPreviewContent: vi.fn(),
    mountGameExperience: vi.fn(() => session),
    prepareGameSaveMigration: vi.fn(async () => undefined),
    previewItems,
    readActivatedFirebaseLaunchConfig: vi.fn(),
    readCachedFirebaseRuntimeGateSnapshot: vi.fn(async () => null),
    recoverLegacyProjectionOutbox: vi.fn(async () => undefined),
    resolveRuntimeSelection: vi.fn(),
    session,
    storageOperations,
    storageValues,
  };
});

vi.mock("../adapters/firebaseClient.ts", () => ({
  fetchFirebaseRuntimeGateSnapshot: mocks.fetchFirebaseRuntimeGateSnapshot,
  readActivatedFirebaseLaunchConfig: mocks.readActivatedFirebaseLaunchConfig,
  readCachedFirebaseRuntimeGateSnapshot:
    mocks.readCachedFirebaseRuntimeGateSnapshot,
}));

vi.mock("../adapters/gameRuntimeHost.ts", () => ({
  createGameRuntimeHostStorage: mocks.createGameRuntimeHostStorage,
}));

vi.mock("../adapters/legacyWebSaveInventory.ts", () => ({
  captureLegacyWebSaveSnapshot: mocks.captureLegacyWebSaveSnapshot,
}));

vi.mock("./gameSaveMigration.ts", () => ({
  prepareGameSaveMigration: mocks.prepareGameSaveMigration,
  recoverLegacyProjectionOutbox: mocks.recoverLegacyProjectionOutbox,
}));

vi.mock("./launchPreviewContent.ts", () => ({
  loadLaunchPreviewContent: mocks.loadLaunchPreviewContent,
}));

vi.mock("./GameExperience.tsx", () => ({
  mountGameExperience: mocks.mountGameExperience,
}));

vi.mock("./runtimeSelection.ts", () => ({
  GAME_BOOT_PENDING_KEY: "game_boot_pending",
  bootSelectedRuntime: mocks.bootSelectedRuntime,
  isGameRuntimeHostSupported: () => true,
  resolveRuntimeSelection: mocks.resolveRuntimeSelection,
}));

import {
  parseDevelopmentLaunchPreviewRequest,
  RuntimeHost,
} from "./RuntimeHost.tsx";

type MountedGameOptions = Readonly<{
  hostKind: string;
  journeyItems?: readonly unknown[];
  journeyMode?: string;
  launchConfig: unknown;
  storage: Readonly<{
    setItem(key: string, value: string): Promise<void>;
  }>;
}>;

function setLocation(search = "") {
  window.history.replaceState({}, "", `/${search}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storageValues.clear();
  mocks.storageOperations.length = 0;
  mocks.storageValues.set("crossword:game-save:v2", "production-save");
  mocks.storageValues.set("game_boot_pending", "production-marker");
  mocks.readActivatedFirebaseLaunchConfig.mockResolvedValue(mocks.launchConfig);
  mocks.loadLaunchPreviewContent.mockResolvedValue({
    checkpointHash: CHECKPOINT_HASH,
    generatorCommit: "b".repeat(40),
    candidate: true,
    activationApproved: false,
    items: mocks.previewItems,
  });
  mocks.resolveRuntimeSelection.mockImplementation(async (ports) => {
    await ports.readPendingBootMarker();
    const fetched = await ports.fetchRuntimeConfig();
    const validated = await ports.validateRuntimeConfig(fetched, "fetched");
    if (validated?.gameRuntimeEnabled !== true) {
      throw new Error("development runtime gate was not enabled");
    }
    return { target: "game", configSource: "fetched", diagnostics: [] };
  });
  mocks.bootSelectedRuntime.mockImplementation(async (selection, ports) => {
    const marker = {
      schemaVersion: 1,
      bootId: "preview-boot",
      createdAtEpochMs: 1,
    };
    await ports.writePendingBootMarker(marker);
    const session = await ports.importGameRuntime();
    await ports.clearPendingBootMarker();
    return {
      target: "game",
      configSource: selection.configSource,
      bootId: marker.bootId,
      session,
    };
  });
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
  });
  delete (window as typeof window & { ReactNativeWebView?: unknown })
    .ReactNativeWebView;
  setLocation();
});

afterEach(() => {
  cleanup();
  setLocation();
});

describe("development launch preview query", () => {
  test("DEV web의 정확한 gameRuntime/hash 조합만 preview 요청으로 해석한다", () => {
    expect(
      parseDevelopmentLaunchPreviewRequest({
        development: true,
        hostKind: "web",
        search: `?gameRuntime=1&launchPreview=${CHECKPOINT_HASH}`,
      }),
    ).toEqual({ checkpointHash: CHECKPOINT_HASH });

    for (const options of [
      { development: false, hostKind: "web" as const },
      { development: true, hostKind: "apps-in-toss" as const },
      { development: true, hostKind: "native-webview" as const },
    ]) {
      expect(
        parseDevelopmentLaunchPreviewRequest({
          ...options,
          search: `?gameRuntime=1&launchPreview=${CHECKPOINT_HASH}`,
        }),
      ).toBeNull();
    }
  });

  test("DEV web에서 preview query의 hash, 중복, runtime gate 오류를 fail-closed한다", () => {
    for (const search of [
      `?gameRuntime=1&launchPreview=${"A".repeat(64)}`,
      `?gameRuntime=1&launchPreview=${"a".repeat(63)}`,
      `?launchPreview=${CHECKPOINT_HASH}`,
      `?gameRuntime=0&launchPreview=${CHECKPOINT_HASH}`,
      `?gameRuntime=1&launchPreview=${CHECKPOINT_HASH}&launchPreview=${CHECKPOINT_HASH}`,
      `?gameRuntime=1&gameRuntime=1&launchPreview=${CHECKPOINT_HASH}`,
    ]) {
      expect(() =>
        parseDevelopmentLaunchPreviewRequest({
          development: true,
          hostKind: "web",
          search,
        }),
      ).toThrow(/query rejected/);
    }
  });
});

describe("RuntimeHost launch preview integration", () => {
  test("7판 preview를 격리 storage와 함께 mount하고 legacy migration을 생략한다", async () => {
    setLocation(`?gameRuntime=1&launchPreview=${CHECKPOINT_HASH}`);
    render(<RuntimeHost legacy={<span>legacy</span>} />);

    await waitFor(() => expect(mocks.mountGameExperience).toHaveBeenCalled());

    expect(mocks.createGameRuntimeHostStorage).toHaveBeenCalledWith("web");
    expect(mocks.loadLaunchPreviewContent).toHaveBeenCalledWith({
      checkpointHash: CHECKPOINT_HASH,
    });
    expect(mocks.recoverLegacyProjectionOutbox).not.toHaveBeenCalled();
    expect(mocks.captureLegacyWebSaveSnapshot).not.toHaveBeenCalled();
    expect(mocks.prepareGameSaveMigration).not.toHaveBeenCalled();

    const options = (
      mocks.mountGameExperience.mock.calls as unknown as Array<
        [HTMLElement, MountedGameOptions]
      >
    )[0]?.[1];
    expect(options).toBeDefined();
    if (options == null) throw new Error("game mount options unavailable");
    expect(options).toMatchObject({
      hostKind: "web",
      journeyMode: "launch-preview",
      launchConfig: mocks.launchConfig,
    });
    expect(options.journeyItems).toBe(mocks.previewItems);

    await options.storage.setItem("crossword:game-save:v2", "preview-save");
    expect(
      mocks.storageValues.get(`${PREVIEW_PREFIX}crossword:game-save:v2`),
    ).toBe("preview-save");
    expect(mocks.storageValues.get("crossword:game-save:v2")).toBe(
      "production-save",
    );
    expect(mocks.storageValues.get("game_boot_pending")).toBe(
      "production-marker",
    );
    expect(
      mocks.storageOperations.every(({ key }) =>
        key.startsWith(PREVIEW_PREFIX),
      ),
    ).toBe(true);
  });

  test("invalid hash와 checkpoint loader 실패는 legacy로 닫고 mount하지 않는다", async () => {
    setLocation(`?gameRuntime=1&launchPreview=${"A".repeat(64)}`);
    const first = render(<RuntimeHost legacy={<span>invalid legacy</span>} />);
    await waitFor(() =>
      expect(
        first.container.querySelector(
          '[data-runtime-reason="runtime-import-failed"]',
        ),
      ).not.toBeNull(),
    );
    expect(mocks.createGameRuntimeHostStorage).not.toHaveBeenCalled();
    expect(mocks.loadLaunchPreviewContent).not.toHaveBeenCalled();
    expect(mocks.mountGameExperience).not.toHaveBeenCalled();

    cleanup();
    vi.clearAllMocks();
    mocks.storageOperations.length = 0;
    mocks.readActivatedFirebaseLaunchConfig.mockResolvedValue(
      mocks.launchConfig,
    );
    mocks.resolveRuntimeSelection.mockImplementation(async (ports) => {
      await ports.readPendingBootMarker();
      return { target: "game", configSource: "fetched", diagnostics: [] };
    });
    mocks.loadLaunchPreviewContent.mockRejectedValue(
      new Error("tampered checkpoint"),
    );
    setLocation(`?gameRuntime=1&launchPreview=${CHECKPOINT_HASH}`);

    const second = render(<RuntimeHost legacy={<span>loader legacy</span>} />);
    await waitFor(() =>
      expect(
        second.container.querySelector(
          '[data-runtime-reason="runtime-import-failed"]',
        ),
      ).not.toBeNull(),
    );
    expect(mocks.loadLaunchPreviewContent).toHaveBeenCalledTimes(1);
    expect(mocks.mountGameExperience).not.toHaveBeenCalled();
    expect(mocks.recoverLegacyProjectionOutbox).not.toHaveBeenCalled();
    expect(mocks.captureLegacyWebSaveSnapshot).not.toHaveBeenCalled();
    expect(mocks.prepareGameSaveMigration).not.toHaveBeenCalled();
    expect(
      mocks.storageOperations.every(({ key }) =>
        key.startsWith(PREVIEW_PREFIX),
      ),
    ).toBe(true);
  });
});
