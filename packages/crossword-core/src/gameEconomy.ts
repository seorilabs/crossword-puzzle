import type {
  SaveV2CompletionRecord,
  SaveV2ContentState,
  SaveV2EconomyRecord,
  SaveV2Envelope,
} from "./saveV2.ts";

export const GAME_ECONOMY_SCOPE_VERSION = 1 as const;
export const MEMORY_INK_CURRENCY_ID = "memory_ink" as const;

export const DEFAULT_MEMORY_INK_REWARD_CONFIG = Object.freeze({
  base: 10,
  perEntry: 2,
  chainCap: 10,
});

export const COSMETIC_PRICE_BY_TIER = Object.freeze({
  small: 180,
  medium: 360,
  large: 720,
});

export type MemoryInkRewardConfig = Readonly<{
  base: number;
  perEntry: number;
  chainCap: number;
}>;

export type CosmeticTier = keyof typeof COSMETIC_PRICE_BY_TIER;

export type FirstCompletionRewardInput = Readonly<{
  profileScope: string;
  contentLocale: string;
  puzzleId: string;
  contentChecksum: string;
  completedAt: string;
  entryCount: number;
  longestIntersectionChain: number;
  hintCount: number;
  revealUsed: boolean;
  mapNodeId: string;
  cardIds?: readonly string[];
}>;

export type FirstCompletionRewardResult = Readonly<{
  status: "granted" | "already-granted";
  save: SaveV2Envelope;
  memoryInkAwarded: number;
  memoryInkBalance: number;
  mapFragmentAwarded: boolean;
  cardIdsAwarded: readonly string[];
}>;

export type CosmeticPurchaseInput = Readonly<{
  profileScope: string;
  contentLocale: string;
  cosmeticId: string;
  tier: CosmeticTier;
  occurredAt: string;
}>;

export type CosmeticPurchaseResult = Readonly<{
  status: "purchased" | "already-owned" | "insufficient-balance";
  save: SaveV2Envelope;
  price: number;
  memoryInkBalance: number;
}>;

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized === "") {
    throw new TypeError(`${field} must not be empty`);
  }
  return normalized;
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative integer`);
  }
  return value;
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive integer`);
  }
  return value;
}

function idSegment(value: string): string {
  return encodeURIComponent(value);
}

function transactionId(
  profileScope: string,
  contentLocale: string,
  subjectId: string,
  transactionType: string,
): string {
  return [
    "game-economy/v1",
    idSegment(profileScope),
    idSegment(contentLocale),
    idSegment(subjectId),
    transactionType,
  ].join(":");
}

function uniqueIds(values: readonly string[] | undefined): string[] {
  if (values == null) return [];
  return [
    ...new Set(
      values.map((value) => value.trim()).filter((value) => value !== ""),
    ),
  ].sort();
}

function appendUnique(values: readonly string[], additions: readonly string[]) {
  return [...new Set([...values, ...additions])];
}

function getContentState(
  save: SaveV2Envelope,
  contentLocale: string,
): SaveV2ContentState {
  const contentState = save.content[contentLocale];
  if (contentState == null) {
    throw new Error(`Unknown content locale namespace: ${contentLocale}`);
  }
  return contentState;
}

export function calculateFirstCompletionMemoryInk(
  input: Readonly<{
    entryCount: number;
    longestIntersectionChain: number;
  }>,
  config: MemoryInkRewardConfig = DEFAULT_MEMORY_INK_REWARD_CONFIG,
): number {
  const entryCount = requirePositiveInteger(input.entryCount, "entryCount");
  const chain = requireNonNegativeInteger(
    input.longestIntersectionChain,
    "longestIntersectionChain",
  );
  const base = requireNonNegativeInteger(config.base, "config.base");
  const perEntry = requireNonNegativeInteger(
    config.perEntry,
    "config.perEntry",
  );
  const chainCap = requireNonNegativeInteger(
    config.chainCap,
    "config.chainCap",
  );
  return base + perEntry * entryCount + Math.min(chainCap, 2 * chain);
}

export function projectMemoryInkBalance(
  save: SaveV2Envelope,
  contentLocale: string,
): number {
  const balance = save.economyRecords.reduce((total, record) => {
    if (
      record.kind !== "currency" ||
      record.contentLocale !== contentLocale ||
      record.payload.currency !== MEMORY_INK_CURRENCY_ID ||
      typeof record.payload.delta !== "number"
    ) {
      return total;
    }
    return total + Math.trunc(record.payload.delta);
  }, 0);
  return Math.max(0, balance);
}

