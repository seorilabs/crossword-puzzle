/* eslint-disable react-refresh/only-export-components */
import {
  Component,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";

import type { GameSnapshot } from "../../packages/crossword-core/src/gameController.ts";
import type { GameContentV1 } from "../../packages/crossword-core/src/gameContent.ts";
import {
  projectGameFeedbackActions,
  type GameFeedbackHaptic,
} from "../../packages/crossword-core/src/gameFeedback.ts";
import {
  DEFAULT_GAME_EXPERIENCE_PREFERENCES,
  getGameTextScaleMultiplier,
  resolveHighContrast,
  resolveReducedMotion,
  type GameExperiencePreferences,
} from "../../packages/crossword-core/src/gamePreferences.ts";
import {
  defaultLaunchConfig,
  type LaunchConfig,
} from "../../packages/crossword-core/src/launchConfig.ts";
import { koKrLanguageProfile } from "../../packages/crossword-core/src/languageProfile.ts";
import {
  getCellKey,
  getEntryCells,
} from "../../packages/crossword-core/src/puzzle.ts";
import {
  createCrosswordGameRuntime,
  type CrosswordGameInteractiveAck,
  type CrosswordGameRuntime,
} from "../../packages/crossword-game/src/index.ts";
import type {
  ContentAwareGameRuntimeSession,
  GameRuntimeHostKind,
  GameRuntimeContentIdentity,
} from "./runtimeSelection.ts";
import {
  type GameProgressionSnapshot,
  type KeyValueStoragePort,
  type RecordGameCompletionResult,
} from "./gameSaveRepository.ts";
import { NATIVE_GAME_EVENT } from "./nativeGameEvents.ts";
import {
  BUNDLED_ONBOARDING_KNOWLEDGE_CARD_ID,
  loadBundledFirstRunGameContents,
  loadBundledOnboardingGameContent,
  loadBundledOnboardingKnowledgeCard,
} from "./onboardingGameContent.ts";
import { initSafeAreaInsets } from "../adapters/safeArea.ts";
import {
  createGameFeedbackRuntime,
  type GameFeedbackRuntime,
} from "./gameFeedbackRuntime.ts";
import {
  createGameModel,
  persistGameTransition,
  rewardConfigFromLaunchConfig,
  type FirstRunGameModel,
  type GameJourneyItem,
} from "./firstRunGameModel.ts";
import "./GameExperience.css";

export type GameExperienceHostKind = GameRuntimeHostKind;

export type MountGameExperienceOptions = Readonly<{
  hostKind: GameExperienceHostKind;
  storage: KeyValueStoragePort;
  bridgeReady?: Promise<void>;
  journeyItems?: readonly GameJourneyItem[];
  journeyMode?: "launch-preview";
  launchConfig?: LaunchConfig;
  playHaptic?: (semantic: GameFeedbackHaptic) => Promise<void> | void;
}>;

type HostCallbacks = Readonly<{
  onActiveContentIdentity(identity: GameRuntimeContentIdentity): void;
  onBridgeReady(): void;
  onFatal(error: Error): void;
  onInteractive(ack: CrosswordGameInteractiveAck): void;
}>;

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

function useMediaPreference(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? false
      : window.matchMedia(query).matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [query]);

  return matches;
}

