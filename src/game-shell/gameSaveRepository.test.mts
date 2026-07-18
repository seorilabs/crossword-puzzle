import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { GameSnapshot } from "../../packages/crossword-core/src/gameController.ts";
import {
  createEmptySaveV2,
  sealSaveV2,
  type SaveChecksumPort,
} from "../../packages/crossword-core/src/saveV2.ts";
import {
  createGameSaveRepository,
  DEFAULT_GAME_CELL_JOURNAL_KEY,
  DEFAULT_GAME_SAVE_V2_KEY,
  GameSaveRepositoryError,
  type KeyValueStoragePort,
} from "./gameSaveRepository.ts";

const checksumPort: SaveChecksumPort = {
  digest(payload) {
    let hash = 2166136261;
    for (const character of payload) {
      hash ^= character.codePointAt(0) ?? 0;
      hash = Math.imul(hash, 16777619);
    }
    return `test-${(hash >>> 0).toString(16)}`;
  },
};

class MemoryStorage implements KeyValueStoragePort {
  readonly values = new Map<string, string>();
  readonly operations: string[] = [];
  failNextSaveWrite = false;
  failNextJournalRemove = false;

  constructor(initial: Readonly<Record<string, string>> = {}) {
    Object.entries(initial).forEach(([key, value]) =>
      this.values.set(key, value),
    );
  }

  async getItem(key: string): Promise<string | null> {
    this.operations.push(`get:${key}`);
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.operations.push(`set:${key}`);
    if (key === DEFAULT_GAME_SAVE_V2_KEY && this.failNextSaveWrite) {
      this.failNextSaveWrite = false;
      throw new Error("injected-save-write-failure");
    }
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.operations.push(`remove:${key}`);
    if (key === DEFAULT_GAME_CELL_JOURNAL_KEY && this.failNextJournalRemove) {
      this.failNextJournalRemove = false;
      throw new Error("injected-journal-remove-failure");
    }
    this.values.delete(key);
  }
}

function gameSnapshot(patch: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    phase: "active",
    suspendedFrom: null,
    puzzleId: "puzzle-1",
    contentLocale: "ko-KR",
    contentChecksum: "content-checksum-1",
    languageProfileId: "ko-KR",
    languageProfileVersion: 1,
    selectedEntryId: "entry-1",
    cellValues: {},
    completedEntryIds: [],
    lastResolvedEntryIds: [],
    commandSequence: 0,
    lastError: null,
    ...patch,
  };
}

function repository(storage: MemoryStorage, now = "2026-07-17T01:00:00.000Z") {
  return createGameSaveRepository({
    storage,
    checksumPort,
    uiLocale: "ko-KR",
    inputMode: "box",
    settings: { sound: true },
    accessibility: { reducedMotion: false },
    now: () => now,
  });
}

const identity = {
  contentLocale: "ko-KR",
  puzzleId: "puzzle-1",
  contentChecksum: "content-checksum-1",
} as const;

const legacyBundledIdentities = {
  board1: {
    contentLocale: "ko-KR",
    puzzleId: "onboarding-easy-01",
    contentChecksum: "bundled:onboarding-easy-01:ko-KR:v1",
  },
  board2: {
    contentLocale: "ko-KR",
    puzzleId: "onboarding-easy-02",
    contentChecksum: "bundled:onboarding-easy-02:ko-KR:v1",
  },
  board3: {
    contentLocale: "ko-KR",
    puzzleId: "onboarding-easy-03",
    contentChecksum: "bundled:onboarding-easy-03:ko-KR:v1",
  },
} as const;