export function getOwnedCosmeticIds(
  save: SaveV2Envelope,
  contentLocale: string,
): string[] {
  return [
    ...new Set(
      save.economyRecords
        .filter(
          (record) =>
            record.kind === "cosmetic-entitlement" &&
            record.contentLocale === contentLocale &&
            typeof record.payload.cosmeticId === "string",
        )
        .map((record) => record.payload.cosmeticId as string),
    ),
  ].sort();
}

export function applyFirstCompletionRewards(
  save: SaveV2Envelope,
  rawInput: FirstCompletionRewardInput,
  config: MemoryInkRewardConfig = DEFAULT_MEMORY_INK_REWARD_CONFIG,
): FirstCompletionRewardResult {
  const input = {
    ...rawInput,
    profileScope: requireNonEmpty(rawInput.profileScope, "profileScope"),
    contentLocale: requireNonEmpty(rawInput.contentLocale, "contentLocale"),
    puzzleId: requireNonEmpty(rawInput.puzzleId, "puzzleId"),
    contentChecksum: requireNonEmpty(
      rawInput.contentChecksum,
      "contentChecksum",
    ),
    completedAt: requireNonEmpty(rawInput.completedAt, "completedAt"),
    mapNodeId: requireNonEmpty(rawInput.mapNodeId, "mapNodeId"),
    entryCount: requirePositiveInteger(rawInput.entryCount, "entryCount"),
    longestIntersectionChain: requireNonNegativeInteger(
      rawInput.longestIntersectionChain,
      "longestIntersectionChain",
    ),
    hintCount: requireNonNegativeInteger(rawInput.hintCount, "hintCount"),
    cardIds: uniqueIds(rawInput.cardIds),
  };
  const contentState = getContentState(save, input.contentLocale);
  const puzzleSnapshot = contentState.puzzles[input.puzzleId];
  if (
    puzzleSnapshot == null ||
    puzzleSnapshot.contentLocale !== input.contentLocale ||
    puzzleSnapshot.contentChecksum !== input.contentChecksum
  ) {
    throw new Error(
      "Completion reward does not match a persisted puzzle snapshot",
    );
  }

  const mapGrantId = transactionId(
    input.profileScope,
    input.contentLocale,
    input.puzzleId,
    "grant-map-fragment",
  );
  const inkGrantId = transactionId(
    input.profileScope,
    input.contentLocale,
    input.puzzleId,
    "currency-memory-ink-first-completion",
  );
  const existingTransactionIds = new Set(
    save.economyRecords.map((record) => record.transactionId),
  );
  const cardGrantIds = input.cardIds.map((cardId) =>
    transactionId(
      input.profileScope,
      input.contentLocale,
      `${input.puzzleId}/${cardId}`,
      "grant-knowledge-card",
    ),
  );
  const expectedTransactionIds = [mapGrantId, inkGrantId, ...cardGrantIds];
  const completed = contentState.completedPuzzleIds.includes(input.puzzleId);
  const presentTransactionCount = expectedTransactionIds.filter((id) =>
    existingTransactionIds.has(id),
  ).length;
  const hasCompleteBundle =
    completed && presentTransactionCount === expectedTransactionIds.length;
  const isLegacyCompletion = completed && presentTransactionCount === 0;
  if (hasCompleteBundle || isLegacyCompletion) {
    return {
      status: "already-granted",
      save,
      memoryInkAwarded: 0,
      memoryInkBalance: projectMemoryInkBalance(save, input.contentLocale),
      mapFragmentAwarded: false,
      cardIdsAwarded: [],
    };
  }
  if (completed || presentTransactionCount > 0) {
    throw new Error("Incomplete first-completion transaction bundle");
  }

  const memoryInkAwarded = calculateFirstCompletionMemoryInk(input, config);
  const completionRecord: SaveV2CompletionRecord = {
    puzzleId: input.puzzleId,
    contentLocale: input.contentLocale,
    contentChecksum: input.contentChecksum,
    completedAt: input.completedAt,
    hintCount: input.hintCount,
    revealUsed: input.revealUsed,
  };
  const economyRecords: SaveV2EconomyRecord[] = [
    {
      transactionId: mapGrantId,
      kind: "grant",
      contentLocale: input.contentLocale,
      scopeVersion: GAME_ECONOMY_SCOPE_VERSION,
      occurredAt: input.completedAt,
      payload: {
        rewardType: "map_fragment",
        amount: 1,
        puzzleId: input.puzzleId,
        mapNodeId: input.mapNodeId,
      },
    },
    {
      transactionId: inkGrantId,
      kind: "currency",
      contentLocale: input.contentLocale,
      scopeVersion: GAME_ECONOMY_SCOPE_VERSION,
      occurredAt: input.completedAt,
      payload: {
        currency: MEMORY_INK_CURRENCY_ID,
        delta: memoryInkAwarded,
        source: "first_completion",
        puzzleId: input.puzzleId,
      },
    },
    ...input.cardIds.map(
      (cardId, index): SaveV2EconomyRecord => ({
        transactionId: cardGrantIds[index],
        kind: "grant",
        contentLocale: input.contentLocale,
        scopeVersion: GAME_ECONOMY_SCOPE_VERSION,
        occurredAt: input.completedAt,
        payload: {
          rewardType: "knowledge_card",
          puzzleId: input.puzzleId,
          cardId,
        },
      }),
    ),
  ];
  const nextContentState: SaveV2ContentState = {
    ...contentState,
    puzzles: {
      ...contentState.puzzles,
      [input.puzzleId]: {
        ...puzzleSnapshot,
        completedAt: puzzleSnapshot.completedAt ?? input.completedAt,
      },
    },
    completedPuzzleIds: appendUnique(contentState.completedPuzzleIds, [
      input.puzzleId,
    ]),
    mapNodeIds: appendUnique(contentState.mapNodeIds, [input.mapNodeId]),
    cardIds: appendUnique(contentState.cardIds, input.cardIds),
    completionRecords: [...contentState.completionRecords, completionRecord],
  };
  const nextSave: SaveV2Envelope = {
    ...save,
    checksum: "",
    content: {
      ...save.content,
      [input.contentLocale]: nextContentState,
    },
    economyRecords: [...save.economyRecords, ...economyRecords],
  };

  return {
    status: "granted",
    save: nextSave,
    memoryInkAwarded,
    memoryInkBalance: projectMemoryInkBalance(nextSave, input.contentLocale),
    mapFragmentAwarded: true,
    cardIdsAwarded: input.cardIds,
  };
}

