import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  applyFirstCompletionRewards,
  calculateFirstCompletionMemoryInk,
  COSMETIC_PRICE_BY_TIER,
  getOwnedCosmeticIds,
  projectMemoryInkBalance,
  purchaseCosmetic,
} from "./gameEconomy.ts";
import {
  createEmptySaveV2,
  type SaveV2Envelope,
  type SaveV2PuzzleSnapshot,
} from "./saveV2.ts";

function createSave(contentLocale = "ko-KR"): SaveV2Envelope {
  const base = createEmptySaveV2({
    uiLocale: "ko-KR",
    contentLocale,
    inputMode: "word-strip",
    migratedAt: "2026-07-17T00:00:00.000Z",
    sourceVersion: "test",
    migrationChecksum: "test",
  });
  const snapshot: SaveV2PuzzleSnapshot = {
    contentLocale,
    puzzleId: "puzzle-1",
    contentChecksum: "content-1",
    currentEntryId: "a1",
    cellValues: {},
    earnedHintCredits: 0,
    hintCount: 0,
    revealUsed: false,
    tentativeCells: [],
    commandSequence: 1,
    phase: "result",
    updatedAt: "2026-07-17T00:00:01.000Z",
  };
  return {
    ...base,
    content: {
      [contentLocale]: {
        ...base.content[contentLocale],
        puzzles: { "puzzle-1": snapshot },
      },
    },
  };
}

function completionInput(contentLocale = "ko-KR") {
  return {
    profileScope: "local-profile",
    contentLocale,
    puzzleId: "puzzle-1",
    contentChecksum: "content-1",
    completedAt: "2026-07-17T00:01:00.000Z",
    entryCount: 6,
    longestIntersectionChain: 2,
    hintCount: 0,
    revealUsed: false,
    mapNodeId: "chapter-1/node-1",
    cardIds: ["card-a", "card-a"],
  } as const;
}

describe("memory ink reward", () => {
  test("문서의 보드 보상식을 그대로 계산한다", () => {
    assert.equal(
      calculateFirstCompletionMemoryInk({
        entryCount: 4,
        longestIntersectionChain: 2,
      }),
      22,
    );
    assert.equal(
      calculateFirstCompletionMemoryInk({
        entryCount: 13,
        longestIntersectionChain: 99,
      }),
      46,
    );
  });

  test("첫 완료만 지도 조각·기억잉크·카드를 한 거래 묶음으로 지급한다", () => {
    const first = applyFirstCompletionRewards(createSave(), completionInput());
    assert.equal(first.status, "granted");
    assert.equal(first.memoryInkAwarded, 26);
    assert.equal(first.memoryInkBalance, 26);
    assert.equal(first.mapFragmentAwarded, true);
    assert.deepEqual(first.cardIdsAwarded, ["card-a"]);
    assert.deepEqual(first.save.content["ko-KR"].completedPuzzleIds, [
      "puzzle-1",
    ]);
    assert.deepEqual(first.save.content["ko-KR"].mapNodeIds, [
      "chapter-1/node-1",
    ]);
    assert.deepEqual(first.save.content["ko-KR"].cardIds, ["card-a"]);
    assert.equal(first.save.economyRecords.length, 3);

    const replay = applyFirstCompletionRewards(first.save, completionInput());
    assert.equal(replay.status, "already-granted");
    assert.equal(replay.memoryInkAwarded, 0);
    assert.equal(replay.memoryInkBalance, 26);
    assert.strictEqual(replay.save, first.save);
  });

  test("같은 puzzleId라도 content locale별 원장과 잔액을 격리한다", () => {
    const koGranted = applyFirstCompletionRewards(
      createSave(),
      completionInput(),
    ).save;
    const withFutureNamespace: SaveV2Envelope = {
      ...koGranted,
      content: {
        ...koGranted.content,
        "future-X": createSave("future-X").content["future-X"],
      },
    };
    const futureGranted = applyFirstCompletionRewards(
      withFutureNamespace,
      completionInput("future-X"),
    ).save;

    assert.equal(projectMemoryInkBalance(futureGranted, "ko-KR"), 26);
    assert.equal(projectMemoryInkBalance(futureGranted, "future-X"), 26);
    assert.equal(futureGranted.economyRecords.length, 6);
  });

  test("저장되지 않은 퍼즐에는 보상을 만들지 않는다", () => {
    assert.throws(
      () =>
        applyFirstCompletionRewards(createSave(), {
          ...completionInput(),
          puzzleId: "missing",
        }),
      /persisted puzzle snapshot/,
    );
  });

  test("부분 완료 거래 묶음은 중복 transaction을 만들지 않고 거부한다", () => {
    const granted = applyFirstCompletionRewards(
      createSave(),
      completionInput(),
    ).save;
    const cardOnly: SaveV2Envelope = {
      ...createSave(),
      economyRecords: granted.economyRecords.filter(
        (record) => record.payload.rewardType === "knowledge_card",
      ),
    };

    assert.throws(
      () => applyFirstCompletionRewards(cardOnly, completionInput()),
      /Incomplete first-completion transaction bundle/,
    );
  });
});