describe("game Save v2 repository validation", () => {
  test("JSON parse 실패와 schema 위반을 쓰기 없이 fail-closed 처리한다", async () => {
    for (const raw of ["{broken", JSON.stringify({ saveVersion: 2 })]) {
      const storage = new MemoryStorage({ [DEFAULT_GAME_SAVE_V2_KEY]: raw });
      const result = await repository(storage).loadPuzzleSnapshot(identity);

      assert.deepEqual(result, { status: "invalid-save", snapshot: null });
      assert.equal(
        storage.operations.some(
          (operation) =>
            operation.startsWith("set:") || operation.startsWith("remove:"),
        ),
        false,
      );
    }
  });

  test("namespace와 checksum을 검증하고 locale·puzzle·content가 모두 맞을 때만 복원한다", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.persistSnapshot(gameSnapshot({ cellValues: { "0:0": "가" } }));

    const restored = await repo.loadPuzzleSnapshot(identity);
    assert.equal(restored.status, "restored");
    assert.deepEqual(restored.snapshot?.cellValues, { "0:0": "가" });

    for (const mismatch of [
      { ...identity, contentLocale: "future-X" },
      { ...identity, puzzleId: "puzzle-2" },
      { ...identity, contentChecksum: "content-checksum-2" },
    ]) {
      assert.deepEqual(await repo.loadPuzzleSnapshot(mismatch), {
        status: "identity-mismatch",
        snapshot: null,
      });
    }

    const raw = storage.values.get(DEFAULT_GAME_SAVE_V2_KEY);
    assert.ok(raw);
    const tampered = JSON.parse(raw) as {
      content: Record<
        string,
        { puzzles: Record<string, { cellValues: object }> }
      >;
    };
    tampered.content["ko-KR"].puzzles["puzzle-1"].cellValues = {
      "0:0": "나",
    };
    storage.values.set(DEFAULT_GAME_SAVE_V2_KEY, JSON.stringify(tampered));

    assert.deepEqual(await repo.loadPuzzleSnapshot(identity), {
      status: "invalid-save",
      snapshot: null,
    });
  });

  test("checksum이 유효해도 namespace가 어긋난 save는 거부한다", async () => {
    const storage = new MemoryStorage();
    const invalidNamespace = createEmptySaveV2({
      uiLocale: "ko-KR",
      contentLocale: "ko-KR",
      inputMode: "box",
      migratedAt: "2026-07-17T00:00:00.000Z",
      sourceVersion: "fixture",
      migrationChecksum: "fixture",
    });
    invalidNamespace.content["ko-KR"].puzzles["puzzle-1"] = {
      contentLocale: "future-X",
      puzzleId: "puzzle-1",
      contentChecksum: "content-checksum-1",
      currentEntryId: null,
      cellValues: {},
      earnedHintCredits: 0,
      hintCount: 0,
      revealUsed: false,
      tentativeCells: [],
      commandSequence: 0,
      updatedAt: "2026-07-17T00:00:00.000Z",
    };
    const sealed = await sealSaveV2(invalidNamespace, checksumPort);
    storage.values.set(DEFAULT_GAME_SAVE_V2_KEY, JSON.stringify(sealed));

    assert.deepEqual(await repository(storage).loadPuzzleSnapshot(identity), {
      status: "invalid-save",
      snapshot: null,
    });
  });
});