export function purchaseCosmetic(
  save: SaveV2Envelope,
  rawInput: CosmeticPurchaseInput,
): CosmeticPurchaseResult {
  const input = {
    ...rawInput,
    profileScope: requireNonEmpty(rawInput.profileScope, "profileScope"),
    contentLocale: requireNonEmpty(rawInput.contentLocale, "contentLocale"),
    cosmeticId: requireNonEmpty(rawInput.cosmeticId, "cosmeticId"),
    occurredAt: requireNonEmpty(rawInput.occurredAt, "occurredAt"),
  };
  getContentState(save, input.contentLocale);
  const price = COSMETIC_PRICE_BY_TIER[input.tier];
  if (!Number.isInteger(price)) {
    throw new TypeError("tier must be small, medium, or large");
  }
  const entitlementId = transactionId(
    input.profileScope,
    input.contentLocale,
    input.cosmeticId,
    "cosmetic-entitlement",
  );
  const sinkId = transactionId(
    input.profileScope,
    input.contentLocale,
    input.cosmeticId,
    "currency-memory-ink-cosmetic-purchase",
  );
  const entitlementExists = save.economyRecords.some(
    (record) => record.transactionId === entitlementId,
  );
  const sinkExists = save.economyRecords.some(
    (record) => record.transactionId === sinkId,
  );
  const balance = projectMemoryInkBalance(save, input.contentLocale);
  if (entitlementExists && sinkExists) {
    return {
      status: "already-owned",
      save,
      price,
      memoryInkBalance: balance,
    };
  }
  if (entitlementExists || sinkExists) {
    throw new Error("Incomplete cosmetic purchase transaction bundle");
  }
  if (balance < price) {
    return {
      status: "insufficient-balance",
      save,
      price,
      memoryInkBalance: balance,
    };
  }

  const nextSave: SaveV2Envelope = {
    ...save,
    checksum: "",
    economyRecords: [
      ...save.economyRecords,
      {
        transactionId: sinkId,
        kind: "currency",
        contentLocale: input.contentLocale,
        scopeVersion: GAME_ECONOMY_SCOPE_VERSION,
        occurredAt: input.occurredAt,
        payload: {
          currency: MEMORY_INK_CURRENCY_ID,
          delta: -price,
          sink: "cosmetic_purchase",
          cosmeticId: input.cosmeticId,
          tier: input.tier,
        },
      },
      {
        transactionId: entitlementId,
        kind: "cosmetic-entitlement",
        contentLocale: input.contentLocale,
        scopeVersion: GAME_ECONOMY_SCOPE_VERSION,
        occurredAt: input.occurredAt,
        payload: {
          cosmeticId: input.cosmeticId,
          tier: input.tier,
          purchasePrice: price,
        },
      },
    ],
  };

  return {
    status: "purchased",
    save: nextSave,
    price,
    memoryInkBalance: projectMemoryInkBalance(nextSave, input.contentLocale),
  };
}
