/* eslint-disable react-refresh/only-export-components */
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  createInitialGameSnapshot,
  GameController,
  type GameSnapshot,
} from "../../packages/crossword-core/src/gameController.ts";
import {
  defaultLaunchConfig,
  type LaunchConfig,
} from "../../packages/crossword-core/src/launchConfig.ts";
import { koKrLanguageProfile } from "../../packages/crossword-core/src/languageProfile.ts";
import {
  getCellKey,
  getEntryCells,
} from "../../packages/crossword-core/src/puzzle.ts";
import type { SavedProgress } from "../../packages/crossword-core/src/types.ts";
import {
  createCrosswordGameRuntime,
  type CrosswordGameInteractiveAck,
  type CrosswordGameRuntime,
} from "../../packages/crossword-game/src/index.ts";
import type {
  GameRuntimeHostKind,
  GameRuntimeSession,
} from "./runtimeSelection.ts";
import {
  createGameSaveRepository,
  DEFAULT_GAME_CELL_JOURNAL_KEY,
  DEFAULT_GAME_SAVE_V2_KEY,
  GameSaveRepositoryError,
  type GameSaveRepository,
  type GameProgressionSnapshot,
  type KeyValueStoragePort,
  type RecordGameCompletionResult,
} from "./gameSaveRepository.ts";
import { createRestoredGameSnapshot } from "./gameRestore.ts";
import { NATIVE_GAME_EVENT } from "./nativeGameEvents.ts";
import { loadBundledOnboardingGameContent } from "./onboardingGameContent.ts";
import "./GameExperience.css";

export type GameExperienceHostKind = GameRuntimeHostKind;

export type MountGameExperienceOptions = Readonly<{
  hostKind: GameExperienceHostKind;
  storage: KeyValueStoragePort;
  bridgeReady?: Promise<void>;
  launchConfig?: LaunchConfig;
}>;

type HostCallbacks = Readonly<{
  onBridgeReady(): void;
  onFatal(error: Error): void;
  onInteractive(ack: CrosswordGameInteractiveAck): void;
}>;

type GameModel = Readonly<{
  completionReward: RecordGameCompletionResult | null;
  controller: GameController;
  progression: GameProgressionSnapshot;
  repository: GameSaveRepository;
  restoreNotice: string | null;
  snapshot: GameSnapshot;
}>;

const ONBOARDING_MAP_NODE_ID =
  "chapter-01-forgotten-path:node:onboarding-easy-01";
const ONBOARDING_KNOWLEDGE_CARD_ID =
  "chapter-01-forgotten-path:card:onboarding-easy-01";

function rewardConfigFromLaunchConfig(config: LaunchConfig) {
  return {
    base: config.memoryInkBase,
    perEntry: config.memoryInkPerEntry,
    chainCap: config.memoryInkChainCap,
  };
}

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  reject(reason: Error): void;
  resolve(value: T): void;
}>;

function createDeferred<T>(): Deferred<T> {
  let settled = false;
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: Error) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  void promise.catch(() => undefined);

  return {
    promise,
    resolve(value) {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    },
    reject(reason) {
      if (settled) return;
      settled = true;
      rejectPromise(reason);
    },
  };
}