describe("legacy bundled content identity cutover", () => {
  test("첫 두 보드는 old alias를 호출자가 준 current checksum으로 승격하며 진행을 보존한다", async () => {
    for (const [index, legacyIdentity] of [
      legacyBundledIdentities.board1,
      legacyBundledIdentities.board2,
    ].entries()) {
      const storage = new MemoryStorage();
      await repository(storage, "2026-07-17T01:00:00.000Z").persistSnapshot(
        gameSnapshot({
          ...legacyIdentity,
          phase: "word-resolved",
          selectedEntryId: `legacy-entry-${index + 1}`,
          cellValues: { "0:0": "가", "0:1": "나" },
          commandSequence: 7,
        }),
        {
          earnedHintCredits: 3,
          hintCount: 2,
          longestIntersectionChain: 2,
          revealUsed: true,
          tentativeCells: ["0:1"],
        },
      );

      const currentIdentity = {
        contentLocale: legacyIdentity.contentLocale,
        puzzleId: legacyIdentity.puzzleId,
        contentChecksum: `sha256:caller-current-board-${index + 1}`,
      };
      storage.operations.length = 0;
      const migrated = await repository(
        storage,
        "2026-07-18T01:00:00.000Z",
      ).loadPuzzleSnapshot(currentIdentity);

      assert.equal(migrated.status, "migrated");
      assert.deepEqual(migrated.snapshot, {
        contentLocale: "ko-KR",
        puzzleId: legacyIdentity.puzzleId,
        contentChecksum: currentIdentity.contentChecksum,
        currentEntryId: `legacy-entry-${index + 1}`,
        cellValues: { "0:0": "가", "0:1": "나" },
        earnedHintCredits: 3,
        hintCount: 2,
        longestIntersectionChain: 2,
        revealUsed: true,
        tentativeCells: ["0:1"],
        commandSequence: 7,
        phase: "word-resolved",
        updatedAt: "2026-07-18T01:00:00.000Z",
      });
      assert.equal(
        storage.operations.filter(
          (operation) => operation === `set:${DEFAULT_GAME_SAVE_V2_KEY}`,
        ).length,
        1,
      );
      assert.equal(storage.values.has(DEFAULT_GAME_CELL_JOURNAL_KEY), false);

      storage.operations.length = 0;
      const restarted =
        await repository(storage).loadPuzzleSnapshot(currentIdentity);
      assert.equal(restarted.status, "restored");
      assert.equal(
        storage.operations.some((operation) => operation.startsWith("set:")),
        false,
      );
    }
  });

  test("구조가 바뀐 세 번째 보드는 보드 로컬 상태만 reset하고 완료·경제 원장을 보존한다", async () => {
    const storage = new MemoryStorage();
    const oldRepo = repository(storage, "2026-07-17T03:00:00.000Z");
    await oldRepo.recordPuzzleCompletion({
      snapshot: gameSnapshot({
        ...legacyBundledIdentities.board3,
        phase: "board-resolved",
        selectedEntryId: "legacy-entry-completed",
        cellValues: { "0:0": "기", "0:1": "차" },
        completedEntryIds: ["legacy-entry-completed"],
        lastResolvedEntryIds: ["legacy-entry-completed"],
        commandSequence: 9,
      }),
      entryCount: 1,
      mapNodeId: "chapter-01-forgotten-path:node:onboarding-easy-03",
      cardIds: ["legacy-card-3"],
    });
    await oldRepo.persistSnapshot(
      gameSnapshot({
        ...legacyBundledIdentities.board3,
        phase: "active",
        selectedEntryId: "legacy-entry-active",
        cellValues: { "0:0": "기", "1:0": "차" },
        commandSequence: 4,
      }),
      {
        earnedHintCredits: 5,
        hintCount: 2,
        longestIntersectionChain: 3,
        revealUsed: true,
        tentativeCells: ["1:0"],
      },
    );
    const progressionBefore = await oldRepo.readProgression("ko-KR");
    const rawBefore = storage.values.get(DEFAULT_GAME_SAVE_V2_KEY);
    assert.ok(rawBefore);
    const saveBefore = JSON.parse(rawBefore);

    const currentIdentity = {
      contentLocale: "ko-KR",
      puzzleId: legacyBundledIdentities.board3.puzzleId,
      contentChecksum: "sha256:caller-current-board-3",
    } as const;
    const currentRepo = repository(storage, "2026-07-18T03:00:00.000Z");
    const migrated = await currentRepo.loadPuzzleSnapshot(currentIdentity);

    assert.equal(migrated.status, "migrated");
    assert.deepEqual(migrated.snapshot, {
      contentLocale: "ko-KR",
      puzzleId: "onboarding-easy-03",
      contentChecksum: currentIdentity.contentChecksum,
      currentEntryId: null,
      cellValues: {},
      earnedHintCredits: 5,
      hintCount: 0,
      longestIntersectionChain: 0,
      revealUsed: false,
      tentativeCells: [],
      commandSequence: 0,
      phase: "intro",
      updatedAt: "2026-07-18T03:00:00.000Z",
    });
    assert.deepEqual(
      await currentRepo.readProgression("ko-KR"),
      progressionBefore,
    );

    const rawAfter = storage.values.get(DEFAULT_GAME_SAVE_V2_KEY);
    assert.ok(rawAfter);
    const saveAfter = JSON.parse(rawAfter);
    assert.deepEqual(
      saveAfter.content["ko-KR"].completionRecords,
      saveBefore.content["ko-KR"].completionRecords,
    );
    assert.deepEqual(saveAfter.economyRecords, saveBefore.economyRecords);
    assert.equal(
      saveAfter.content["ko-KR"].completedPuzzleIds.includes(
        "onboarding-easy-03",
      ),
      true,
    );
  });

  test("알려진 alias라도 locale·puzzle tuple이 다르면 저장을 수정하지 않는다", async () => {
    const storage = new MemoryStorage();
    await repository(storage).persistSnapshot(
      gameSnapshot({
        puzzleId: "puzzle-1",
        contentChecksum: legacyBundledIdentities.board1.contentChecksum,
        cellValues: { "0:0": "가" },
      }),
    );
    const durableSave = storage.values.get(DEFAULT_GAME_SAVE_V2_KEY);
    storage.operations.length = 0;

    assert.deepEqual(
      await repository(storage).loadPuzzleSnapshot({
        contentLocale: "ko-KR",
        puzzleId: "puzzle-1",
        contentChecksum: "sha256:untrusted-cutover-target",
      }),
      { status: "identity-mismatch", snapshot: null },
    );
    assert.equal(storage.values.get(DEFAULT_GAME_SAVE_V2_KEY), durableSave);
    assert.equal(
      storage.operations.some((operation) => operation.startsWith("set:")),
      false,
    );
  });

  test("승격 뒤 남은 old-identity journal은 새 snapshot에 replay하지 않고 격리한다", async () => {
    const storage = new MemoryStorage();
    const currentIdentity = {
      contentLocale: "ko-KR",
      puzzleId: legacyBundledIdentities.board1.puzzleId,
      contentChecksum: "sha256:caller-current-board-1",
    } as const;
    await repository(storage).persistSnapshot(
      gameSnapshot({
        ...legacyBundledIdentities.board1,
        cellValues: { "0:0": "가" },
        commandSequence: 1,
      }),
    );
    await repository(storage, "2026-07-18T04:00:00.000Z").loadPuzzleSnapshot(
      currentIdentity,
    );
    const currentRaw = storage.values.get(DEFAULT_GAME_SAVE_V2_KEY);
    assert.ok(currentRaw);
    const currentSave = JSON.parse(currentRaw);
    storage.values.set(
      DEFAULT_GAME_CELL_JOURNAL_KEY,
      JSON.stringify({
        journalVersion: 1,
        ...legacyBundledIdentities.board1,
        cellKey: "9:9",
        cellValue: "나",
        commandSequence: 2,
        baseSaveChecksum: currentSave.checksum,
        createdAt: "2026-07-18T04:00:01.000Z",
      }),
    );

    const restored = await repository(
      storage,
      "2026-07-18T04:00:02.000Z",
    ).loadPuzzleSnapshot(currentIdentity);
    assert.equal(restored.status, "recovered");
    assert.deepEqual(restored.snapshot?.cellValues, { "0:0": "가" });
    assert.equal(storage.values.has(DEFAULT_GAME_CELL_JOURNAL_KEY), false);
    assert.ok(
      storage.values.has(
        `${DEFAULT_GAME_CELL_JOURNAL_KEY}:quarantine:20260718T040002000Z`,
      ),
    );
    assert.equal(storage.values.get(DEFAULT_GAME_SAVE_V2_KEY), currentRaw);
  });
});

