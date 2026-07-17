import {
  COSMETIC_PRICE_BY_TIER,
  projectMemoryInkBalance,
  purchaseCosmetic,
  type CosmeticPurchaseResult,
  type CosmeticTier,
} from "./gameEconomy.ts";
import type { SaveV2Envelope } from "./saveV2.ts";

export const GAME_META_UNLOCK_POLICY = Object.freeze({
  knowledgeCollectionCompletedBoards: 3,
  pathColorCosmeticsCompletedBoards: 3,
  weeklyChallengeCompletedBoards: 5,
});

export const FIVE_OF_SEVEN_MISSION_POLICY = Object.freeze({
  periodDayCount: 7,
  requiredDistinctDailyCompletions: 5,
  memoryInkReward: 60,
});

export const WEEKLY_HARD_MISSION_POLICY = Object.freeze({
  requiredHardBoardCompletions: 1,
  memoryInkReward: 60,
});

export type GameMetaUnlocks = Readonly<{
  completedBoardCount: number;
  knowledgeCollection: boolean;
  pathColorCosmetics: boolean;
  weeklyChallenge: boolean;
}>;

export type FiveOfSevenMissionDefinition = Readonly<{
  kind: "five-of-seven";
  missionId: string;
  contentLocale: string;
  eligibleLocalDates: readonly string[];
}>;

export type WeeklyHardMissionDefinition = Readonly<{
  kind: "weekly-hard";
  missionId: string;
  contentLocale: string;
  eligiblePuzzleIds: readonly string[];
  exclusivePostcardId: string;
}>;

export type GameMissionDefinition =
  | FiveOfSevenMissionDefinition
  | WeeklyHardMissionDefinition;

export type GameMissionProgress = Readonly<{
  missionId: string;
  contentLocale: string;
  kind: GameMissionDefinition["kind"];
  completedKeys: readonly string[];
  processedEventIds: readonly string[];
  settledAt?: string;
}>;

export type DailyBoardCompletionEvent = Readonly<{
  kind: "daily-board-completed";
  eventId: string;
  contentLocale: string;
  localDate: string;
  puzzleId: string;
  occurredAt: string;
}>;

export type WeeklyHardBoardCompletionEvent = Readonly<{
  kind: "weekly-hard-board-completed";
  eventId: string;
  contentLocale: string;
  puzzleId: string;
  occurredAt: string;
}>;

export type GameMissionCompletionEvent =
  | DailyBoardCompletionEvent
  | WeeklyHardBoardCompletionEvent;

export type GameMissionRewardIntent = Readonly<{
  settlementId: string;
  contentLocale: string;
  memoryInk: number;
  exclusivePostcardId?: string;
}>;

export type RecordGameMissionCompletionResult = Readonly<{
  status:
    | "recorded"
    | "settled"
    | "duplicate"
    | "already-settled"
    | "out-of-scope";
  state: GameMissionProgress;
  rewardIntent?: GameMissionRewardIntent;
}>;

export type KnowledgeCardCatalogItem = Readonly<{
  cardId: string;
  contentLocale: string;
  answer: string;
  shortExplanation: string;
  source: string;
}>;

export type KnowledgeCardCollectionProjection = Readonly<{
  status: "locked" | "unlocked";
  completedBoardCount: number;
  unlockAtCompletedBoards: number;
  ownedCardIds: readonly string[];
  visibleCards: readonly KnowledgeCardCatalogItem[];
  missingCatalogCardIds: readonly string[];
}>;

export type CosmeticCatalogItem = Readonly<{
  cosmeticId: string;
  contentLocale: string;
  kind: "path-color" | "footprint" | "postcard-border";
  tier: CosmeticTier;
}>;

type GuardedCosmeticPurchaseResult = Readonly<{
  status: "locked" | "locale-mismatch" | "unlock-policy-not-defined";
  save: SaveV2Envelope;
  price: number;
  memoryInkBalance: number;
}>;

export type GameMetaCosmeticPurchaseResult =
  | CosmeticPurchaseResult
  | GuardedCosmeticPurchaseResult;

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized === "") {
    throw new TypeError(`${field} must not be empty`);
  }
  return normalized;
}

function uniqueNonEmpty(values: readonly string[], field: string): string[] {
  const normalized = values.map((value, index) =>
    requireNonEmpty(value, `${field}[${index}]`),
  );
  return [...new Set(normalized)].sort();
}

function getCompletedBoardCount(
  save: SaveV2Envelope,
  contentLocale: string,
): number {
  const contentState = save.content[contentLocale];
  if (contentState == null) {
    throw new Error(`Unknown content locale namespace: ${contentLocale}`);
  }
  return new Set(contentState.completedPuzzleIds).size;
}