function getDraftForEntry(
  content: GameContentV1,
  entryId: string | null,
  snapshot: GameSnapshot,
): string {
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
  journeyItems,
  journeyMode,
  playHaptic,
  storage,
}: Readonly<{
  callbacks: HostCallbacks;
  bridgeReady?: Promise<void>;
  hostKind: GameExperienceHostKind;
  initialLaunchConfig: LaunchConfig;
  journeyItems?: readonly GameJourneyItem[];
  journeyMode?: "launch-preview";
  playHaptic?: (semantic: GameFeedbackHaptic) => Promise<void> | void;
  storage: KeyValueStoragePort;
}>) {
  const firstRunContents = useMemo(loadBundledFirstRunGameContents, []);
  const itineraryContents = useMemo(
    () => journeyItems?.map((item) => item.content) ?? firstRunContents,
    [firstRunContents, journeyItems],
  );
  const [content, setContent] = useState<GameContentV1>(
    () => itineraryContents[0] ?? loadBundledOnboardingGameContent(),
  );
  const [requestedPuzzleId, setRequestedPuzzleId] = useState<string | null>(
    null,
  );
  const onboardingKnowledgeCard = useMemo(
    loadBundledOnboardingKnowledgeCard,
    [],
  );
  const [model, setModel] = useState<FirstRunGameModel | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [progression, setProgression] =
    useState<GameProgressionSnapshot | null>(null);
  const [completionReward, setCompletionReward] =
    useState<RecordGameCompletionResult | null>(null);
  const [preferences, setPreferences] = useState<GameExperiencePreferences>(
    DEFAULT_GAME_EXPERIENCE_PREFERENCES,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferenceWarning, setPreferenceWarning] = useState<string | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [liveMessage, setLiveMessage] = useState("게임을 준비하고 있어요.");
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [saveRetrying, setSaveRetrying] = useState(false);
  const [fatalError, setFatalError] = useState(false);
  const topBarRef = useRef<HTMLElement>(null);
  const canvasParentRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<CrosswordGameRuntime | null>(null);
  const feedbackRuntimeRef = useRef<GameFeedbackRuntime | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsCloseButtonRef = useRef<HTMLButtonElement>(null);
  const settingsDialogRef = useRef<HTMLElement>(null);
  const composingRef = useRef(false);
  const restoringSettingsFocusRef = useRef(false);
  const previousSnapshotRef = useRef<GameSnapshot | null>(null);
  const preferencesRef = useRef<GameExperiencePreferences>(preferences);
  const preferenceMutationRef = useRef(0);
  const settingsOpenRef = useRef(settingsOpen);
  settingsOpenRef.current = settingsOpen;
  const systemReducedMotion = useMediaPreference(
    "(prefers-reduced-motion: reduce)",
  );
  const systemHighContrast = useMediaPreference(
    "(prefers-contrast: more), (forced-colors: active)",
  );
  const reducedMotion =
    initialLaunchConfig.worldRestoreMotionLevel === "reduced" ||
    resolveReducedMotion(preferences, systemReducedMotion);
  const highContrast = resolveHighContrast(preferences, systemHighContrast);
  const textScaleMultiplier = getGameTextScaleMultiplier(preferences.textScale);
  const visualPreferencesRef = useRef({ highContrast, reducedMotion });
  visualPreferencesRef.current = { highContrast, reducedMotion };

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    if (hostKind !== "apps-in-toss") return;
    return initSafeAreaInsets();
  }, [hostKind]);

  useEffect(() => {
    const feedback = createGameFeedbackRuntime({ playHaptic });
    feedbackRuntimeRef.current = feedback;
    return () => {
      feedbackRuntimeRef.current = null;
      feedback.dispose();
    };
  }, [playHaptic]);

  useEffect(() => {
    feedbackRuntimeRef.current?.setBgmEnabled(preferences.bgmEnabled);
  }, [preferences.bgmEnabled]);

  useEffect(() => {
    for (const element of [topBarRef.current, canvasParentRef.current]) {
      if (element == null) continue;
      if (settingsOpen) element.setAttribute("inert", "");
      else element.removeAttribute("inert");
    }
  }, [settingsOpen]);

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
      return createGameModel(
        storage,
        initialLaunchConfig,
        requestedPuzzleId ?? undefined,
        journeyItems,
      );
    };
    setModel(null);
    setSnapshot(null);
    setCompletionReward(null);
    setSaveWarning(null);
    setFatalError(false);
    void initialize().then(
      (nextModel) => {
        if (cancelled) return;
        callbacks.onActiveContentIdentity({
          puzzleId: nextModel.content.puzzleId,
          contentChecksum: nextModel.content.contentChecksum,
          contentLocale: nextModel.content.contentLocale,
        });
        previousSnapshotRef.current = nextModel.snapshot;
        setContent(nextModel.content);
        setModel(nextModel);
        setSnapshot(nextModel.snapshot);
        setProgression(nextModel.progression);
        setCompletionReward(nextModel.completionReward);
        preferencesRef.current = nextModel.preferences;
        setPreferences(nextModel.preferences);
        setLiveMessage(
          nextModel.restoreNotice ??
            "첫 단서가 선택됐어요. 답을 완성해 길을 연결해 보세요.",
        );
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
  }, [
    bridgeReady,
    callbacks,
    hostKind,
    initialLaunchConfig,
    journeyItems,
    requestedPuzzleId,
    storage,
  ]);

  useEffect(() => {
    if (model == null) return;
    return model.controller.subscribe((nextSnapshot, events) => {
      const previous = previousSnapshotRef.current ?? nextSnapshot;
      previousSnapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
      runtimeRef.current?.update(nextSnapshot, events);
      for (const action of projectGameFeedbackActions(events, {
        sfxEnabled: preferencesRef.current.sfxEnabled,
        hapticEnabled: preferencesRef.current.hapticEnabled,
      })) {
        feedbackRuntimeRef.current?.emit(action);
      }

      const resolved = events.find(
        (event) => event.type === "game.word.resolved",
      );
      const incorrect = events.some(
        (event) => event.type === "game.entry.incorrect",
      );
      if (resolved?.type === "game.word.resolved" && incorrect) {
        setLiveMessage(
          "교차 말길 하나는 연결됐지만 선택한 말길은 아직 열리지 않았어요. 입력을 살펴보세요.",
        );
      } else if (resolved?.type === "game.word.resolved") {
        setLiveMessage(
          resolved.entryIds.length > 1
            ? "교차하는 말길이 함께 연결됐어요."
            : "정답이에요. 말길이 복원됐어요.",
        );
      } else if (incorrect) {
        setLiveMessage(
          "아직 길이 열리지 않았어요. 입력은 그대로 두었으니 교차 글자를 살펴보세요.",
        );
      } else if (events.some((event) => event.type === "game.board.resolved")) {
        setLiveMessage("모든 말길이 이어져 기억의 정원이 깨어났어요.");
      } else if (
        events.some((event) => event.type === "game.board.replay.started")
      ) {
        setCompletionReward(null);
        setSaveWarning(null);
        setLiveMessage("첫 말길을 비우고 다시 시작했어요.");
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
        model.identity,
        model.cardIds,
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
  }, [content, initialLaunchConfig, model]);

  useEffect(() => {
    if (model == null || canvasParentRef.current == null) {
      return;
    }
    const initialVisualPreferences = visualPreferencesRef.current;
    const runtime = createCrosswordGameRuntime({
      parent: canvasParentRef.current,
      content,
      initialSnapshot: model.snapshot,
      highContrast: initialVisualPreferences.highContrast,
      reducedMotion: initialVisualPreferences.reducedMotion,
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
      },
    });
    runtimeRef.current = runtime;

    return () => {
      runtimeRef.current = null;
      runtime.destroy();
    };
  }, [callbacks, content, initialLaunchConfig.worldRestoreMotionLevel, model]);

  useEffect(() => {
    runtimeRef.current?.updateVisualPreferences({
      highContrast,
      reducedMotion,
    });
  }, [highContrast, reducedMotion]);

  useEffect(() => {
    if (snapshot == null) return;
    setDraft(getDraftForEntry(content, snapshot.selectedEntryId, snapshot));
    if (
      snapshot.phase === "active" &&
      !settingsOpen &&
      !restoringSettingsFocusRef.current
    ) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [content, settingsOpen, snapshot]);

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
      feedbackRuntimeRef.current?.suspend();
    };
    const resume = () => {
      if (settingsOpenRef.current) return;
      if (model.controller.getSnapshot().phase === "suspended") {
        model.controller.dispatch({ type: "app.resume" });
      }
      runtimeRef.current?.resume();
      feedbackRuntimeRef.current?.resume();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") suspend();
      else resume();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", suspend);
    window.addEventListener("pageshow", resume);
    window.addEventListener(NATIVE_GAME_EVENT.pause, suspend);
    window.addEventListener(NATIVE_GAME_EVENT.resume, resume);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", suspend);
      window.removeEventListener("pageshow", resume);
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
        mapNodeId: model.identity.mapNodeId,
        cardIds: model.cardIds,
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
  const activateFirstRunBoard = useCallback((puzzleId: string) => {
    previousSnapshotRef.current = null;
    setModel(null);
    setSnapshot(null);
    setCompletionReward(null);
    setSaveWarning(null);
    setDraft("");
    setLiveMessage("다음 말길을 준비하고 있어요.");
    setRequestedPuzzleId(puzzleId);
  }, []);
  const updatePreference = useCallback(
    (patch: Partial<GameExperiencePreferences>) => {
      if (model == null) return;
      const next = Object.freeze({
        ...preferencesRef.current,
        ...patch,
      }) as GameExperiencePreferences;
      const mutation = preferenceMutationRef.current + 1;
      preferenceMutationRef.current = mutation;
      preferencesRef.current = next;
      setPreferences(next);
      setPreferenceWarning(null);
      void model.repository
        .updateExperiencePreferences(content.contentLocale, next)
        .then(
          (stored) => {
            if (preferenceMutationRef.current !== mutation) return;
            preferencesRef.current = stored;
            setPreferences(stored);
            setPreferenceWarning(null);
          },
          () => {
            if (preferenceMutationRef.current !== mutation) return;
            setPreferenceWarning(
              "설정을 저장하지 못했어요. 현재 세션에는 적용되며 다음 변경 때 다시 시도합니다.",
            );
          },
        );
    },
    [content.contentLocale, model],
  );
  const openSettings = useCallback(() => {
    if (model == null) return;
    const current = model.controller.getSnapshot();
    if (
      current.phase !== "suspended" &&
      current.phase !== "loading" &&
      current.phase !== "recovery"
    ) {
      model.controller.dispatch({ type: "app.suspend" });
    }
    runtimeRef.current?.suspend();
    feedbackRuntimeRef.current?.suspend();
    setSettingsOpen(true);
  }, [model]);
  const closeSettings = useCallback(() => {
    restoringSettingsFocusRef.current = true;
    setSettingsOpen(false);
    window.setTimeout(() => {
      settingsButtonRef.current?.focus();
      restoringSettingsFocusRef.current = false;
    }, 0);
    if (model == null || document.visibilityState === "hidden") return;
    if (model.controller.getSnapshot().phase === "suspended") {
      model.controller.dispatch({ type: "app.resume" });
    }
    runtimeRef.current?.resume();
    feedbackRuntimeRef.current?.resume();
  }, [model]);
  const handleSettingsKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSettings();
        return;
      }
      if (event.key !== "Tab" || settingsDialogRef.current == null) return;
      const focusable = [
        ...settingsDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first == null || last == null) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [closeSettings],
  );
  const memoryInkBalance = progression?.memoryInkBalance ?? 0;
  const mapFragmentCount = progression?.mapFragmentCount ?? 0;
  const knowledgeCardCount = progression?.cardIds.length ?? 0;
  const collectionUnlocked =
    progression?.metaUnlocks.knowledgeCollection ?? false;
  const pathColorsUnlocked =
    progression?.metaUnlocks.pathColorCosmetics ?? false;
  const weeklyChallengeUnlocked =
    progression?.metaUnlocks.weeklyChallenge ?? false;
  const activeBoardIndex = Math.max(
    0,
    itineraryContents.findIndex(
      (candidate) => candidate.puzzleId === content.puzzleId,
    ),
  );
  const completedJourneyIds = new Set(
    progression?.completedPuzzleIds.filter((puzzleId) =>
      itineraryContents.some(
        (contentItem) => contentItem.puzzleId === puzzleId,
      ),
    ) ?? [],
  );
  const completedJourneyCount = completedJourneyIds.size;
  const nextJourneyContent = itineraryContents[activeBoardIndex + 1] ?? null;
  const journeyBoardCount = itineraryContents.length;
  const launchPreview = journeyMode === "launch-preview";
  const hasOnboardingKnowledgeCard =
    progression?.cardIds.includes(BUNDLED_ONBOARDING_KNOWLEDGE_CARD_ID) ??
    false;

  if (fatalError) {
    return (
      <main className="gameExperience gameExperienceError" role="alert">
        게임 화면을 열지 못했어요. 기존 퍼즐 화면으로 돌아가고 있습니다.
      </main>
    );
  }

  return (
    <main
      className="gameExperience"
      data-game-runtime="phaser-v1"
      data-high-contrast={highContrast ? "true" : "false"}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-text-scale={preferences.textScale}
    >
      <header
        ref={topBarRef}
        className="gameTopBar"
        aria-hidden={settingsOpen || undefined}
      >
        <div>
          <span>
            {launchPreview
              ? "생성 후보 보드 미리보기"
              : `기억의 정원 · ${activeBoardIndex + 1}번째 말길`}
          </span>
          <h1>말길</h1>
          {launchPreview ? (
            <span
              className="gamePreviewBadge"
              aria-label={`생성 후보 진행 ${activeBoardIndex + 1}/${journeyBoardCount}, 출시 승인 전 검토 후보`}
            >
              {`${activeBoardIndex + 1}/${journeyBoardCount} · 검토 후보 · 출시 승인 전`}
            </span>
          ) : null}
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
          <button
            ref={settingsButtonRef}
            className="gameSettingsButton"
            type="button"
            aria-label="설정과 접근성 열기"
            aria-expanded={settingsOpen}
            aria-controls="game-settings-dialog"
            disabled={model == null || settingsOpen}
            onClick={openSettings}
          >
            설정
          </button>
        </div>
      </header>

      <div
        className="gameCanvasStage"
        ref={canvasParentRef}
        aria-hidden={settingsOpen || undefined}
      />

      {settingsOpen && model != null ? (
        <section
          ref={settingsDialogRef}
          id="game-settings-dialog"
          className="gamePanel gameSettingsPanel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-settings-title"
          onKeyDown={handleSettingsKeyDown}
        >
          <div className="gameSettingsHeading">
            <div>
              <span className="gameEyebrow">즉시 미리보기</span>
              <h2 id="game-settings-title">설정과 접근성</h2>
            </div>
            <button
              ref={settingsCloseButtonRef}
              type="button"
              className="gameIconButton"
              aria-label="설정 닫기"
              autoFocus
              onClick={closeSettings}
            >
              닫기
            </button>
          </div>
          <div className="gameSettingsRows">
            <button
              type="button"
              aria-pressed={preferences.bgmEnabled}
              onClick={() =>
                updatePreference({ bgmEnabled: !preferences.bgmEnabled })
              }
            >
              <span>배경음악</span>
              <strong>{preferences.bgmEnabled ? "켜짐" : "꺼짐"}</strong>
            </button>
            <button
              type="button"
              aria-pressed={preferences.sfxEnabled}
              onClick={() => {
                const enabled = !preferences.sfxEnabled;
                updatePreference({ sfxEnabled: enabled });
                if (!enabled) feedbackRuntimeRef.current?.stopSfx();
              }}
            >
              <span>효과음</span>
              <strong>{preferences.sfxEnabled ? "켜짐" : "꺼짐"}</strong>
            </button>
            <button
              type="button"
              aria-pressed={preferences.hapticEnabled}
              onClick={() =>
                updatePreference({ hapticEnabled: !preferences.hapticEnabled })
              }
            >
              <span>햅틱</span>
              <strong>{preferences.hapticEnabled ? "켜짐" : "꺼짐"}</strong>
            </button>
            <button
              type="button"
              aria-pressed={preferences.motionMode === "reduced"}
              onClick={() =>
                updatePreference({
                  motionMode:
                    preferences.motionMode === "reduced" ? "system" : "reduced",
                })
              }
            >
              <span>움직임 줄이기</span>
              <strong>
                {preferences.motionMode === "reduced" ? "항상" : "시스템"}
              </strong>
            </button>
            <button
              type="button"
              aria-pressed={preferences.contrastMode === "high"}
              onClick={() =>
                updatePreference({
                  contrastMode:
                    preferences.contrastMode === "high" ? "system" : "high",
                })
              }
            >
              <span>고대비</span>
              <strong>
                {preferences.contrastMode === "high" ? "항상" : "시스템"}
              </strong>
            </button>
          </div>
          <fieldset className="gameTextScalePicker">
            <legend>글자 크기</legend>
            <div>
              {(
                [
                  ["normal", "100%"],
                  ["large", "150%"],
                  ["extra-large", "200%"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={preferences.textScale === value}
                  onClick={() => updatePreference({ textScale: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="gameSettingsNote">
            시스템에서 움직임 줄이기 또는 고대비를 켜면 앱 설정이 시스템 값을
            해제하지 않습니다. 현재 글자 배율은 {textScaleMultiplier * 100}
            %입니다.
          </p>
          {preferenceWarning == null ? null : (
            <p className="gameSaveAlert" role="alert">
              {preferenceWarning}
            </p>
          )}
          <button
            className="gamePrimaryButton"
            type="button"
            onClick={closeSettings}
          >
            설정 적용하고 돌아가기
          </button>
        </section>
      ) : model == null || snapshot == null ? (
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
            <span className="gameEyebrow">{`${activeBoardIndex + 1}번째 장소 복원 완료`}</span>
            <h2 id="game-result-title">기억의 정원이 더 밝아졌어요</h2>
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
            {itineraryContents.map((mapContent, index) => (
              <Fragment key={mapContent.puzzleId}>
                {index === 0 ? null : <i />}
                <span
                  className={
                    completedJourneyIds.has(mapContent.puzzleId)
                      ? "isComplete"
                      : index === activeBoardIndex
                        ? "isCurrent"
                        : undefined
                  }
                >
                  {index + 1}
                </span>
              </Fragment>
            ))}
          </div>
          <div>
            <span className="gameEyebrow">
              {launchPreview ? "생성 후보 보드 미리보기" : "입문 여정"} ·{" "}
              {Math.max(completedJourneyCount, activeBoardIndex + 1)}/
              {journeyBoardCount}
            </span>
            <h2 id="game-map-title">
              {`${activeBoardIndex + 1}번째 말길을 복원했어요`}
            </h2>
            <p>완료한 말길이 기억의 정원으로 이어지는 지도 조각이 됐어요.</p>
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
          {collectionUnlocked ||
          pathColorsUnlocked ||
          weeklyChallengeUnlocked ? (
            <div
              className="gameFeatureGateGrid"
              aria-label="새로 열린 메타 기능"
            >
              {collectionUnlocked ? (
                <article className="isUnlocked">
                  <span aria-hidden="true">▤</span>
                  <div>
                    <strong>지식 카드 컬렉션</strong>
                    <small>해금됨</small>
                  </div>
                </article>
              ) : null}
              {pathColorsUnlocked ? (
                <article className="isUnlocked">
                  <span aria-hidden="true">●</span>
                  <div>
                    <strong>말길 색 꾸미기</strong>
                    <small>해금됨</small>
                  </div>
                </article>
              ) : null}
              {weeklyChallengeUnlocked ? (
                <article className="isUnlocked">
                  <span aria-hidden="true">✦</span>
                  <div>
                    <strong>주간 도전</strong>
                    <small>해금됨</small>
                  </div>
                </article>
              ) : null}
            </div>
          ) : null}
          {hasOnboardingKnowledgeCard && activeBoardIndex === 0 ? (
            <article
              className="gameKnowledgeCard"
              aria-labelledby="game-knowledge-card-title"
            >
              <span className="gameEyebrow">새 지식 카드</span>
              <h3 id="game-knowledge-card-title">
                {onboardingKnowledgeCard.answer}
              </h3>
              <p>{onboardingKnowledgeCard.shortExplanation}</p>
              <footer>
                {`출처 · ${onboardingKnowledgeCard.source} · 표제어 ${onboardingKnowledgeCard.sourceEntryId} · ${onboardingKnowledgeCard.licenseId}`}
              </footer>
            </article>
          ) : null}
          {nextJourneyContent == null ? (
            <div className="gameContentGate isComplete" role="status">
              <strong>
                {launchPreview
                  ? `생성 후보 보드 ${journeyBoardCount}개를 모두 확인했어요`
                  : `입문 말길 ${journeyBoardCount}개를 모두 복원했어요`}
              </strong>
              <span>
                {launchPreview
                  ? "출시 승인 전 검토용 후보이며 정식 콘텐츠 확정을 뜻하지 않습니다."
                  : "컬렉션과 말길 색 꾸미기가 열렸습니다."}
              </span>
            </div>
          ) : (
            <button
              className="gamePrimaryButton"
              type="button"
              onClick={() => activateFirstRunBoard(nextJourneyContent.puzzleId)}
            >
              다음 보드 시작
            </button>
          )}
          <button
            className="gameSecondaryButton"
            type="button"
            onClick={() => model.controller.dispatch({ type: "map.replay" })}
          >
            {`${activeBoardIndex + 1}번째 보드 다시 풀기`}
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
            {content.entries.map((entry, index) => {
              const completed = snapshot.completedEntryIds.includes(entry.id);
              const selected = snapshot.selectedEntryId === entry.id;
              const enteredCellCount = getEntryCells(entry).filter(
                (cell) =>
                  snapshot.cellValues[getCellKey(cell.row, cell.col)] != null,
              ).length;
              const direction = entry.direction === "down" ? "세로" : "가로";
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-label={`${index + 1} ${direction}, ${entry.answerCells.length}글자, ${enteredCellCount}글자 입력됨${selected ? ", 선택됨" : ""}${completed ? ", 완료" : ""}`}
                  aria-pressed={selected}
                  className={completed ? "isComplete" : ""}
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
                  {completed ? "완료" : entry.answerCells.length}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="gameLiveRegion" aria-live="polite" aria-atomic="true">
        {liveMessage}
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
): ContentAwareGameRuntimeSession {
  const activeContentIdentity = createDeferred<GameRuntimeContentIdentity>();
  const webGlReady = createDeferred<void>();
  const bridgeReady = createDeferred<void>();
  const interactiveReady = createDeferred<void>();
  let disposed = false;
  let root: Root | null = createRoot(container);

  const rejectBoot = (error: Error) => {
    activeContentIdentity.reject(error);
    webGlReady.reject(error);
    bridgeReady.reject(error);
    interactiveReady.reject(error);
  };

  const callbacks: HostCallbacks = {
    onActiveContentIdentity(identity) {
      activeContentIdentity.resolve(Object.freeze({ ...identity }));
    },
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
        journeyItems={options.journeyItems}
        journeyMode={options.journeyMode}
        playHaptic={options.playHaptic}
        storage={options.storage}
      />
    </GameExperienceErrorBoundary>,
  );

  return {
    waitForActiveContentIdentity: () => activeContentIdentity.promise,
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