describe("game progression ledger repository", () => {
  test("첫 완료 보상을 sealed Save v2에 한 번만 기록하고 최장 교차 연쇄를 보존한다", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage, "2026-07-17T03:00:00.000Z");
    await repo.persistSnapshot(
      gameSnapshot({
        commandSequence: 1,
        lastResolvedEntryIds: ["entry-1", "entry-2"],
      }),
      { longestIntersectionChain: 2 },
    );

    const completedSnapshot = gameSnapshot({
      phase: "board-resolved",
      commandSequence: 2,
      completedEntryIds: ["entry-1", "entry-2", "entry-3", "entry-4"],
      lastResolvedEntryIds: ["entry-4"],
    });
    const first = await repo.recordPuzzleCompletion({
      snapshot: completedSnapshot,
      entryCount: 4,
      mapNodeId: "chapter-1/node-1",
      cardIds: ["card-1"],
    });
    assert.equal(first.status, "granted");
    assert.equal(first.memoryInkAwarded, 22);
    assert.equal(first.progression.memoryInkBalance, 22);
    assert.deepEqual(first.progression.metaUnlocks, {
      completedBoardCount: 1,
      knowledgeCollection: false,
      pathColorCosmetics: false,
      weeklyChallenge: false,
    });
    assert.deepEqual(first.progression.mapNodeIds, ["chapter-1/node-1"]);
    assert.deepEqual(first.progression.cardIds, ["card-1"]);

    const restored = await repo.loadPuzzleSnapshot(identity);
    assert.equal(restored.status, "restored");
    assert.equal(restored.snapshot?.longestIntersectionChain, 2);
    assert.equal(restored.snapshot?.completedAt, "2026-07-17T03:00:00.000Z");

    const replay = await repo.recordPuzzleCompletion({
      snapshot: completedSnapshot,
      entryCount: 4,
      mapNodeId: "chapter-1/node-1",
      cardIds: ["card-1"],
    });
    assert.equal(replay.status, "already-granted");
    assert.equal(replay.memoryInkAwarded, 0);
    assert.equal(replay.progression.memoryInkBalance, 22);
    assert.deepEqual(replay.progression.completedPuzzleIds, ["puzzle-1"]);
  });

  test("꾸미기 구매를 같은 sealed 원장에 저장하고 locale별 projection으로 읽는다", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage, "2026-07-17T04:00:00.000Z");
    const completedSnapshot = gameSnapshot({
      phase: "result",
      commandSequence: 1,
      completedEntryIds: ["entry-1"],
      lastResolvedEntryIds: ["entry-1"],
    });
    await repo.recordPuzzleCompletion({
      snapshot: completedSnapshot,
      entryCount: 1,
      mapNodeId: "chapter-1/node-1",
      rewardConfig: { base: 178, perEntry: 2, chainCap: 0 },
    });

    const purchased = await repo.purchaseCosmetic({
      contentLocale: "ko-KR",
      cosmeticId: "ink-teal",
      tier: "small",
    });
    assert.equal(purchased.status, "purchased");
    assert.equal(purchased.price, 180);
    assert.equal(purchased.progression.memoryInkBalance, 0);
    assert.deepEqual(purchased.progression.ownedCosmeticIds, ["ink-teal"]);
    assert.deepEqual(await repo.readProgression("future-X"), {
      contentLocale: "future-X",
      completedPuzzleIds: [],
      mapFragmentCount: 0,
      mapNodeIds: [],
      cardIds: [],
      memoryInkBalance: 0,
      ownedCosmeticIds: [],
      metaUnlocks: {
        completedBoardCount: 0,
        knowledgeCollection: false,
        pathColorCosmetics: false,
        weeklyChallenge: false,
      },
    });

    const restarted = repository(storage, "2026-07-17T05:00:00.000Z");
    assert.deepEqual(
      (await restarted.readProgression("ko-KR")).ownedCosmeticIds,
      ["ink-teal"],
    );
    assert.equal(
      (await restarted.loadPuzzleSnapshot(identity)).status,
      "restored",
    );
  });
});

