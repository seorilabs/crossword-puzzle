import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { GameSnapshot } from "../../crossword-core/src/gameController.ts";
import type { GameContentV1 } from "../../crossword-core/src/gameContent.ts";
import { pickEntryForCell, projectGameSnapshot } from "./projection.ts";

function createContent(): GameContentV1 {
  return {
    schemaVersion: "game-content/1",
    contentLocale: "ko-KR",
    releaseTimeZone: "Asia/Seoul",
    languageProfile: { id: "ko-KR", version: 1 },
    puzzleId: "presentation-fixture",
    packId: "presentation-pack",
    slotId: "presentation-slot",
    grid: [
      ["가", "나"],
      ["다", ""],
    ],
    entries: [
      {
        id: "a1",
        answer: "가나",
        answerCells: ["가", "나"],
        clue: "가로 단서",
        clueSource: "manual",
        shortExplanation: "가로 단서 설명",
        source: "fixture source",
        sourceEntryId: "fixture-a1",
        sourceUrl: "https://example.com/fixture",
        licenseId: "fixture-license",
        domainTags: ["fixture"],
        direction: "across",
        row: 0,
        col: 0,
        generatedBy: "placed",
        needsManualClue: false,
      },
      {
        id: "d1",
        answer: "가다",
        answerCells: ["가", "다"],
        clue: "세로 단서",
        clueSource: "manual",
        shortExplanation: "세로 단서 설명",
        source: "fixture source",
        sourceEntryId: "fixture-d1",
        sourceUrl: "https://example.com/fixture",
        licenseId: "fixture-license",
        domainTags: ["fixture"],
        direction: "down",
        row: 0,
        col: 0,
        generatedBy: "placed",
        needsManualClue: false,
      },
    ],
    difficulty: "easy",
    themeId: "fixture-theme",
    chapterId: "fixture-chapter",
    worldTriggerSet: [{ at: 0.5 }, { at: 1 }],
    generatorCommit: "fixture-commit",
    generatorConfigHash: "fixture-config",
    contentChecksum: "fixture-checksum",
    licenseManifestId: "fixture-license",
    licenseManifestChecksum:
      "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    review: {
      reviewerId: "fixture-reviewer",
      reviewedAt: "2026-07-17T00:00:00.000Z",
      manualCoverage: 1,
    },
    minClientVersion: "0.1.0",
  };
}

function createSnapshot(patch: Partial<GameSnapshot> = {}): GameSnapshot {
  return Object.freeze({
    phase: "active",
    suspendedFrom: null,
    puzzleId: "presentation-fixture",
    contentLocale: "ko-KR",
    contentChecksum: "fixture-checksum",
    languageProfileId: "ko-KR",
    languageProfileVersion: 1,
    selectedEntryId: "a1",
    cellValues: Object.freeze({ "0:0": "가", "0:1": "나" }),
    completedEntryIds: Object.freeze(["a1"]),
    lastResolvedEntryIds: Object.freeze([]),
    commandSequence: 2,
    lastError: null,
    ...patch,
  });
}

describe("Phaser immutable snapshot projection", () => {
  test("정답 grid를 노출하지 않고 snapshot 셀과 선택·완료 path만 투영한다", () => {
    const presentation = projectGameSnapshot(createContent(), createSnapshot());

    assert.equal(presentation.board.cells.length, 3);
    assert.deepEqual(
      presentation.board.cells.map((cell) => cell.value),
      ["가", "나", null],
    );
    assert.equal(presentation.board.paths[0]?.selected, true);
    assert.equal(presentation.board.paths[0]?.completed, true);
    assert.equal(presentation.board.paths[1]?.completed, false);
    assert.equal(presentation.world.progress, 0.5);
    assert.equal(Object.isFrozen(presentation), true);
    assert.equal(Object.isFrozen(presentation.board.cells), true);
  });

  test("단어·교차 연쇄·보드 완료 effect는 phase와 command sequence로 결정한다", () => {
    const content = createContent();
    const word = projectGameSnapshot(
      content,
      createSnapshot({
        phase: "word-resolved",
        lastResolvedEntryIds: Object.freeze(["a1"]),
        commandSequence: 3,
      }),
    );
    const chain = projectGameSnapshot(
      content,
      createSnapshot({
        phase: "word-resolved",
        lastResolvedEntryIds: Object.freeze(["a1", "d1"]),
        commandSequence: 4,
      }),
    );
    const board = projectGameSnapshot(
      content,
      createSnapshot({
        phase: "board-resolved",
        completedEntryIds: Object.freeze(["a1", "d1"]),
        commandSequence: 5,
      }),
    );

    assert.equal(word.effect.kind, "word");
    assert.equal(chain.effect.kind, "chain");
    assert.equal(board.effect.kind, "board");
    assert.equal(board.world.stage, "restored");
    assert.equal(board.world.restoredLandmarks, board.world.totalLandmarks);
  });

  test("선택·완료·방금 해결 상태를 색상과 독립된 scene 표식 입력으로 보존한다", () => {
    const presentation = projectGameSnapshot(
      createContent(),
      createSnapshot({
        phase: "word-resolved",
        lastResolvedEntryIds: Object.freeze(["a1", "d1"]),
        completedEntryIds: Object.freeze(["a1", "d1"]),
        commandSequence: 3,
      }),
    );
    const crossing = presentation.board.cells.find(
      (cell) => cell.key === "0:0",
    );

    assert.ok(crossing);
    assert.equal(crossing.selected, true);
    assert.equal(crossing.completed, true);
    assert.equal(crossing.justResolved, true);
    assert.deepEqual(
      presentation.board.paths.map((path) => ({
        completed: path.completed,
        justResolved: path.justResolved,
        selected: path.selected,
      })),
      [
        { completed: true, justResolved: true, selected: true },
        { completed: true, justResolved: true, selected: false },
      ],
    );
  });

  test("교차 셀을 다시 누르면 현재 단어의 반대 방향으로 순환한다", () => {
    const crossing = projectGameSnapshot(
      createContent(),
      createSnapshot(),
    ).board.cells.find((cell) => cell.key === "0:0");

    assert.ok(crossing);
    assert.equal(pickEntryForCell(crossing, "a1"), "d1");
    assert.equal(pickEntryForCell(crossing, "d1"), "a1");
    assert.equal(pickEntryForCell(crossing, null), "a1");
  });

  test("다른 puzzle/checksum/locale snapshot은 fail-closed 처리한다", () => {
    const content = createContent();
    assert.throws(
      () =>
        projectGameSnapshot(
          content,
          createSnapshot({ contentChecksum: "wrong-checksum" }),
        ),
      /does not match game content identity/,
    );
    assert.throws(
      () =>
        projectGameSnapshot(
          content,
          createSnapshot({ languageProfileVersion: 2 }),
        ),
      /does not match game content identity/,
    );
  });
});