export function projectGameMetaUnlocks(
  save: SaveV2Envelope,
  contentLocale: string,
): GameMetaUnlocks {
  const contentState = save.content[contentLocale];
  if (contentState == null) {
    throw new Error(`Unknown content locale namespace: ${contentLocale}`);
  }
  return projectGameMetaUnlocksFromCompletedPuzzleIds(
    contentState.completedPuzzleIds,
  );
}

/**
 * Save 형식을 UI나 host에 새로 노출하지 않고도 같은 해금 정책을 투영한다.
 * 중복 완료 ID는 한 번만 세며, 빈 ID는 손상된 진행으로 보고 fail closed한다.
 */
export function projectGameMetaUnlocksFromCompletedPuzzleIds(
  completedPuzzleIds: readonly string[],
): GameMetaUnlocks {
  const completedBoardCount = uniqueNonEmpty(
    completedPuzzleIds,
    "completedPuzzleIds",
  ).length;
  return {
    completedBoardCount,
    knowledgeCollection:
      completedBoardCount >=
      GAME_META_UNLOCK_POLICY.knowledgeCollectionCompletedBoards,
    pathColorCosmetics:
      completedBoardCount >=
      GAME_META_UNLOCK_POLICY.pathColorCosmeticsCompletedBoards,
    weeklyChallenge:
      completedBoardCount >=
      GAME_META_UNLOCK_POLICY.weeklyChallengeCompletedBoards,
  };
}

function validateMissionDefinition(
  definition: GameMissionDefinition,
): GameMissionDefinition {
  requireNonEmpty(definition.missionId, "missionId");
  requireNonEmpty(definition.contentLocale, "contentLocale");
  if (definition.kind === "five-of-seven") {
    const dates = uniqueNonEmpty(
      definition.eligibleLocalDates,
      "eligibleLocalDates",
    );
    if (dates.length !== FIVE_OF_SEVEN_MISSION_POLICY.periodDayCount) {
      throw new TypeError(
        "five-of-seven mission requires 7 unique local dates",
      );
    }
  } else {
    if (
      uniqueNonEmpty(definition.eligiblePuzzleIds, "eligiblePuzzleIds")
        .length === 0
    ) {
      throw new TypeError("weekly-hard mission requires an eligible puzzle");
    }
    requireNonEmpty(definition.exclusivePostcardId, "exclusivePostcardId");
  }
  return definition;
}

export function createGameMissionProgress(
  definition: GameMissionDefinition,
): GameMissionProgress {
  validateMissionDefinition(definition);
  return {
    missionId: definition.missionId,
    contentLocale: definition.contentLocale,
    kind: definition.kind,
    completedKeys: [],
    processedEventIds: [],
  };
}

function assertMatchingMissionState(
  definition: GameMissionDefinition,
  state: GameMissionProgress,
): void {
  if (
    state.missionId !== definition.missionId ||
    state.contentLocale !== definition.contentLocale ||
    state.kind !== definition.kind
  ) {
    throw new Error("Mission state does not match its definition");
  }
}

function missionEventKey(
  definition: GameMissionDefinition,
  event: GameMissionCompletionEvent,
): string | null {
  if (event.contentLocale !== definition.contentLocale) {
    return null;
  }
  if (
    definition.kind === "five-of-seven" &&
    event.kind === "daily-board-completed" &&
    definition.eligibleLocalDates.includes(event.localDate)
  ) {
    return event.localDate;
  }
  if (
    definition.kind === "weekly-hard" &&
    event.kind === "weekly-hard-board-completed" &&
    definition.eligiblePuzzleIds.includes(event.puzzleId)
  ) {
    return event.puzzleId;
  }
  return null;
}

function requiredMissionCompletions(definition: GameMissionDefinition): number {
  return definition.kind === "five-of-seven"
    ? FIVE_OF_SEVEN_MISSION_POLICY.requiredDistinctDailyCompletions
    : WEEKLY_HARD_MISSION_POLICY.requiredHardBoardCompletions;
}

function missionRewardIntent(
  definition: GameMissionDefinition,
): GameMissionRewardIntent {
  return definition.kind === "five-of-seven"
    ? {
        settlementId: definition.missionId,
        contentLocale: definition.contentLocale,
        memoryInk: FIVE_OF_SEVEN_MISSION_POLICY.memoryInkReward,
      }
    : {
        settlementId: definition.missionId,
        contentLocale: definition.contentLocale,
        memoryInk: WEEKLY_HARD_MISSION_POLICY.memoryInkReward,
        exclusivePostcardId: definition.exclusivePostcardId,
      };
}