describe("game experience preference repository", () => {
  test("BGM·SFX·햅틱·motion·contrast·100/150/200 설정을 sealed Save v2에 보존한다", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    assert.deepEqual(await repo.readExperiencePreferences(), {
      bgmEnabled: true,
      sfxEnabled: true,
      hapticEnabled: true,
      motionMode: "system",
      contrastMode: "system",
      textScale: "normal",
    });

    await repo.persistSnapshot(gameSnapshot());
    const updated = await repo.updateExperiencePreferences("ko-KR", {
      bgmEnabled: false,
      sfxEnabled: true,
      hapticEnabled: false,
      motionMode: "reduced",
      contrastMode: "high",
      textScale: "extra-large",
    });
    assert.deepEqual(updated, {
      bgmEnabled: false,
      sfxEnabled: true,
      hapticEnabled: false,
      motionMode: "reduced",
      contrastMode: "high",
      textScale: "extra-large",
    });

    const raw = storage.values.get(DEFAULT_GAME_SAVE_V2_KEY);
    assert.ok(raw);
    const saved = JSON.parse(raw);
    assert.equal(saved.profile.settings.bgmEnabled, false);
    assert.equal(saved.profile.settings.sfxEnabled, true);
    assert.equal(saved.profile.settings.soundEnabled, false);
    assert.equal(saved.profile.accessibility.reducedMotion, true);
    assert.equal(saved.profile.accessibility.highContrast, true);
    assert.equal(saved.profile.accessibility.textScale, "extra-large");

    assert.deepEqual(
      await repository(storage).readExperiencePreferences(),
      updated,
    );
  });
});

