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

  test("malformed journal은 save를 건드리지 않고 fail-closed 처리한다", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.persistSnapshot(gameSnapshot());
    const durableSave = storage.values.get(DEFAULT_GAME_SAVE_V2_KEY);
    storage.values.set(DEFAULT_GAME_CELL_JOURNAL_KEY, "{broken");
    storage.operations.length = 0;

    assert.deepEqual(await repo.loadPuzzleSnapshot(identity), {
      status: "invalid-journal",
      snapshot: null,
    });
    assert.equal(storage.values.get(DEFAULT_GAME_SAVE_V2_KEY), durableSave);
    assert.equal(storage.values.has(DEFAULT_GAME_CELL_JOURNAL_KEY), true);
    assert.equal(
      storage.operations.some(
        (operation) =>
          operation.startsWith("set:") || operation.startsWith("remove:"),
      ),
      false,
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
