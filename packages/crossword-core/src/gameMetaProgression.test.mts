import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  FIVE_OF_SEVEN_MISSION_POLICY,
  GAME_META_UNLOCK_POLICY,
  createGameMissionProgress,
  projectGameMetaUnlocks,
  projectGameMetaUnlocksFromCompletedPuzzleIds,
  projectKnowledgeCardCollection,
  purchaseUnlockedCosmetic,
  recordGameMissionCompletion,
  WEEKLY_HARD_MISSION_POLICY,
  type FiveOfSevenMissionDefinition,
  type KnowledgeCardCatalogItem,
  type WeeklyHardMissionDefinition,
} from "./gameMetaProgression.ts";
import {
  createEmptySaveV2,
  type SaveV2ContentState,
  type SaveV2Envelope,
} from "./saveV2.ts";

const LOCAL_DATES = [
  "2026-07-20",
  "2026-07-21",
  "2026-07-22",
  "2026-07-23",
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
] as const;

function emptyContentState(): SaveV2ContentState {
  return {
    puzzles: {},
    completedPuzzleIds: [],
    mapNodeIds: [],
    cardIds: [],
    streakCompletedDates: [],
    completionRecords: [],
  };
}

function createSave(): SaveV2Envelope {
  const save = createEmptySaveV2({
    uiLocale: "ko-KR",
    contentLocale: "ko-KR",
    inputMode: "word-strip",
    migratedAt: "2026-07-17T00:00:00.000Z",
    sourceVersion: "test",
    migrationChecksum: "test",
  });
  return {
    ...save,
    content: {
      "ko-KR": emptyContentState(),
      "future-X": emptyContentState(),
    },
  };
}

function withCompletedBoards(
  save: SaveV2Envelope,
  contentLocale: string,
  puzzleIds: readonly string[],
): SaveV2Envelope {
  return {
    ...save,
    content: {
      ...save.content,
      [contentLocale]: {
        ...save.content[contentLocale],
        completedPuzzleIds: [...puzzleIds],
      },
    },
  };
}

function withMemoryInk(
  save: SaveV2Envelope,
  contentLocale: string,
  amount: number,
): SaveV2Envelope {
  return {
    ...save,
    economyRecords: [
      ...save.economyRecords,
      {
        transactionId: `test:${contentLocale}:memory-ink`,
        kind: "currency",
        contentLocale,
        scopeVersion: 1,
        occurredAt: "2026-07-17T00:00:00.000Z",
        payload: { currency: "memory_ink", delta: amount },
      },
    ],
  };
}

describe("game meta unlock policy", () => {
  test("문서의 3개·5개 보드 해금 경계를 중복 완료 없이 계산한다", () => {
    assert.deepEqual(GAME_META_UNLOCK_POLICY, {
      knowledgeCollectionCompletedBoards: 3,
      pathColorCosmeticsCompletedBoards: 3,
      weeklyChallengeCompletedBoards: 5,
    });
    const two = withCompletedBoards(createSave(), "ko-KR", ["p1", "p2"]);
    assert.deepEqual(projectGameMetaUnlocks(two, "ko-KR"), {
      completedBoardCount: 2,
      knowledgeCollection: false,
      pathColorCosmetics: false,
      weeklyChallenge: false,
    });
    const five = withCompletedBoards(two, "ko-KR", [
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p5",
    ]);
    assert.deepEqual(projectGameMetaUnlocks(five, "ko-KR"), {
      completedBoardCount: 5,
      knowledgeCollection: true,
      pathColorCosmetics: true,
      weeklyChallenge: true,
    });
    assert.deepEqual(
      projectGameMetaUnlocksFromCompletedPuzzleIds(["p1", "p2", "p3", "p3"]),
      {
        completedBoardCount: 3,
        knowledgeCollection: true,
        pathColorCosmetics: true,
        weeklyChallenge: false,
      },
    );
    assert.throws(
      () => projectGameMetaUnlocksFromCompletedPuzzleIds(["p1", ""]),
      /completedPuzzleIds\[1\] must not be empty/,
    );
  });

  test("같은 puzzleId도 content locale별 완료 수를 격리한다", () => {
    let save = withCompletedBoards(createSave(), "ko-KR", ["p1", "p2", "p3"]);
    save = withCompletedBoards(save, "future-X", ["p1", "p2"]);
    assert.equal(
      projectGameMetaUnlocks(save, "ko-KR").knowledgeCollection,
      true,
    );
    assert.equal(
      projectGameMetaUnlocks(save, "future-X").knowledgeCollection,
      false,
    );
  });
});