describe("GameSnapshot projection and compact journal", () => {
  test("GameSnapshot만 snapshot schema로 투영하고 정답·단서 원문 필드는 저장하지 않는다", async () => {
    const storage = new MemoryStorage();
    const projected = await repository(storage).persistSnapshot(
      gameSnapshot({
        cellValues: { "0:0": "가" },
        commandSequence: 7,
      }),
      {
        earnedHintCredits: 2,
        hintCount: 1,
        revealUsed: true,
        tentativeCells: ["0:0", "0:0"],
      },
    );

    assert.deepEqual(projected, {
      contentLocale: "ko-KR",
      puzzleId: "puzzle-1",
      contentChecksum: "content-checksum-1",
      currentEntryId: "entry-1",
      cellValues: { "0:0": "가" },
      earnedHintCredits: 2,
      hintCount: 1,
      longestIntersectionChain: 0,
      revealUsed: true,
      tentativeCells: ["0:0"],
      commandSequence: 7,
      phase: "active",
      updatedAt: "2026-07-17T01:00:00.000Z",
    });

    const raw = storage.values.get(DEFAULT_GAME_SAVE_V2_KEY);
    assert.ok(raw);
    assert.equal(raw.includes('"answer"'), false);
    assert.equal(raw.includes('"answerCells"'), false);
    assert.equal(raw.includes('"clue"'), false);
    assert.equal(raw.includes('"entries"'), false);
  });

  test("cell commit은 journal durable write → sealed save write → journal clear 순서를 지킨다", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.persistSnapshot(gameSnapshot());
    storage.operations.length = 0;

    const result = await repo.commitCell({
      snapshot: gameSnapshot({
        cellValues: { "0:0": "가" },
        commandSequence: 1,
      }),
      cellKey: "0:0",
      cellValue: "가",
    });

    assert.equal(result.cellValues["0:0"], "가");
    assert.deepEqual(
      storage.operations.filter(
        (operation) =>
          operation.startsWith("set:") || operation.startsWith("remove:"),
      ),
      [
        `set:${DEFAULT_GAME_CELL_JOURNAL_KEY}`,
        `set:${DEFAULT_GAME_SAVE_V2_KEY}`,
        `remove:${DEFAULT_GAME_CELL_JOURNAL_KEY}`,
      ],
    );
    assert.equal(storage.values.has(DEFAULT_GAME_CELL_JOURNAL_KEY), false);
  });

  test("journal이 표현하지 못하는 sequence·복수 셀 delta는 canonical save 전에 거부한다", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.persistSnapshot(gameSnapshot());

    await assert.rejects(
      repo.commitCell({
        snapshot: gameSnapshot({
          cellValues: { "0:0": "가" },
          commandSequence: 2,
        }),
        cellKey: "0:0",
        cellValue: "가",
      }),
      (error: unknown) =>
        error instanceof GameSaveRepositoryError &&
        error.code === "journal-sequence-mismatch",
    );
    await assert.rejects(
      repo.commitCell({
        snapshot: gameSnapshot({
          cellValues: { "0:0": "가", "0:1": "나" },
          commandSequence: 1,
        }),
        cellKey: "0:0",
        cellValue: "가",
      }),
      (error: unknown) =>
        error instanceof GameSaveRepositoryError &&
        error.code === "journal-delta-mismatch",
    );
    assert.equal(storage.values.has(DEFAULT_GAME_CELL_JOURNAL_KEY), false);
  });
});