export function recordGameMissionCompletion(
  definition: GameMissionDefinition,
  state: GameMissionProgress,
  event: GameMissionCompletionEvent,
): RecordGameMissionCompletionResult {
  validateMissionDefinition(definition);
  assertMatchingMissionState(definition, state);
  const eventId = requireNonEmpty(event.eventId, "eventId");
  requireNonEmpty(event.occurredAt, "occurredAt");

  if (state.processedEventIds.includes(eventId)) {
    return { status: "duplicate", state };
  }
  if (state.settledAt != null) {
    return { status: "already-settled", state };
  }

  const completionKey = missionEventKey(definition, event);
  if (completionKey == null) {
    return { status: "out-of-scope", state };
  }
  if (state.completedKeys.includes(completionKey)) {
    return { status: "duplicate", state };
  }

  const completedKeys = [...state.completedKeys, completionKey].sort();
  const processedEventIds = [...state.processedEventIds, eventId].sort();
  const settled =
    completedKeys.length >= requiredMissionCompletions(definition);
  const nextState: GameMissionProgress = {
    ...state,
    completedKeys,
    processedEventIds,
    ...(settled ? { settledAt: event.occurredAt } : {}),
  };
  return settled
    ? {
        status: "settled",
        state: nextState,
        rewardIntent: missionRewardIntent(definition),
      }
    : { status: "recorded", state: nextState };
}

export function projectKnowledgeCardCollection(
  save: SaveV2Envelope,
  contentLocale: string,
  catalog: readonly KnowledgeCardCatalogItem[],
): KnowledgeCardCollectionProjection {
  const contentState = save.content[contentLocale];
  if (contentState == null) {
    throw new Error(`Unknown content locale namespace: ${contentLocale}`);
  }
  const completedBoardCount = getCompletedBoardCount(save, contentLocale);
  const unlocked =
    completedBoardCount >=
    GAME_META_UNLOCK_POLICY.knowledgeCollectionCompletedBoards;
  const ownedCardIds = uniqueNonEmpty(contentState.cardIds, "cardIds");
  const localeCatalog = new Map<string, KnowledgeCardCatalogItem>();
  for (const item of catalog) {
    if (item.contentLocale !== contentLocale) continue;
    const cardId = requireNonEmpty(item.cardId, "catalog.cardId");
    requireNonEmpty(item.answer, "catalog.answer");
    requireNonEmpty(item.shortExplanation, "catalog.shortExplanation");
    requireNonEmpty(item.source, "catalog.source");
    if (localeCatalog.has(cardId)) {
      throw new Error(
        `Duplicate knowledge card in ${contentLocale} catalog: ${cardId}`,
      );
    }
    localeCatalog.set(cardId, item);
  }
  const visibleCards = unlocked
    ? ownedCardIds.flatMap((cardId) => {
        const item = localeCatalog.get(cardId);
        return item == null ? [] : [item];
      })
    : [];
  const missingCatalogCardIds = ownedCardIds.filter(
    (cardId) => !localeCatalog.has(cardId),
  );
  return {
    status: unlocked ? "unlocked" : "locked",
    completedBoardCount,
    unlockAtCompletedBoards:
      GAME_META_UNLOCK_POLICY.knowledgeCollectionCompletedBoards,
    ownedCardIds,
    visibleCards,
    missingCatalogCardIds,
  };
}

export function purchaseUnlockedCosmetic(
  save: SaveV2Envelope,
  input: Readonly<{
    profileScope: string;
    contentLocale: string;
    item: CosmeticCatalogItem;
    occurredAt: string;
  }>,
): GameMetaCosmeticPurchaseResult {
  const unlocks = projectGameMetaUnlocks(save, input.contentLocale);
  const price = COSMETIC_PRICE_BY_TIER[input.item.tier];
  if (!Number.isInteger(price)) {
    throw new TypeError("item.tier must be small, medium, or large");
  }
  const guardResult = (
    status: GuardedCosmeticPurchaseResult["status"],
  ): GuardedCosmeticPurchaseResult => ({
    status,
    save,
    price,
    memoryInkBalance: projectMemoryInkBalance(save, input.contentLocale),
  });

  if (input.item.contentLocale !== input.contentLocale) {
    return guardResult("locale-mismatch");
  }
  if (input.item.kind !== "path-color") {
    return guardResult("unlock-policy-not-defined");
  }
  if (!unlocks.pathColorCosmetics) {
    return guardResult("locked");
  }
  return purchaseCosmetic(save, {
    profileScope: input.profileScope,
    contentLocale: input.contentLocale,
    cosmeticId: input.item.cosmeticId,
    tier: input.item.tier,
    occurredAt: input.occurredAt,
  });
}