describe("weekly mission progression", () => {
  const flexibleDefinition: FiveOfSevenMissionDefinition = {
    kind: "five-of-seven",
    missionId: "week-2026-30:flexible",
    contentLocale: "ko-KR",
    eligibleLocalDates: LOCAL_DATES,
  };

  test("7일 중 서로 다른 5일 완료에서 기억잉크 60 intent를 한 번만 만든다", () => {
    assert.deepEqual(FIVE_OF_SEVEN_MISSION_POLICY, {
      periodDayCount: 7,
      requiredDistinctDailyCompletions: 5,
      memoryInkReward: 60,
    });
    let state = createGameMissionProgress(flexibleDefinition);
    for (let index = 0; index < 4; index += 1) {
      const result = recordGameMissionCompletion(flexibleDefinition, state, {
        kind: "daily-board-completed",
        eventId: `daily-${index}`,
        contentLocale: "ko-KR",
        localDate: LOCAL_DATES[index],
        puzzleId: `p${index}`,
        occurredAt: `2026-07-${20 + index}T12:00:00.000Z`,
      });
      assert.equal(result.status, "recorded");
      assert.equal(result.rewardIntent, undefined);
      state = result.state;
    }

    const duplicate = recordGameMissionCompletion(flexibleDefinition, state, {
      kind: "daily-board-completed",
      eventId: "daily-3",
      contentLocale: "ko-KR",
      localDate: LOCAL_DATES[3],
      puzzleId: "other-puzzle",
      occurredAt: "2026-07-23T13:00:00.000Z",
    });
    assert.equal(duplicate.status, "duplicate");
    assert.strictEqual(duplicate.state, state);

    const settled = recordGameMissionCompletion(flexibleDefinition, state, {
      kind: "daily-board-completed",
      eventId: "daily-4",
      contentLocale: "ko-KR",
      localDate: LOCAL_DATES[4],
      puzzleId: "p4",
      occurredAt: "2026-07-24T12:00:00.000Z",
    });
    assert.equal(settled.status, "settled");
    assert.deepEqual(settled.rewardIntent, {
      settlementId: "week-2026-30:flexible",
      contentLocale: "ko-KR",
      memoryInk: 60,
    });

    const replay = recordGameMissionCompletion(
      flexibleDefinition,
      settled.state,
      {
        kind: "daily-board-completed",
        eventId: "daily-4",
        contentLocale: "ko-KR",
        localDate: LOCAL_DATES[4],
        puzzleId: "p4",
        occurredAt: "2026-07-24T12:00:00.000Z",
      },
    );
    assert.equal(replay.status, "duplicate");
    assert.equal(replay.rewardIntent, undefined);
    assert.strictEqual(replay.state, settled.state);
  });

  test("다른 locale과 7일 범위 밖 완료는 진행에 섞지 않는다", () => {
    const state = createGameMissionProgress(flexibleDefinition);
    const otherLocale = recordGameMissionCompletion(flexibleDefinition, state, {
      kind: "daily-board-completed",
      eventId: "future-event",
      contentLocale: "future-X",
      localDate: LOCAL_DATES[0],
      puzzleId: "p1",
      occurredAt: "2026-07-20T12:00:00.000Z",
    });
    assert.equal(otherLocale.status, "out-of-scope");
    assert.strictEqual(otherLocale.state, state);

    const outsidePeriod = recordGameMissionCompletion(
      flexibleDefinition,
      state,
      {
        kind: "daily-board-completed",
        eventId: "outside-event",
        contentLocale: "ko-KR",
        localDate: "2026-07-27",
        puzzleId: "p8",
        occurredAt: "2026-07-27T12:00:00.000Z",
      },
    );
    assert.equal(outsidePeriod.status, "out-of-scope");
    assert.strictEqual(outsidePeriod.state, state);
  });

  test("7일 달력 범위를 호출자가 주지 않으면 임의의 주차를 만들지 않는다", () => {
    assert.throws(
      () =>
        createGameMissionProgress({
          ...flexibleDefinition,
          eligibleLocalDates: LOCAL_DATES.slice(0, 6),
        }),
      /requires 7 unique local dates/,
    );
    assert.throws(
      () =>
        createGameMissionProgress({
          ...flexibleDefinition,
          eligibleLocalDates: [...LOCAL_DATES.slice(0, 6), "2026-07-28"],
        }),
      /requires 7 consecutive local dates/,
    );
  });

  test("완료 key와 처리 event 증거가 어긋난 외부 mission state는 보상을 만들지 못한다", () => {
    const forgedState = {
      ...createGameMissionProgress(flexibleDefinition),
      completedKeys: LOCAL_DATES.slice(0, 4),
      processedEventIds: [],
    };
    assert.throws(
      () =>
        recordGameMissionCompletion(flexibleDefinition, forgedState, {
          kind: "daily-board-completed",
          eventId: "forged-settlement-event",
          contentLocale: "ko-KR",
          localDate: LOCAL_DATES[4],
          puzzleId: "p4",
          occurredAt: "2026-07-24T12:00:00.000Z",
        }),
      /completion evidence is inconsistent/,
    );

    const prematurelySettled = {
      ...createGameMissionProgress(flexibleDefinition),
      completedKeys: [LOCAL_DATES[0]],
      processedEventIds: ["daily-0"],
      settledAt: "2026-07-20T12:00:00.000Z",
    };
    assert.throws(
      () =>
        recordGameMissionCompletion(flexibleDefinition, prematurelySettled, {
          kind: "daily-board-completed",
          eventId: "daily-1",
          contentLocale: "ko-KR",
          localDate: LOCAL_DATES[1],
          puzzleId: "p1",
          occurredAt: "2026-07-21T12:00:00.000Z",
        }),
      /settlement evidence is inconsistent/,
    );

    assert.throws(
      () =>
        recordGameMissionCompletion(
          flexibleDefinition,
          createGameMissionProgress(flexibleDefinition),
          {
            kind: "daily-board-completed",
            eventId: "invalid-time-event",
            contentLocale: "ko-KR",
            localDate: LOCAL_DATES[0],
            puzzleId: "p0",
            occurredAt: "bad-date",
          },
        ),
      /occurredAt must be an ISO-8601 timestamp/,
    );
  });

  test("주간 어려움 1회 완료는 60과 명시된 전용 엽서만 한 번 정산한다", () => {
    assert.deepEqual(WEEKLY_HARD_MISSION_POLICY, {
      requiredHardBoardCompletions: 1,
      memoryInkReward: 60,
    });
    const definition: WeeklyHardMissionDefinition = {
      kind: "weekly-hard",
      missionId: "week-2026-30:hard",
      contentLocale: "ko-KR",
      eligiblePuzzleIds: ["weekly-hard-30"],
      exclusivePostcardId: "postcard-weekly-30",
    };
    const initial = createGameMissionProgress(definition);
    const settled = recordGameMissionCompletion(definition, initial, {
      kind: "weekly-hard-board-completed",
      eventId: "weekly-hard-event",
      contentLocale: "ko-KR",
      puzzleId: "weekly-hard-30",
      occurredAt: "2026-07-24T12:00:00.000Z",
    });
    assert.equal(settled.status, "settled");
    assert.deepEqual(settled.rewardIntent, {
      settlementId: "week-2026-30:hard",
      contentLocale: "ko-KR",
      memoryInk: 60,
      exclusivePostcardId: "postcard-weekly-30",
    });
    const replay = recordGameMissionCompletion(definition, settled.state, {
      kind: "weekly-hard-board-completed",
      eventId: "different-event-id",
      contentLocale: "ko-KR",
      puzzleId: "weekly-hard-30",
      occurredAt: "2026-07-24T13:00:00.000Z",
    });
    assert.equal(replay.status, "already-settled");
    assert.equal(replay.rewardIntent, undefined);
  });
});