async function digestSavePayload(payload: string): Promise<string> {
  const bytes = new TextEncoder().encode(payload);
  if (globalThis.crypto?.subtle != null) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return `sha256:${[...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  // Old WebViews still get deterministic corruption detection. The prefix
  // keeps these values distinguishable from cryptographic digests.
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function readLegacyProgress(puzzleId: string): SavedProgress | undefined {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(`crossword-puzzle:progress:${puzzleId}`);
  } catch {
    return undefined;
  }
  if (raw == null) return undefined;

  try {
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    const rawCells =
      candidate.cellValues != null &&
      typeof candidate.cellValues === "object" &&
      !Array.isArray(candidate.cellValues)
        ? (candidate.cellValues as Record<string, unknown>)
        : {};
    const cellValues = Object.fromEntries(
      Object.entries(rawCells)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [key.replace(",", ":"), value as string]),
    );

    return {
      cellValues,
      earnedHintCredits:
        typeof candidate.earnedHintCredits === "number" &&
        Number.isFinite(candidate.earnedHintCredits)
          ? Math.max(0, Math.floor(candidate.earnedHintCredits))
          : 0,
      hintCount:
        typeof candidate.hintCount === "number" &&
        Number.isFinite(candidate.hintCount)
          ? Math.max(0, Math.floor(candidate.hintCount))
          : 0,
      revealUsed: candidate.revealUsed === true,
      tentativeCells: Array.isArray(candidate.tentativeCells)
        ? candidate.tentativeCells.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
    };
  } catch {
    return undefined;
  }
}

function changedCellKeys(previous: GameSnapshot, next: GameSnapshot): string[] {
  const keys = new Set([
    ...Object.keys(previous.cellValues),
    ...Object.keys(next.cellValues),
  ]);
  return [...keys].filter(
    (key) =>
      (previous.cellValues[key] ?? null) !== (next.cellValues[key] ?? null),
  );
}

async function persistGameTransition(
  repository: GameSaveRepository,
  previous: GameSnapshot,
  next: GameSnapshot,
  boardResolved: boolean,
  entryCount: number,
  launchConfig: LaunchConfig,
): Promise<RecordGameCompletionResult | null> {
  const progress = {
    longestIntersectionChain: next.lastResolvedEntryIds.length,
  };
  if (boardResolved) {
    return repository.recordPuzzleCompletion({
      snapshot: next,
      entryCount,
      mapNodeId: ONBOARDING_MAP_NODE_ID,
      cardIds: [ONBOARDING_KNOWLEDGE_CARD_ID],
      progress,
      rewardConfig: rewardConfigFromLaunchConfig(launchConfig),
    });
  }

  const changed = changedCellKeys(previous, next);
  if (
    changed.length === 1 &&
    next.commandSequence === previous.commandSequence + 1
  ) {
    const cellKey = changed[0];
    try {
      await repository.commitCell({
        snapshot: next,
        cellKey,
        cellValue: next.cellValues[cellKey] ?? null,
        progress,
      });
      return null;
    } catch (error) {
      if (!(error instanceof GameSaveRepositoryError)) throw error;
      // Paste/migration or a non-cell save may legitimately bypass the compact
      // journal; the full sealed snapshot remains the recovery fallback.
    }
  }
  await repository.persistSnapshot(next, progress);
  return null;
}

async function createGameModel(
  storage: KeyValueStoragePort,
  launchConfig: LaunchConfig,
): Promise<GameModel> {
  const content = loadBundledOnboardingGameContent();
  const repository = createGameSaveRepository({
    storage,
    checksumPort: { digest: digestSavePayload },
    uiLocale: "ko-KR",
    inputMode: "word-strip",
  });
  const initial = createInitialGameSnapshot(content);
  const legacy = readLegacyProgress(content.puzzleId);
  const loadResult = await repository.loadPuzzleSnapshot({
    contentLocale: content.contentLocale,
    puzzleId: content.puzzleId,
    contentChecksum: content.contentChecksum,
    legacy:
      legacy == null
        ? undefined
        : {
            progress: legacy,
            sourceVersion: "legacy-web-main",
            migrationChecksum: "legacy-local-progress-v1",
          },
  });

  let restoreNotice: string | null = null;
  let controller: GameController;
  if (loadResult.snapshot != null) {
    controller = new GameController({
      content,
      profile: koKrLanguageProfile,
      initialSnapshot: createRestoredGameSnapshot(
        content,
        koKrLanguageProfile,
        initial,
        loadResult.snapshot,
      ),
    });
    restoreNotice =
      loadResult.status === "migrated"
        ? "기존 진행을 새 게임 저장으로 옮겼어요."
        : "이어서 복원할 위치를 불러왔어요.";
  } else if (
    loadResult.status === "invalid-save" ||
    loadResult.status === "invalid-journal" ||
    loadResult.status === "journal-rejected"
  ) {
    const quarantineSuffix = Date.now().toString(36);
    for (const key of [
      DEFAULT_GAME_SAVE_V2_KEY,
      DEFAULT_GAME_CELL_JOURNAL_KEY,
    ]) {
      const raw = await storage.getItem(key);
      if (raw != null) {
        await storage.setItem(`${key}:quarantine:${quarantineSuffix}`, raw);
        await storage.removeItem(key);
      }
    }
    controller = new GameController({
      content,
      profile: koKrLanguageProfile,
      initialSnapshot: { ...initial, phase: "recovery" },
    });
    controller.dispatch({ type: "recovery.fail" });
    restoreNotice = "손상된 진행 대신 안전한 새 보드로 시작해요.";
  } else {
    controller = new GameController({
      content,
      profile: koKrLanguageProfile,
    });
  }

  const snapshot = controller.getSnapshot();
  await repository.persistSnapshot(snapshot, {
    longestIntersectionChain: snapshot.lastResolvedEntryIds.length,
  });
  const completionReward =
    (snapshot.phase === "result" || snapshot.phase === "map") &&
    snapshot.completedEntryIds.length === content.entries.length
      ? await repository.recordPuzzleCompletion({
          snapshot,
          entryCount: content.entries.length,
          mapNodeId: ONBOARDING_MAP_NODE_ID,
          cardIds: [ONBOARDING_KNOWLEDGE_CARD_ID],
          rewardConfig: rewardConfigFromLaunchConfig(launchConfig),
        })
      : null;
  const progression =
    completionReward?.progression ??
    (await repository.readProgression(content.contentLocale));
  return {
    completionReward,
    controller,
    progression,
    repository,
    restoreNotice,
    snapshot,
  };
}

function getDraftForEntry(
  entryId: string | null,
  snapshot: GameSnapshot,
): string {
  const content = loadBundledOnboardingGameContent();
  const entry = content.entries.find((candidate) => candidate.id === entryId);
  if (entry == null) return "";
  return getEntryCells(entry)
    .map((cell) => snapshot.cellValues[getCellKey(cell.row, cell.col)] ?? "")
    .join("");
}

function GameExperience({
  bridgeReady,
  callbacks,
  hostKind,
  initialLaunchConfig,
  storage,
}: Readonly<{
  callbacks: HostCallbacks;
  bridgeReady?: Promise<void>;
  hostKind: GameExperienceHostKind;
  initialLaunchConfig: LaunchConfig;
  storage: KeyValueStoragePort;
}>) {
  const content = useMemo(loadBundledOnboardingGameContent, []);
  const [model, setModel] = useState<GameModel | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [progression, setProgression] =
    useState<GameProgressionSnapshot | null>(null);
  const [completionReward, setCompletionReward] =
    useState<RecordGameCompletionResult | null>(null);
  const [draft, setDraft] = useState("");
  const [liveMessage, setLiveMessage] = useState("게임을 준비하고 있어요.");
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [saveRetrying, setSaveRetrying] = useState(false);
  const [fatalError, setFatalError] = useState(false);
  const canvasParentRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<CrosswordGameRuntime | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const previousSnapshotRef = useRef<GameSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      if (hostKind === "native-webview") {
        if (bridgeReady == null) {
          throw new Error("native bridge readiness proof unavailable");
        }
        await bridgeReady;
      }
      callbacks.onBridgeReady();
      return createGameModel(storage, initialLaunchConfig);
    };
    void initialize().then(
      (nextModel) => {
        if (cancelled) return;
        previousSnapshotRef.current = nextModel.snapshot;
        setModel(nextModel);
        setSnapshot(nextModel.snapshot);
        setProgression(nextModel.progression);
        setCompletionReward(nextModel.completionReward);
      },
      (error: unknown) => {
        if (cancelled) return;
        setFatalError(true);
        callbacks.onFatal(
          error instanceof Error ? error : new Error("game model boot failed"),
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [bridgeReady, callbacks, hostKind, initialLaunchConfig, storage]);

  useEffect(() => {
    if (model == null) return;
    return model.controller.subscribe((nextSnapshot, events) => {
      const previous = previousSnapshotRef.current ?? nextSnapshot;
      previousSnapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
      runtimeRef.current?.update(nextSnapshot, events);

      const resolved = events.find(
        (event) => event.type === "game.word.resolved",
      );
      if (resolved?.type === "game.word.resolved") {
        setLiveMessage(
          resolved.entryIds.length > 1
            ? "교차하는 말길이 함께 연결됐어요."
            : "정답이에요. 말길이 복원됐어요.",
        );
      } else if (events.some((event) => event.type === "game.board.resolved")) {
        setLiveMessage("모든 말길이 이어져 기억의 정원이 깨어났어요.");
      }

      const boardResolved = events.some(
        (event) => event.type === "game.board.resolved",
      );
      if (boardResolved) setSaveWarning(null);
      void persistGameTransition(
        model.repository,
        previous,
        nextSnapshot,
        boardResolved,
        content.entries.length,
        initialLaunchConfig,
      ).then(
        (reward) => {
          if (reward != null) {
            setCompletionReward(reward);
            setProgression(reward.progression);
          }
          setSaveWarning(null);
        },
        () => {
          setSaveWarning(
            boardResolved
              ? "완료 보상을 저장하지 못했어요. 아래 버튼으로 다시 시도해 주세요."
              : "진행을 저장하지 못했어요. 다음 입력 때 다시 시도합니다.",
          );
        },
      );
    });
  }, [content.entries.length, initialLaunchConfig, model]);

  useEffect(() => {
    if (model == null || canvasParentRef.current == null) {
      return;
    }
    const reducedMotion =
      initialLaunchConfig.worldRestoreMotionLevel === "reduced" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const runtime = createCrosswordGameRuntime({
      parent: canvasParentRef.current,
      content,
      initialSnapshot: model.snapshot,
      reducedMotion,
      onEntrySelect(entryId, context) {
        if (
          model.controller.getSnapshot().commandSequence !==
          context.commandSequence
        ) {
          return;
        }
        model.controller.dispatch({ type: "entry.select", entryId });
      },
      onCommand(request) {
        if (
          model.controller.getSnapshot().commandSequence !==
          request.commandSequence
        ) {
          return;
        }
        model.controller.dispatch(request.command);
      },
      onInteractive(ack) {
        callbacks.onInteractive(ack);
        setLiveMessage("첫 단서를 선택했어요. 답을 완성해 길을 연결해 보세요.");
      },
    });
    runtimeRef.current = runtime;

    return () => {
      runtimeRef.current = null;
      runtime.destroy();
    };
  }, [callbacks, content, initialLaunchConfig.worldRestoreMotionLevel, model]);

  useEffect(() => {
    if (snapshot == null) return;
    setDraft(getDraftForEntry(snapshot.selectedEntryId, snapshot));
    if (snapshot.phase === "active") {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [snapshot]);

  useEffect(() => {
    if (model == null) return;
    const suspend = () => {
      const current = model.controller.getSnapshot();
      if (
        current.phase !== "suspended" &&
        current.phase !== "loading" &&
        current.phase !== "recovery"
      ) {
        model.controller.dispatch({ type: "app.suspend" });
      }
      runtimeRef.current?.suspend();
    };
    const resume = () => {
      if (model.controller.getSnapshot().phase === "suspended") {
        model.controller.dispatch({ type: "app.resume" });
      }
      runtimeRef.current?.resume();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") suspend();
      else resume();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener(NATIVE_GAME_EVENT.pause, suspend);
    window.addEventListener(NATIVE_GAME_EVENT.resume, resume);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(NATIVE_GAME_EVENT.pause, suspend);
      window.removeEventListener(NATIVE_GAME_EVENT.resume, resume);
    };
  }, [model]);

  const selectedEntry =
    snapshot == null
      ? null
      : (content.entries.find(
          (entry) => entry.id === snapshot.selectedEntryId,
        ) ?? null);
  const firstTapMode =
    snapshot != null &&
    selectedEntry?.id === content.entries[0]?.id &&
    snapshot.completedEntryIds.length === 0;
  const candidateCells = useMemo(
    () => [
      ...new Set([
        ...(content.entries[0]?.answerCells ?? []),
        "나",
        "무",
        "집",
        "차",
      ]),
    ],
    [content.entries],
  );

  const dispatchDraft = useCallback(
    (nextDraft: string) => {
      if (model == null || selectedEntry == null) return;
      const cells = koKrLanguageProfile.segmentAnswer(nextDraft);
      model.controller.dispatch({
        type: "input.commit",
        entryId: selectedEntry.id,
        cells,
      });
      if (
        cells.length === selectedEntry.answerCells.length &&
        !model.controller
          .getSnapshot()
          .completedEntryIds.includes(selectedEntry.id)
      ) {
        setLiveMessage("아직 길이 열리지 않았어요. 교차 글자를 살펴보세요.");
      }
    },
    [model, selectedEntry],
  );

  const submitDraft = (event?: FormEvent) => {
    event?.preventDefault();
    dispatchDraft(draft);
  };
  const retryCompletionSave = useCallback(async () => {
    if (
      model == null ||
      snapshot == null ||
      saveRetrying ||
      snapshot.completedEntryIds.length !== content.entries.length
    ) {
      return;
    }

    setSaveRetrying(true);
    setSaveWarning(null);
    try {
      const reward = await model.repository.recordPuzzleCompletion({
        snapshot,
        entryCount: content.entries.length,
        mapNodeId: ONBOARDING_MAP_NODE_ID,
        cardIds: [ONBOARDING_KNOWLEDGE_CARD_ID],
        progress: {
          longestIntersectionChain: snapshot.lastResolvedEntryIds.length,
        },
        rewardConfig: rewardConfigFromLaunchConfig(initialLaunchConfig),
      });
      setCompletionReward(reward);
      setProgression(reward.progression);
      setLiveMessage("완료 보상을 안전하게 보관했어요.");
    } catch {
      setSaveWarning("완료 보상을 아직 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSaveRetrying(false);
    }
  }, [
    content.entries.length,
    initialLaunchConfig,
    model,
    saveRetrying,
    snapshot,
  ]);
  const memoryInkBalance = progression?.memoryInkBalance ?? 0;
  const mapFragmentCount = progression?.mapFragmentCount ?? 0;
  const knowledgeCardCount = progression?.cardIds.length ?? 0;
  const hasOnboardingKnowledgeCard =
    progression?.cardIds.includes(ONBOARDING_KNOWLEDGE_CARD_ID) ?? false;

  if (fatalError) {
    return (
      <main className="gameExperience gameExperienceError" role="alert">
        게임 화면을 열지 못했어요. 기존 퍼즐 화면으로 돌아가고 있습니다.
      </main>
    );
  }

  return (
    <main className="gameExperience" data-game-runtime="phaser-v1">
      <header className="gameTopBar">
        <div>
          <span>기억의 정원 · 첫 번째 말길</span>
          <h1>말길</h1>
        </div>
        <div className="gameTopStatus">
          <div
            className="gameInkBalance"
            aria-label={`기억잉크 ${memoryInkBalance}`}
          >
            <span aria-hidden="true">잉크</span>
            <strong>{memoryInkBalance}</strong>
          </div>
          <div className="gameProgress" aria-label="완성한 단어 수">
            <strong>{snapshot?.completedEntryIds.length ?? 0}</strong>
            <span>/ {content.entries.length}</span>
          </div>
        </div>
      </header>

      <div className="gameCanvasStage" ref={canvasParentRef} />

      {model == null || snapshot == null ? (
        <section className="gamePanel gameBootPanel" aria-live="polite">
          <div className="gameBootGlyph" aria-hidden="true">
            길
          </div>
          <strong>복원할 말길을 찾고 있어요</strong>
          <span>저장과 콘텐츠를 안전하게 확인합니다.</span>
        </section>
      ) : snapshot.phase === "intro" ? (
        <section
          className="gamePanel gameIntroPanel"
          aria-labelledby="game-intro-title"
        >
          <span className="gameEyebrow">첫 10초</span>
          <h2 id="game-intro-title">끊어진 말길을 다시 이어 주세요</h2>
          <p>단서를 풀면 종이 길에 빛이 켜지고 기억의 정원이 깨어나요.</p>
          <button
            className="gamePrimaryButton"
            type="button"
            onClick={() =>
              model.controller.dispatch({ type: "intro.complete" })
            }
          >
            첫 단서 풀기
          </button>
        </section>
      ) : snapshot.phase === "result" ? (
        <section
          className="gamePanel gameResultPanel"
          aria-labelledby="game-result-title"
        >
          <span className="gameRewardIcon" aria-hidden="true">
            ✦
          </span>
          <div>
            <span className="gameEyebrow">장소 복원 완료</span>
            <h2 id="game-result-title">기억의 정원이 깨어났어요</h2>
            <p>
              {completionReward == null
                ? saveWarning == null
                  ? "완료 보상을 확인하고 있어요."
                  : "완료 보상을 아직 보관하지 못했어요."
                : completionReward.status === "granted"
                  ? `지도 조각 1개와 기억잉크 ${completionReward.memoryInkAwarded}개를 보관했어요.`
                  : "이미 받은 첫 완료 보상을 그대로 보관하고 있어요."}
            </p>
          </div>
          {saveWarning == null ? null : (
            <p className="gameSaveAlert" role="alert">
              {saveWarning}
            </p>
          )}
          <ul className="gameRewardList" aria-label="완료 보상">
            <li>
              <span aria-hidden="true">◇</span>
              <strong>지도 조각</strong>
              <b>{mapFragmentCount}</b>
            </li>
            <li>
              <span aria-hidden="true">●</span>
              <strong>기억잉크</strong>
              <b>{memoryInkBalance}</b>
            </li>
            <li>
              <span aria-hidden="true">▤</span>
              <strong>지식 카드</strong>
              <b>{knowledgeCardCount}</b>
            </li>
          </ul>
          <button
            className="gamePrimaryButton"
            type="button"
            disabled={
              completionReward == null && (saveWarning == null || saveRetrying)
            }
            onClick={() => {
              if (completionReward == null) {
                void retryCompletionSave();
                return;
              }
              model.controller.dispatch({ type: "result.continue" });
            }}
          >
            {completionReward != null
              ? "지도에서 계속하기"
              : saveRetrying
                ? "보상 저장 중…"
                : saveWarning == null
                  ? "보상 확인 중…"
                  : "보상 저장 다시 시도"}
          </button>
        </section>
      ) : snapshot.phase === "map" ? (
        <section
          className="gamePanel gameMapPanel"
          aria-labelledby="game-map-title"
        >
          <div className="gameMapPath" aria-hidden="true">
            <span className="isComplete">1</span>
            <i />
            <span>2</span>
            <i />
            <span>3</span>
          </div>
          <div>
            <span className="gameEyebrow">챕터 1 · 1/3</span>
            <h2 id="game-map-title">잊힌 오솔길</h2>
            <p>완료한 말길이 종이 세계의 첫 오솔길로 남았어요.</p>
          </div>
          <dl className="gameMapInventory" aria-label="탐험 보관함">
            <div>
              <dt>지도 조각</dt>
              <dd>{mapFragmentCount}</dd>
            </div>
            <div>
              <dt>기억잉크</dt>
              <dd>{memoryInkBalance}</dd>
            </div>
            <div>
              <dt>지식 카드</dt>
              <dd>{knowledgeCardCount}</dd>
            </div>
          </dl>
          {hasOnboardingKnowledgeCard ? (
            <article
              className="gameKnowledgeCard"
              aria-labelledby="game-knowledge-card-title"
            >
              <span className="gameEyebrow">새 지식 카드</span>
              <h3 id="game-knowledge-card-title">첫 말길의 기억</h3>
              <p>
                {content.entries
                  .slice(0, 3)
                  .map((entry) => entry.answerCells.join(""))
                  .join(" · ")}
              </p>
            </article>
          ) : null}
          <button className="gameSecondaryButton" type="button" disabled>
            검수된 다음 보드 준비 중
          </button>
        </section>
      ) : (
        <section
          className="gamePanel gamePuzzlePanel"
          aria-labelledby="game-clue-title"
        >
          <div className="gameClueHeader">
            <span className="gameEyebrow">
              {selectedEntry?.direction === "down" ? "세로" : "가로"} 단서
            </span>
            <strong>{selectedEntry?.answerCells.length ?? 0}글자</strong>
          </div>
          <h2 id="game-clue-title">
            {selectedEntry?.clue ?? "단서를 선택하세요"}
          </h2>

          {firstTapMode ? (
            <div className="gameTapInput" aria-label="쉬운 음절 입력">
              <div className="gameAnswerSlots" aria-label="입력한 답">
                {selectedEntry?.answerCells.map((_, index) => (
                  <span key={index}>
                    {koKrLanguageProfile.segmentAnswer(draft)[index] ?? ""}
                  </span>
                ))}
              </div>
              <div className="gameCandidateGrid">
                {candidateCells.map((cell) => (
                  <button
                    key={cell}
                    type="button"
                    onClick={() => {
                      const current = koKrLanguageProfile.segmentAnswer(draft);
                      if (
                        current.length >=
                        (selectedEntry?.answerCells.length ?? 0)
                      )
                        return;
                      const next = [...current, cell].join("");
                      setDraft(next);
                      dispatchDraft(next);
                    }}
                  >
                    {cell}
                  </button>
                ))}
                <button
                  className="gameDeleteButton"
                  type="button"
                  aria-label="마지막 음절 지우기"
                  onClick={() => {
                    const next = koKrLanguageProfile
                      .segmentAnswer(draft)
                      .slice(0, -1)
                      .join("");
                    setDraft(next);
                    dispatchDraft(next);
                  }}
                >
                  지우기
                </button>
              </div>
            </div>
          ) : (
            <form className="gameWordForm" onSubmit={submitDraft}>
              <label htmlFor="game-word-input">선택한 단어 답</label>
              <div>
                <input
                  ref={inputRef}
                  id="game-word-input"
                  value={draft}
                  autoComplete="off"
                  autoCorrect="off"
                  enterKeyHint="done"
                  spellCheck={false}
                  maxLength={(selectedEntry?.answerCells.length ?? 1) * 3}
                  onCompositionStart={() => {
                    composingRef.current = true;
                    if (model.controller.getSnapshot().phase === "active") {
                      model.controller.dispatch({ type: "composition.start" });
                    }
                  }}
                  onCompositionEnd={(event) => {
                    composingRef.current = false;
                    setDraft(event.currentTarget.value);
                    dispatchDraft(event.currentTarget.value);
                  }}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setDraft(next);
                    if (!composingRef.current && next === "")
                      dispatchDraft(next);
                  }}
                />
                <button type="submit">확인</button>
              </div>
            </form>
          )}

          <div className="gameClueRail" aria-label="단서 목록">
            {content.entries.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={snapshot.selectedEntryId === entry.id}
                className={
                  snapshot.completedEntryIds.includes(entry.id)
                    ? "isComplete"
                    : ""
                }
                onClick={() =>
                  model.controller.dispatch({
                    type: "entry.select",
                    entryId: entry.id,
                  })
                }
              >
                <span>
                  {entry.direction === "down" ? "세" : "가"}
                  {index + 1}
                </span>
                {snapshot.completedEntryIds.includes(entry.id)
                  ? "완료"
                  : entry.answerCells.length}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="gameLiveRegion" aria-live="polite" aria-atomic="true">
        {model?.restoreNotice ?? liveMessage}
        {saveWarning == null ? "" : ` ${saveWarning}`}
      </div>
    </main>
  );
}

class GameExperienceErrorBoundary extends Component<
  Readonly<{ children: ReactNode; onError(error: Error): void }>,
  Readonly<{ failed: boolean }>
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="gameExperience gameExperienceError" role="alert">
          게임 화면을 복구하고 있어요.
        </main>
      );
    }
    return this.props.children;
  }
}

export function mountGameExperience(
  container: HTMLElement,
  options: MountGameExperienceOptions,
): GameRuntimeSession {
  const webGlReady = createDeferred<void>();
  const bridgeReady = createDeferred<void>();
  const interactiveReady = createDeferred<void>();
  let disposed = false;
  let root: Root | null = createRoot(container);

  const rejectBoot = (error: Error) => {
    webGlReady.reject(error);
    bridgeReady.reject(error);
    interactiveReady.reject(error);
  };

  const callbacks: HostCallbacks = {
    onBridgeReady() {
      bridgeReady.resolve(undefined);
    },
    onFatal(error) {
      rejectBoot(error);
    },
    onInteractive() {
      webGlReady.resolve(undefined);
      interactiveReady.resolve(undefined);
    },
  };

  root.render(
    <GameExperienceErrorBoundary onError={rejectBoot}>
      <GameExperience
        bridgeReady={options.bridgeReady}
        callbacks={callbacks}
        hostKind={options.hostKind}
        initialLaunchConfig={options.launchConfig ?? defaultLaunchConfig}
        storage={options.storage}
      />
    </GameExperienceErrorBoundary>,
  );

  return {
    waitForWebGlContext: () => webGlReady.promise,
    waitForBridgeHandshake: () => bridgeReady.promise,
    waitForFirstInteractiveAck: () => interactiveReady.promise,
    probeVisibleSurface: () => {
      const canvas = container.querySelector("canvas");
      const experience = container.querySelector(".gameExperience");
      if (!(canvas instanceof HTMLCanvasElement) || experience == null) {
        return false;
      }
      const canvasRect = canvas.getBoundingClientRect();
      const experienceRect = experience.getBoundingClientRect();
      return (
        canvas.getAttribute("aria-hidden") === "true" &&
        canvasRect.width > 0 &&
        canvasRect.height > 0 &&
        experienceRect.width > 0 &&
        experienceRect.height > 0
      );
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      rejectBoot(new Error("game experience disposed during boot"));
      root?.unmount();
      root = null;
      container.replaceChildren();
    },
  };
}
