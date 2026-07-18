import {
  createInitialGameSnapshot,
  GameController,
  type GameSnapshot,
} from "../../packages/crossword-core/src/gameController.ts";
import type { GameContentV1 } from "../../packages/crossword-core/src/gameContent.ts";
import type { GameExperiencePreferences } from "../../packages/crossword-core/src/gamePreferences.ts";
import type { LaunchConfig } from "../../packages/crossword-core/src/launchConfig.ts";
import { koKrLanguageProfile } from "../../packages/crossword-core/src/languageProfile.ts";
import {
  createGameSaveRepository,
  DEFAULT_GAME_CELL_JOURNAL_KEY,
  DEFAULT_GAME_SAVE_V2_KEY,
  GameSaveRepositoryError,
  type GameProgressionSnapshot,
  type GameSaveRepository,
  type KeyValueStoragePort,
  type RecordGameCompletionResult,
} from "./gameSaveRepository.ts";
import {
  GAME_SAVE_ACTIVE_POINTER_KEY,
  GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY,
  GAME_SAVE_MIGRATION_STAGING_KEY,
  createGameSaveLegacyProjectionPort,
  portableGameSaveChecksumPort,
} from "./gameSaveMigration.ts";
import { createRestoredGameSnapshot } from "./gameRestore.ts";
import {
  BUNDLED_ONBOARDING_KNOWLEDGE_CARD_ID,
  getBundledFirstRunContentIdentity,
  loadBundledFirstRunGameContents,
  loadBundledOnboardingGameContent,
} from "./onboardingGameContent.ts";

export type GameJourneyItem = Readonly<{
  content: GameContentV1;
  mapNodeId: string;
  cardIds: readonly string[];
}>;

export type GameJourneyIdentity = Readonly<{
  puzzleId: string;
  contentChecksum: string;
  mapNodeId: string;
}>;

export type FirstRunGameModel = Readonly<{
  cardIds: readonly string[];
  completionReward: RecordGameCompletionResult | null;
  content: GameContentV1;
  controller: GameController;
  identity: GameJourneyIdentity;
  progression: GameProgressionSnapshot;
  preferences: GameExperiencePreferences;
  repository: GameSaveRepository;
  restoreNotice: string | null;
  snapshot: GameSnapshot;
}>;

const EMPTY_CARD_IDS = Object.freeze([]) as readonly string[];

function createBundledFirstRunJourneyItems(): readonly GameJourneyItem[] {
  const onboardingPuzzleId = loadBundledOnboardingGameContent().puzzleId;
  return Object.freeze(
    loadBundledFirstRunGameContents().map((content) => {
      const identity = getBundledFirstRunContentIdentity(content.puzzleId);
      return Object.freeze({
        content,
        mapNodeId: identity.mapNodeId,
        cardIds:
          content.puzzleId === onboardingPuzzleId
            ? Object.freeze([BUNDLED_ONBOARDING_KNOWLEDGE_CARD_ID])
            : EMPTY_CARD_IDS,
      });
    }),
  );
}