describe("knowledge card collection", () => {
  const catalog: readonly KnowledgeCardCatalogItem[] = [
    {
      cardId: "shared-card",
      contentLocale: "ko-KR",
      answer: "한글",
      shortExplanation: "한국어를 적는 문자 체계",
      source: "국립국어원",
      sourceEntryId: "fixture-ko",
      sourceUrl: "https://example.com/ko",
      licenseId: "fixture-license",
      domainTags: ["language"],
      reviewerId: "fixture-reviewer",
      reviewedAt: "2026-07-17T00:00:00.000Z",
      cardChecksum: "fixture-card-ko",
    },
    {
      cardId: "shared-card",
      contentLocale: "future-X",
      answer: "future answer",
      shortExplanation: "future explanation",
      source: "future source",
      sourceEntryId: "fixture-future",
      sourceUrl: "https://example.com/future",
      licenseId: "fixture-license",
      domainTags: ["future"],
      reviewerId: "fixture-reviewer",
      reviewedAt: "2026-07-17T00:00:00.000Z",
      cardChecksum: "fixture-card-future",
    },
  ];

  test("3개 보드 전에는 보유 카드를 컬렉션에 노출하지 않는다", () => {
    let save = withCompletedBoards(createSave(), "ko-KR", ["p1", "p2"]);
    save = {
      ...save,
      content: {
        ...save.content,
        "ko-KR": {
          ...save.content["ko-KR"],
          cardIds: ["shared-card"],
        },
      },
    };
    const projection = projectKnowledgeCardCollection(save, "ko-KR", catalog);
    assert.equal(projection.status, "locked");
    assert.deepEqual(projection.ownedCardIds, ["shared-card"]);
    assert.deepEqual(projection.visibleCards, []);
  });

  test("해금 후에는 해당 content locale의 카드만 보여주고 누락을 대체하지 않는다", () => {
    let save = withCompletedBoards(createSave(), "ko-KR", ["p1", "p2", "p3"]);
    save = {
      ...save,
      content: {
        ...save.content,
        "ko-KR": {
          ...save.content["ko-KR"],
          cardIds: ["missing-card", "shared-card", "shared-card"],
        },
      },
    };
    const projection = projectKnowledgeCardCollection(save, "ko-KR", catalog);
    assert.equal(projection.status, "unlocked");
    assert.deepEqual(
      projection.visibleCards.map((card) => [card.contentLocale, card.answer]),
      [["ko-KR", "한글"]],
    );
    assert.deepEqual(projection.missingCatalogCardIds, ["missing-card"]);
  });
});

