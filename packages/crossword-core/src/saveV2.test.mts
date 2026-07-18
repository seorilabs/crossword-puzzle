import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  applyCellCommitJournal,
  canonicalizeForChecksum,
  compareCanonicalStrings,
  createCellCommitJournal,
  getCanonicalSavePayload,
  migrateLegacyProgressToSaveV2,
  projectLegacyProgress,
  sealSaveV2,
  validateSaveV2Namespaces,
  verifySaveV2Checksum,
  type SaveChecksumPort,
} from "./saveV2.ts";

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

function createMigrationInput() {
  return {
    uiLocale: "ko-KR",
    contentLocale: "ko-KR",
    inputMode: "box",
    migratedAt: "2026-07-17T00:00:00.000Z",
    sourceVersion: "legacy-main",
    migrationChecksum: "legacy-fixture-checksum",
    progressByPuzzleId: {
      "puzzle-1": {
        cellValues: { "0:0": "가" },
        earnedHintCredits: 2,
        hintCount: 1,
        revealUsed: true,
        tentativeCells: ["0:0"],
      },
    },
    contentChecksumByPuzzleId: {
      "puzzle-1": "content-fixture-checksum",
    },
    currentEntryIdByPuzzleId: {
      "puzzle-1": "a1",
    },
  };
}

describe("Save v2 migration and checksum", () => {
  test("legacy progress를 ko-KR namespace로만 결정적으로 이관한다", () => {
    const first = migrateLegacyProgressToSaveV2(createMigrationInput());
    const second = migrateLegacyProgressToSaveV2(createMigrationInput());

    assert.deepEqual(first, second);
    assert.deepEqual(
      projectLegacyProgress(first, "ko-KR", "puzzle-1"),
      createMigrationInput().progressByPuzzleId["puzzle-1"],
    );
    assert.equal(projectLegacyProgress(first, "future-X", "puzzle-1"), null);
    assert.deepEqual(validateSaveV2Namespaces(first), []);
  });

  test("legacy content checksum을 해석할 수 없으면 unknown identity를 만들지 않는다", () => {
    const input = createMigrationInput();
    assert.throws(
      () =>
        migrateLegacyProgressToSaveV2({
          ...input,
          contentChecksumByPuzzleId: {},
        }),
      /Missing content checksum/,
    );
  });

  test("canonical payload는 object key 순서와 무관하다", () => {
    const save = migrateLegacyProgressToSaveV2(createMigrationInput());
    const reordered = {
      ...save,
      profile: {
        inputMode: save.profile.inputMode,
        activeContentLocale: save.profile.activeContentLocale,
        uiLocale: save.profile.uiLocale,
        settings: save.profile.settings,
        accessibility: save.profile.accessibility,
      },
    };

    assert.equal(
      getCanonicalSavePayload(save),
      getCanonicalSavePayload(reordered),
    );
  });

  test("Unicode key 정렬은 OS locale과 무관한 UTF-16 순서를 고정한다", () => {
    const keys = ["가", "ä", "z", "a"];
    assert.deepEqual([...keys].sort(compareCanonicalStrings), [
      "a",
      "z",
      "ä",
      "가",
    ]);
    assert.equal(
      canonicalizeForChecksum({ 가: 4, ä: 3, z: 2, a: 1 }),
      '{"a":1,"z":2,"ä":3,"가":4}',
    );
  });

  test("seal한 저장은 변조 전만 checksum 검증을 통과한다", async () => {
    const sealed = await sealSaveV2(
      migrateLegacyProgressToSaveV2(createMigrationInput()),
      checksumPort,
    );
    assert.equal(await verifySaveV2Checksum(sealed, checksumPort), true);

    const tampered = {
      ...sealed,
      profile: { ...sealed.profile, uiLocale: "future-X" },
    };
    assert.equal(await verifySaveV2Checksum(tampered, checksumPort), false);
  });
});

describe("compact emergency cell journal", () => {
  test("base checksum과 command sequence가 맞을 때 한 번만 적용한다", async () => {
    const sealed = await sealSaveV2(
      migrateLegacyProgressToSaveV2(createMigrationInput()),
      checksumPort,
    );
    const journal = createCellCommitJournal({
      contentLocale: "ko-KR",
      puzzleId: "puzzle-1",
      contentChecksum: "content-fixture-checksum",
      cellKey: "0:1",
      cellValue: "나",
      commandSequence: 1,
      baseSaveChecksum: sealed.checksum,
      createdAt: "2026-07-17T00:00:01.000Z",
    });

    const applied = await applyCellCommitJournal(sealed, journal, checksumPort);
    assert.equal(applied.status, "applied");
    assert.equal(
      applied.save.content["ko-KR"].puzzles["puzzle-1"].cellValues["0:1"],
      "나",
    );
    assert.equal(await verifySaveV2Checksum(applied.save, checksumPort), true);

    const replayed = await applyCellCommitJournal(
      applied.save,
      journal,
      checksumPort,
    );
    assert.equal(replayed.status, "already-applied");
    assert.deepEqual(replayed.save, applied.save);
  });

  test("locale·content checksum·base checksum 불일치를 명시적으로 거부한다", async () => {
    const sealed = await sealSaveV2(
      migrateLegacyProgressToSaveV2(createMigrationInput()),
      checksumPort,
    );
    const baseJournal = {
      contentLocale: "ko-KR",
      puzzleId: "puzzle-1",
      contentChecksum: "content-fixture-checksum",
      cellKey: "0:1",
      cellValue: "나",
      commandSequence: 1,
      baseSaveChecksum: sealed.checksum,
      createdAt: "2026-07-17T00:00:01.000Z",
    } as const;

    const localeMismatch = await applyCellCommitJournal(
      sealed,
      createCellCommitJournal({ ...baseJournal, contentLocale: "future-X" }),
      checksumPort,
    );
    const contentMismatch = await applyCellCommitJournal(
      sealed,
      createCellCommitJournal({
        ...baseJournal,
        contentChecksum: "wrong-content",
      }),
      checksumPort,
    );
    const baseMismatch = await applyCellCommitJournal(
      sealed,
      createCellCommitJournal({
        ...baseJournal,
        baseSaveChecksum: "wrong-save",
      }),
      checksumPort,
    );

    assert.equal(localeMismatch.status, "rejected");
    assert.equal(contentMismatch.status, "rejected");
    assert.equal(baseMismatch.status, "rejected");
  });

  test("같은 sequence·셀 값이어도 다른 content checksum journal은 replay로 승인하지 않는다", async () => {
    const sealed = await sealSaveV2(
      migrateLegacyProgressToSaveV2(createMigrationInput()),
      checksumPort,
    );
    const journal = createCellCommitJournal({
      contentLocale: "ko-KR",
      puzzleId: "puzzle-1",
      contentChecksum: "content-fixture-checksum",
      cellKey: "0:1",
      cellValue: "나",
      commandSequence: 1,
      baseSaveChecksum: sealed.checksum,
      createdAt: "2026-07-17T00:00:01.000Z",
    });
    const applied = await applyCellCommitJournal(sealed, journal, checksumPort);
    assert.equal(applied.status, "applied");

    const foreignContentReplay = await applyCellCommitJournal(
      applied.save,
      createCellCommitJournal({
        ...journal,
        contentChecksum: "different-content-checksum",
      }),
      checksumPort,
    );

    assert.deepEqual(foreignContentReplay, {
      status: "rejected",
      reason: "content-checksum-mismatch",
      save: applied.save,
    });
  });
});
