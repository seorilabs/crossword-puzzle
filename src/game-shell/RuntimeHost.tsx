import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  fetchFirebaseRuntimeGateSnapshot,
  readCachedFirebaseRuntimeGateSnapshot,
  type FirebaseRuntimeGateSnapshot,
} from "../adapters/firebaseClient.ts";
import {
  GAME_BOOT_PENDING_KEY,
  bootSelectedRuntime,
  isGameRuntimeHostSupported,
  resolveRuntimeSelection,
  type GameRuntimeSession,
  type RuntimeBootLegacyReason,
  type RuntimeSchedulerPort,
} from "./runtimeSelection.ts";
import type { GameExperienceHostKind } from "./GameExperience.tsx";
import "./RuntimeHost.css";

const APP_RUNTIME_VERSION = "0.1.0";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const PENDING_MARKER_KEY = `${GAME_BOOT_PENDING_KEY}:${APP_RUNTIME_VERSION}`;

type RuntimeHostState =
  | { status: "resolving" }
  | { status: "booting" }
  | { status: "game" }
  | { status: "legacy"; reason: RuntimeBootLegacyReason };

type RuntimeHostProps = Readonly<{
  legacy: ReactNode;
}>;

const scheduler: RuntimeSchedulerPort = {
  schedule(delayMs, onElapsed) {
    const handle = window.setTimeout(onElapsed, delayMs);
    return () => window.clearTimeout(handle);
  },
};

function detectHostKind(): GameExperienceHostKind {
  const nativeBridge = (
    window as typeof window & {
      ReactNativeWebView?: { postMessage(message: string): void };
    }
  ).ReactNativeWebView;
  if (nativeBridge != null) return "native-webview";
  return window.navigator.userAgent.includes("TossApp/")
    ? "apps-in-toss"
    : "web";
}

function isValidRuntimeGateSnapshot(
  candidate: unknown,
): candidate is FirebaseRuntimeGateSnapshot {
  if (typeof candidate !== "object" || candidate == null) return false;
  const value = candidate as Partial<FirebaseRuntimeGateSnapshot>;
  return (
    value.schemaVersion === 1 &&
    typeof value.gameRuntimeEnabled === "boolean" &&
    value.valueSource === "remote" &&
    typeof value.fetchTimeMillis === "number" &&
    Number.isFinite(value.fetchTimeMillis)
  );
}

function validateRuntimeGateSnapshot(candidate: unknown) {
  if (!isValidRuntimeGateSnapshot(candidate)) return null;
  const age = Date.now() - candidate.fetchTimeMillis;
  if (age < -5 * 60 * 1_000 || age > CACHE_MAX_AGE_MS) return null;
  return { gameRuntimeEnabled: candidate.gameRuntimeEnabled };
}

function readPendingMarker(): unknown | null {
  const raw = window.localStorage.getItem(PENDING_MARKER_KEY);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

async function waitForGameContainer(
  ref: Readonly<{ current: HTMLDivElement | null }>,
): Promise<HTMLDivElement> {
  for (let frame = 0; frame < 30; frame += 1) {
    if (ref.current != null) return ref.current;
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => resolve()),
    );
  }
  throw new Error("game runtime container did not mount");
}

function createBootId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `boot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

function shouldUseDevelopmentOverride(): boolean {
  return (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("gameRuntime") === "1"
  );
}

export function RuntimeHost({ legacy }: RuntimeHostProps) {
  const [state, setState] = useState<RuntimeHostState>({ status: "resolving" });
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<GameRuntimeSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const hostKind = detectHostKind();
      if (!isGameRuntimeHostSupported(hostKind)) {
        setState({ status: "legacy", reason: "host-adapter-unavailable" });
        return;
      }

      const selection = await resolveRuntimeSelection({
        scheduler,
        readPendingBootMarker: async () => readPendingMarker(),
        fetchRuntimeConfig: async () => {
          if (shouldUseDevelopmentOverride()) {
            return {
              schemaVersion: 1,
              gameRuntimeEnabled: true,
              fetchTimeMillis: Date.now(),
              valueSource: "remote",
            } satisfies FirebaseRuntimeGateSnapshot;
          }
          return fetchFirebaseRuntimeGateSnapshot();
        },
        readCachedRuntimeConfig: readCachedFirebaseRuntimeGateSnapshot,
        validateRuntimeConfig: (candidate) =>
          validateRuntimeGateSnapshot(candidate),
      });

      if (cancelled) return;
      if (selection.target === "legacy") {
        setState({ status: "legacy", reason: selection.reason });
        return;
      }

      setState({ status: "booting" });
      const container = await waitForGameContainer(gameContainerRef);
      if (cancelled) return;

      const result = await bootSelectedRuntime(selection, {
        scheduler,
        createBootId,
        nowEpochMs: Date.now,
        async writePendingBootMarker(marker) {
          const serialized = JSON.stringify(marker);
          window.localStorage.setItem(PENDING_MARKER_KEY, serialized);
          if (window.localStorage.getItem(PENDING_MARKER_KEY) !== serialized) {
            throw new Error("pending marker durable ack failed");
          }
        },
        async clearPendingBootMarker() {
          window.localStorage.removeItem(PENDING_MARKER_KEY);
          if (window.localStorage.getItem(PENDING_MARKER_KEY) != null) {
            throw new Error("pending marker clear ack failed");
          }
        },
        async importGameRuntime() {
          const module = await import("./GameExperience.tsx");
          return module.mountGameExperience(container, {
            hostKind,
          });
        },
      });

      if (cancelled) {
        if (result.target === "game") await result.session.dispose();
        return;
      }
      if (result.target === "game") {
        sessionRef.current = result.session;
        setState({ status: "game" });
      } else {
        setState({ status: "legacy", reason: result.reason });
      }
    };

    void run().catch(() => {
      if (!cancelled) {
        setState({ status: "legacy", reason: "runtime-import-failed" });
      }
    });

    return () => {
      cancelled = true;
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session != null) void session.dispose();
    };
  }, []);

  if (state.status === "legacy") {
    return <div data-runtime-reason={state.reason}>{legacy}</div>;
  }

  if (state.status === "resolving") {
    return (
      <main className="runtimeBootShell" aria-live="polite">
        <div className="runtimeBootMark" aria-hidden="true">
          말길
        </div>
        <strong>퍼즐 세계를 준비하고 있어요</strong>
        <span>안전한 실행 경로를 확인합니다.</span>
      </main>
    );
  }

  return (
    <div className="runtimeGameHost" data-runtime-state={state.status}>
      <div ref={gameContainerRef} className="runtimeGameMount" />
      {state.status === "booting" ? (
        <div className="runtimeBootOverlay" aria-live="polite">
          말길을 복원하고 있어요…
        </div>
      ) : null}
    </div>
  );
}