describe("path color cosmetic purchase policy", () => {
  const koItem = {
    cosmeticId: "ink-teal",
    contentLocale: "ko-KR",
    kind: "path-color",
    tier: "small",
  } as const;

  test("3개 보드 해금 전에는 기존 원장을 호출하지 않고 구매를 막는다", () => {
    const save = withMemoryInk(
      withCompletedBoards(createSave(), "ko-KR", ["p1", "p2"]),
      "ko-KR",
      200,
    );
    const result = purchaseUnlockedCosmetic(save, {
      profileScope: "local-profile",
      contentLocale: "ko-KR",
      item: koItem,
      occurredAt: "2026-07-24T12:00:00.000Z",
    });
    assert.equal(result.status, "locked");
    assert.strictEqual(result.save, save);
    assert.equal(result.memoryInkBalance, 200);
  });

  test("해금 뒤 구매는 gameEconomy 거래를 재사용해 차감과 재시도를 멱등 처리한다", () => {
    const save = withMemoryInk(
      withCompletedBoards(createSave(), "ko-KR", ["p1", "p2", "p3"]),
      "ko-KR",
      200,
    );
    const purchased = purchaseUnlockedCosmetic(save, {
      profileScope: "local-profile",
      contentLocale: "ko-KR",
      item: koItem,
      occurredAt: "2026-07-24T12:00:00.000Z",
    });
    assert.equal(purchased.status, "purchased");
    assert.equal(purchased.price, 180);
    assert.equal(purchased.memoryInkBalance, 20);
    const replay = purchaseUnlockedCosmetic(purchased.save, {
      profileScope: "local-profile",
      contentLocale: "ko-KR",
      item: koItem,
      occurredAt: "2026-07-24T13:00:00.000Z",
    });
    assert.equal(replay.status, "already-owned");
    assert.equal(replay.memoryInkBalance, 20);
    assert.strictEqual(replay.save, purchased.save);
  });

  test("같은 cosmeticId도 locale별 잔액·entitlement를 공유하지 않는다", () => {
    let save = createSave();
    save = withCompletedBoards(save, "ko-KR", ["p1", "p2", "p3"]);
    save = withCompletedBoards(save, "future-X", ["p1", "p2", "p3"]);
    save = withMemoryInk(save, "ko-KR", 200);
    save = withMemoryInk(save, "future-X", 200);
    const koPurchased = purchaseUnlockedCosmetic(save, {
      profileScope: "local-profile",
      contentLocale: "ko-KR",
      item: koItem,
      occurredAt: "2026-07-24T12:00:00.000Z",
    });
    assert.equal(koPurchased.status, "purchased");
    const futurePurchased = purchaseUnlockedCosmetic(koPurchased.save, {
      profileScope: "local-profile",
      contentLocale: "future-X",
      item: { ...koItem, contentLocale: "future-X" },
      occurredAt: "2026-07-24T12:01:00.000Z",
    });
    assert.equal(futurePurchased.status, "purchased");
    assert.equal(futurePurchased.memoryInkBalance, 20);
  });

  test("다른 locale 상품과 해금 기준이 없는 꾸미기 종류는 fail closed한다", () => {
    const save = withMemoryInk(
      withCompletedBoards(createSave(), "ko-KR", ["p1", "p2", "p3"]),
      "ko-KR",
      200,
    );
    const localeMismatch = purchaseUnlockedCosmetic(save, {
      profileScope: "local-profile",
      contentLocale: "ko-KR",
      item: { ...koItem, contentLocale: "future-X" },
      occurredAt: "2026-07-24T12:00:00.000Z",
    });
    assert.equal(localeMismatch.status, "locale-mismatch");
    assert.strictEqual(localeMismatch.save, save);

    const undefinedUnlock = purchaseUnlockedCosmetic(save, {
      profileScope: "local-profile",
      contentLocale: "ko-KR",
      item: { ...koItem, cosmeticId: "footprint-1", kind: "footprint" },
      occurredAt: "2026-07-24T12:00:00.000Z",
    });
    assert.equal(undefinedUnlock.status, "unlock-policy-not-defined");
    assert.strictEqual(undefinedUnlock.save, save);
  });
});