describe("journal restart recovery and legacy migration", () => {
  test("canonical save 실패 뒤 journal을 재시작 시 한 번만 복구한다", async () => {
    const storage = new MemoryStorage();
    const firstRepo = repository(storage);
    await firstRepo.persistSnapshot(gameSnapshot());
    storage.failNextSaveWrite = true;

    await assert.rejects(
      firstRepo.commitCell({
        snapshot: gameSnapshot({
          cellValues: { "0:0": "가" },
          commandSequence: 1,
        }),
        cellKey: "0:0",
        cellValue: "가",
      }),
      /injected-save-write-failure/,
    );
    assert.equal(storage.values.has(DEFAULT_GAME_CELL_JOURNAL_KEY), true);

    const restartedRepo = repository(storage);
    const recovered = await restartedRepo.loadPuzzleSnapshot(identity);
    assert.equal(recovered.status, "recovered");
    assert.equal(recovered.snapshot?.cellValues["0:0"], "가");
    assert.equal(recovered.snapshot?.commandSequence, 1);
    assert.equal(storage.values.has(DEFAULT_GAME_CELL_JOURNAL_KEY), false);

    const nextRestart = await repository(storage).loadPuzzleSnapshot(identity);
    assert.equal(nextRestart.status, "restored");
    assert.equal(nextRestart.snapshot?.commandSequence, 1);
  });

  test("save ack 뒤 journal clear 실패도 다음 재시작에서 already-applied로 정리한다", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.persistSnapshot(gameSnapshot());
    storage.failNextJournalRemove = true;

    await assert.rejects(
      repo.commitCell({
        snapshot: gameSnapshot({
          cellValues: { "0:0": "가" },
          commandSequence: 1,
        }),
        cellKey: "0:0",
        cellValue: "가",
      }),
      /injected-journal-remove-failure/,
    );
    assert.equal(storage.values.has(DEFAULT_GAME_CELL_JOURNAL_KEY), true);

    const recovered = await repository(storage).loadPuzzleSnapshot(identity);
    assert.equal(recovered.status, "recovered");
    assert.equal(recovered.snapshot?.commandSequence, 1);
    assert.equal(storage.values.has(DEFAULT_GAME_CELL_JOURNAL_KEY), false);
  });

  test("malformed journal은 격리하고 마지막 정상 canonical save로 복구한다", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.persistSnapshot(gameSnapshot());
    const durableSave = storage.values.get(DEFAULT_GAME_SAVE_V2_KEY);
    storage.values.set(DEFAULT_GAME_CELL_JOURNAL_KEY, "{broken");
    storage.operations.length = 0;

    const result = await repo.loadPuzzleSnapshot(identity);
    assert.equal(result.status, "recovered");
    assert.ok(result.snapshot != null);
    assert.equal(storage.values.get(DEFAULT_GAME_SAVE_V2_KEY), durableSave);
    assert.equal(storage.values.has(DEFAULT_GAME_CELL_JOURNAL_KEY), false);
    assert.equal(
      storage.values.get(
        `${DEFAULT_GAME_CELL_JOURNAL_KEY}:quarantine:20260717T010000000Z`,
      ),
      "{broken",
    );
  });

  test("canonical checksum과 맞지 않는 stale journal도 save 대신 journal만 격리한다", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage, "2026-07-17T01:00:01.000Z");
    await repo.persistSnapshot(gameSnapshot());
    const durableSave = storage.values.get(DEFAULT_GAME_SAVE_V2_KEY);
    storage.values.set(
      DEFAULT_GAME_CELL_JOURNAL_KEY,
      JSON.stringify({
        journalVersion: 1,
        contentLocale: "ko-KR",
        puzzleId: "puzzle-1",
        contentChecksum: "content-checksum-1",
        cellKey: "0:0",
        cellValue: "가",
        commandSequence: 1,
        baseSaveChecksum: "stale-checksum",
        createdAt: "2026-07-17T01:00:00.000Z",
      }),
    );

    const result = await repo.loadPuzzleSnapshot(identity);
    assert.equal(result.status, "recovered");
    assert.equal(storage.values.get(DEFAULT_GAME_SAVE_V2_KEY), durableSave);
    assert.equal(storage.values.has(DEFAULT_GAME_CELL_JOURNAL_KEY), false);
    assert.ok(
      storage.values.has(
        `${DEFAULT_GAME_CELL_JOURNAL_KEY}:quarantine:20260717T010001000Z`,
      ),
    );
  });

  test("legacy SavedProgress 입력을 ko-KR namespace로 한 번만 이관한다", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage, "2026-07-17T02:00:00.000Z");
    const migrated = await repo.loadPuzzleSnapshot({
      ...identity,
      legacy: {
        sourceVersion: "legacy-live-v0.3.108",
        migrationChecksum: "legacy-source-checksum",
        currentEntryId: "entry-1",
        progress: {
          cellValues: { "0:0": "가" },
          earnedHintCredits: 3,
          hintCount: 2,
          revealUsed: true,
          tentativeCells: ["0:0"],
        },
      },
    });

    assert.equal(migrated.status, "migrated");
    assert.deepEqual(migrated.snapshot, {
      contentLocale: "ko-KR",
      puzzleId: "puzzle-1",
      contentChecksum: "content-checksum-1",
      currentEntryId: "entry-1",
      cellValues: { "0:0": "가" },
      earnedHintCredits: 3,
      hintCount: 2,
      revealUsed: true,
      tentativeCells: ["0:0"],
      commandSequence: 0,
      updatedAt: "2026-07-17T02:00:00.000Z",
    });

    const rawAfterMigration = storage.values.get(DEFAULT_GAME_SAVE_V2_KEY);
    assert.ok(rawAfterMigration);
    const second = await repo.loadPuzzleSnapshot({
      ...identity,
      legacy: {
        sourceVersion: "must-not-run-again",
        migrationChecksum: "different",
        progress: {
          cellValues: { "0:0": "나" },
          earnedHintCredits: 0,
          hintCount: 0,
        },
      },
    });
    assert.equal(second.status, "restored");
    assert.equal(second.snapshot?.cellValues["0:0"], "가");
    assert.equal(
      storage.values.get(DEFAULT_GAME_SAVE_V2_KEY),
      rawAfterMigration,
    );
  });
});