export function rewardConfigFromLaunchConfig(config: LaunchConfig) {
  return {
    base: config.memoryInkBase,
    perEntry: config.memoryInkPerEntry,
    chainCap: config.memoryInkChainCap,
  };
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

export async function persistGameTransition(
  repository: GameSaveRepository,
  previous: GameSnapshot,
  next: GameSnapshot,
  boardResolved: boolean,
  entryCount: number,
  launchConfig: LaunchConfig,
  identity: GameJourneyIdentity,
  cardIds: readonly string[],
): Promise<RecordGameCompletionResult | null> {
  const progress = {
    longestIntersectionChain: next.lastResolvedEntryIds.length,
  };
  if (boardResolved) {
    return repository.recordPuzzleCompletion({
      snapshot: next,
      entryCount,
      mapNodeId: identity.mapNodeId,
      cardIds,
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

export async function createGameModel(
  storage: KeyValueStoragePort,
  launchConfig: LaunchConfig,
  requestedPuzzleId?: string,
  journeyItems?: readonly GameJourneyItem[],
): Promise<FirstRunGameModel> {
  const itinerary = journeyItems ?? createBundledFirstRunJourneyItems();
  const repository = createGameSaveRepository({
    storage,
    checksumPort: portableGameSaveChecksumPort,
    uiLocale: "ko-KR",
    inputMode: "word-strip",
    legacyProjection: createGameSaveLegacyProjectionPort(storage),
  });
  const defaultItem = itinerary[0];
  if (defaultItem == null) {
    throw new Error("Game journey itinerary is empty");
  }
  let journeyItem: GameJourneyItem =
    requestedPuzzleId == null
      ? defaultItem
      : (itinerary.find(
          (candidate) => candidate.content.puzzleId === requestedPuzzleId,
        ) ?? defaultItem);
  if (
    requestedPuzzleId != null &&
    journeyItem.content.puzzleId !== requestedPuzzleId
  ) {
    throw new Error(`Unknown requested first-run puzzle: ${requestedPuzzleId}`);
  }
  if (requestedPuzzleId == null) {
    try {
      const savedProgression = await repository.readProgression(
        defaultItem.content.contentLocale,
      );
      const completed = new Set(savedProgression.completedPuzzleIds);
      journeyItem =
        itinerary.find(
          (candidate) => !completed.has(candidate.content.puzzleId),
        ) ??
        itinerary[itinerary.length - 1] ??
        defaultItem;
    } catch {
      // loadPuzzleSnapshot below owns invalid-save quarantine. Selection fails
      // closed to the stable first board until that recovery finishes.
    }
  }
  const { content, mapNodeId } = journeyItem;
  const identity: GameJourneyIdentity = Object.freeze({
    puzzleId: content.puzzleId,
    contentChecksum: content.contentChecksum,
    mapNodeId,
  });
  const cardIds = Object.freeze([...journeyItem.cardIds]);
  const initial = createInitialGameSnapshot(content);
  const loadResult = await repository.loadPuzzleSnapshot({
    contentLocale: content.contentLocale,
    puzzleId: content.puzzleId,
    contentChecksum: content.contentChecksum,
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
  } else if (loadResult.status === "invalid-save") {
    const quarantineSuffix = Date.now().toString(36);
    for (const key of [
      DEFAULT_GAME_SAVE_V2_KEY,
      DEFAULT_GAME_CELL_JOURNAL_KEY,
      GAME_SAVE_ACTIVE_POINTER_KEY,
      GAME_SAVE_MIGRATION_STAGING_KEY,
      GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY,
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
  } else if (
    loadResult.status === "invalid-journal" ||
    loadResult.status === "journal-rejected"
  ) {
    const rawJournal = await storage.getItem(DEFAULT_GAME_CELL_JOURNAL_KEY);
    if (rawJournal != null) {
      const quarantineSuffix = Date.now().toString(36);
      await storage.setItem(
        `${DEFAULT_GAME_CELL_JOURNAL_KEY}:quarantine:${quarantineSuffix}`,
        rawJournal,
      );
      await storage.removeItem(DEFAULT_GAME_CELL_JOURNAL_KEY);
    }
    controller = new GameController({
      content,
      profile: koKrLanguageProfile,
      initialSnapshot: { ...initial, phase: "recovery" },
    });
    controller.dispatch({ type: "recovery.fail" });
    restoreNotice = "손상된 복구 기록을 격리하고 마지막 저장을 보호했어요.";
  } else {
    controller = new GameController({
      content,
      profile: koKrLanguageProfile,
    });
  }

  if (controller.getSnapshot().phase === "intro") {
    controller.dispatch({ type: "intro.complete" });
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
          mapNodeId: identity.mapNodeId,
          cardIds,
          rewardConfig: rewardConfigFromLaunchConfig(launchConfig),
        })
      : null;
  const progression =
    completionReward?.progression ??
    (await repository.readProgression(content.contentLocale));
  const preferences = await repository.readExperiencePreferences();
  return {
    cardIds,
    completionReward,
    content,
    controller,
    identity,
    progression,
    preferences,
    repository,
    restoreNotice,
    snapshot,
  };
}
