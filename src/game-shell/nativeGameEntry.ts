import {
  normalizeLaunchConfig,
  type LaunchConfig,
} from "../../packages/crossword-core/src/launchConfig.ts";
import { mountGameExperience } from "./GameExperience.tsx";
import { createDefaultNativeGameBridgeClient } from "./nativeGameBridge.ts";
import "../index.css";

type AssetManifest = Readonly<{
  schemaVersion: 1;
  aggregateChecksum: string;
}>;

function isAssetManifest(value: unknown): value is AssetManifest {
  if (typeof value !== "object" || value == null) return false;
  const candidate = value as Partial<AssetManifest>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.aggregateChecksum === "string" &&
    /^sha256:[a-f0-9]{64}$/.test(candidate.aggregateChecksum)
  );
}

async function loadAssetManifest(): Promise<AssetManifest> {
  const response = await fetch("./asset-manifest.json", {
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) throw new Error("native asset manifest unavailable");
  const candidate = (await response.json()) as unknown;
  if (!isAssetManifest(candidate)) {
    throw new Error("native asset manifest invalid");
  }
  return candidate;
}

async function main(): Promise<void> {
  const container = document.getElementById("root");
  if (container == null) throw new Error("native game root unavailable");

  const bridge = createDefaultNativeGameBridgeClient();
  const bridgeReady = bridge.waitUntilReady();
  const [manifest, configSnapshot] = await Promise.all([
    loadAssetManifest(),
    bridgeReady.then(() => bridge.waitForConfigSnapshot()),
  ]);
  if (configSnapshot.version !== "launch-config/v1") {
    throw new Error("native game launch config version mismatch");
  }
  const launchConfig = normalizeLaunchConfig(
    configSnapshot.values as Partial<LaunchConfig>,
  );
  const runtime = mountGameExperience(container, {
    hostKind: "native-webview",
    storage: bridge.storage,
    bridgeReady,
    launchConfig,
    playHaptic: (semantic) => bridge.playHaptic(semantic),
  });

  const [activeContentIdentity] = await Promise.all([
    runtime.waitForActiveContentIdentity(),
    runtime.waitForWebGlContext(),
    runtime.waitForFirstInteractiveAck(),
  ]);
  if (!(await runtime.probeVisibleSurface())) {
    throw new Error("native game visible surface unavailable");
  }

  await bridge.reportRuntimeReady({
    renderer: "webgl",
    scene: "puzzle",
    visible: true,
    contentChecksum: activeContentIdentity.contentChecksum,
    contentLocale: activeContentIdentity.contentLocale,
    puzzleId: activeContentIdentity.puzzleId,
    assetManifestChecksum: manifest.aggregateChecksum,
  });

  window.addEventListener(
    "pagehide",
    () => {
      bridge.dispose();
      void runtime.dispose();
    },
    { once: true },
  );
}

void main().catch(() => {
  document.documentElement.dataset.gameBoot = "failed";
});