describe("cosmetic economy", () => {
  test("가격은 small 180, medium 360, large 720으로 고정한다", () => {
    assert.deepEqual(COSMETIC_PRICE_BY_TIER, {
      small: 180,
      medium: 360,
      large: 720,
    });
  });

  test("잔액이 충분할 때만 차감과 entitlement를 원자적으로 추가한다", () => {
    let save = createSave();
    for (let index = 0; index < 7; index += 1) {
      const puzzleId = `puzzle-${index + 1}`;
      const snapshot = save.content["ko-KR"].puzzles["puzzle-1"];
      save = {
        ...save,
        content: {
          "ko-KR": {
            ...save.content["ko-KR"],
            puzzles: {
              ...save.content["ko-KR"].puzzles,
              [puzzleId]: {
                ...snapshot,
                puzzleId,
                contentChecksum: `content-${index + 1}`,
              },
            },
          },
        },
      };
      save = applyFirstCompletionRewards(save, {
        ...completionInput(),
        puzzleId,
        contentChecksum: `content-${index + 1}`,
        mapNodeId: `node-${index + 1}`,
        cardIds: [],
      }).save;
    }
    assert.equal(projectMemoryInkBalance(save, "ko-KR"), 182);

    const purchased = purchaseCosmetic(save, {
      profileScope: "local-profile",
      contentLocale: "ko-KR",
      cosmeticId: "ink-teal",
      tier: "small",
      occurredAt: "2026-07-18T00:00:00.000Z",
    });
    assert.equal(purchased.status, "purchased");
    assert.equal(purchased.memoryInkBalance, 2);
    assert.deepEqual(getOwnedCosmeticIds(purchased.save, "ko-KR"), [
      "ink-teal",
    ]);

    const replay = purchaseCosmetic(purchased.save, {
      profileScope: "local-profile",
      contentLocale: "ko-KR",
      cosmeticId: "ink-teal",
      tier: "small",
      occurredAt: "2026-07-18T00:01:00.000Z",
    });
    assert.equal(replay.status, "already-owned");
    assert.equal(replay.memoryInkBalance, 2);
    assert.strictEqual(replay.save, purchased.save);
  });

  test("잔액 부족이면 원장과 잔액을 바꾸지 않는다", () => {
    const save = applyFirstCompletionRewards(
      createSave(),
      completionInput(),
    ).save;
    const result = purchaseCosmetic(save, {
      profileScope: "local-profile",
      contentLocale: "ko-KR",
      cosmeticId: "postcard-gold",
      tier: "large",
      occurredAt: "2026-07-18T00:00:00.000Z",
    });
    assert.equal(result.status, "insufficient-balance");
    assert.equal(result.memoryInkBalance, 26);
    assert.strictEqual(result.save, save);
  });

  test("알 수 없는 가격 등급은 거래 전에 거부한다", () => {
    assert.throws(
      () =>
        purchaseCosmetic(createSave(), {
          profileScope: "local-profile",
          contentLocale: "ko-KR",
          cosmeticId: "invalid-tier",
          tier: "unknown" as never,
          occurredAt: "2026-07-18T00:00:00.000Z",
        }),
      /tier must be small, medium, or large/,
    );
  });

  test("부분 구매 거래 묶음은 중복 차감을 만들지 않고 거부한다", () => {
    let save = createSave();
    for (let index = 0; index < 7; index += 1) {
      const puzzleId = `puzzle-${index + 1}`;
      const snapshot = save.content["ko-KR"].puzzles["puzzle-1"];
      save = {
        ...save,
        content: {
          "ko-KR": {
            ...save.content["ko-KR"],
            puzzles: {
              ...save.content["ko-KR"].puzzles,
              [puzzleId]: {
                ...snapshot,
                puzzleId,
                contentChecksum: `content-${index + 1}`,
              },
            },
          },
        },
      };
      save = applyFirstCompletionRewards(save, {
        ...completionInput(),
        puzzleId,
        contentChecksum: `content-${index + 1}`,
        mapNodeId: `node-${index + 1}`,
        cardIds: [],
      }).save;
    }
    const purchased = purchaseCosmetic(save, {
      profileScope: "local-profile",
      contentLocale: "ko-KR",
      cosmeticId: "ink-teal",
      tier: "small",
      occurredAt: "2026-07-18T00:00:00.000Z",
    }).save;
    const sinkOnly: SaveV2Envelope = {
      ...purchased,
      economyRecords: purchased.economyRecords.filter(
        (record) => record.kind !== "cosmetic-entitlement",
      ),
    };

    assert.throws(
      () =>
        purchaseCosmetic(sinkOnly, {
          profileScope: "local-profile",
          contentLocale: "ko-KR",
          cosmeticId: "ink-teal",
          tier: "small",
          occurredAt: "2026-07-18T00:01:00.000Z",
        }),
      /Incomplete cosmetic purchase transaction bundle/,
    );
  });
});
