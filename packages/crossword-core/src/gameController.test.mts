import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createInitialGameSnapshot, GameController } from "./gameController.ts";
import type { GameContentV1 } from "./gameContent.ts";
import { koKrLanguageProfile } from "./languageProfile.ts";

function createContent(): GameContentV1 {
  return {
    schemaVersion: "game-content/1",
    contentLocale: "ko-KR",
    releaseTimeZone: "Asia/Seoul",
    languageProfile: { id: "ko-KR", version: 1 },
    puzzleId: "controller-fixture",
    packId: "fixture-pack",
    slotId: "fixture-slot",
    grid: [
      ["가", "나"],
      ["다", ""],
    ],
    entries: [
      {
        id: "a1",
        answer: "가나",
        answerCells: ["가", "나"],
        clue: "fixture across",
        clueSource: "manual",
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
        clue: "fixture down",
        clueSource: "manual",
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
    worldTriggerSet: [],
    generatorCommit: "fixture-commit",
    generatorConfigHash: "fixture-config",
    contentChecksum: "fixture-content-checksum",
    licenseManifestId: "fixture-license",
    review: {
      reviewerId: "fixture-reviewer",
      reviewedAt: "2026-07-17T00:00:00.000Z",
      manualCoverage: 1,
    },
    minClientVersion: "0.1.0",
  };
}

describe("GameController single-writer state machine", () => {
  test("intro부터 단어·교차·보드·결과·지도까지 결정적으로 진행한다", () => {
    const controller = new GameController({
      content: createContent(),
      profile: koKrLanguageProfile,
    });

    assert.equal(controller.getSnapshot().phase, "intro");
    assert.equal(controller.getSnapshot().selectedEntryId, "a1");

    controller.dispatch({ type: "intro.complete" });
    const firstWord = controller.dispatch({
      type: "input.commit",
      entryId: "a1",
      cells: ["가", "나"],
    });
    assert.equal(firstWord.snapshot.phase, "word-resolved");
    assert.deepEqual(firstWord.snapshot.completedEntryIds, ["a1"]);
    assert.deepEqual(firstWord.snapshot.cellValues, {
      "0:0": "가",
      "0:1": "나",
    });

    const active = controller.dispatch({ type: "resolution.complete" });
    assert.equal(active.snapshot.phase, "active");
    assert.equal(active.snapshot.selectedEntryId, "d1");

    const finalWord = controller.dispatch({
      type: "input.commit",
      entryId: "d1",
      cells: ["가", "다"],
    });
    assert.equal(finalWord.snapshot.phase, "word-resolved");
    assert.deepEqual(finalWord.snapshot.completedEntryIds, ["a1", "d1"]);

    assert.equal(
      controller.dispatch({ type: "resolution.complete" }).snapshot.phase,
      "board-resolved",
    );
    assert.equal(
      controller.dispatch({ type: "board.presentation.complete" }).snapshot
        .phase,
      "result",
    );
    assert.equal(
      controller.dispatch({ type: "result.continue" }).snapshot.phase,
      "map",
    );

    const replay = controller.dispatch({ type: "map.replay" });
    assert.equal(replay.snapshot.phase, "active");
    assert.deepEqual(replay.snapshot.cellValues, {});
    assert.deepEqual(replay.snapshot.completedEntryIds, []);
    assert.equal(replay.snapshot.selectedEntryId, "a1");
    assert.deepEqual(replay.events, [
      {
        type: "game.board.replay.started",
        commandSequence: replay.snapshot.commandSequence,
      },
    ]);
  });

  test("지도 밖에서는 replay 명령을 거부해 진행을 지우지 않는다", () => {
    const controller = new GameController({
      content: createContent(),
      profile: koKrLanguageProfile,
    });
    controller.dispatch({ type: "intro.complete" });
    controller.dispatch({
      type: "input.commit",
      entryId: "a1",
      cells: ["가", "나"],
    });

    const before = controller.getSnapshot();
    const rejected = controller.dispatch({ type: "map.replay" });
    assert.equal(rejected.snapshot.lastError, "invalid-transition");
    assert.deepEqual(rejected.snapshot.cellValues, before.cellValues);
    assert.deepEqual(
      rejected.snapshot.completedEntryIds,
      before.completedEntryIds,
    );
  });

  test("IME 조합 중 미완성 자모는 commit하지 않고 오류 상태만 남긴다", () => {
    const controller = new GameController({
      content: createContent(),
      profile: koKrLanguageProfile,
    });
    controller.dispatch({ type: "intro.complete" });
    controller.dispatch({ type: "composition.start" });

    const rejected = controller.dispatch({
      type: "input.commit",
      entryId: "a1",
      cells: ["ㄱ"],
    });
    assert.equal(rejected.snapshot.phase, "composing");
    assert.equal(rejected.snapshot.lastError, "invalid-committed-cell");
    assert.deepEqual(rejected.snapshot.cellValues, {});
  });

  test("완료된 교차 글자를 다른 값으로 덮어쓰지 못한다", () => {
    const controller = new GameController({
      content: createContent(),
      profile: koKrLanguageProfile,
    });
    controller.dispatch({ type: "intro.complete" });
    controller.dispatch({
      type: "input.commit",
      entryId: "a1",
      cells: ["가", "나"],
    });
    controller.dispatch({ type: "resolution.complete" });

    const rejected = controller.dispatch({
      type: "input.commit",
      entryId: "d1",
      cells: ["마", "다"],
    });
    assert.equal(
      rejected.snapshot.lastError,
      "input-conflicts-with-completed-word",
    );
    assert.equal(rejected.snapshot.cellValues["0:0"], "가");
  });

  test("background 복귀 시 composing draft는 판정하지 않고 active로 복원한다", () => {
    const controller = new GameController({
      content: createContent(),
      profile: koKrLanguageProfile,
    });
    controller.dispatch({ type: "intro.complete" });
    controller.dispatch({ type: "composition.start" });
    assert.equal(
      controller.dispatch({ type: "app.suspend" }).snapshot.phase,
      "suspended",
    );
    assert.equal(
      controller.dispatch({ type: "app.resume" }).snapshot.phase,
      "active",
    );
  });

  test("snapshot과 event 구독은 외부에서 상태를 직접 변경할 수 없다", () => {
    const controller = new GameController({
      content: createContent(),
      profile: koKrLanguageProfile,
    });
    const calls: string[] = [];
    const unsubscribe = controller.subscribe((snapshot, events) => {
      calls.push(`${snapshot.phase}:${events[0]?.type ?? "none"}`);
    });

    controller.dispatch({ type: "intro.complete" });
    unsubscribe();
    controller.dispatch({ type: "composition.start" });

    assert.deepEqual(calls, ["active:game.intro.completed"]);
    assert.equal(Object.isFrozen(controller.getSnapshot()), true);
    assert.equal(Object.isFrozen(controller.getSnapshot().cellValues), true);
  });

  test("recovery 실패는 검증된 번들 콘텐츠의 빈 active 상태로 복귀한다", () => {
    const content = createContent();
    const recoverySnapshot = {
      ...createInitialGameSnapshot(content),
      phase: "recovery" as const,
      cellValues: { "0:0": "가" },
    };
    const controller = new GameController({
      content,
      profile: koKrLanguageProfile,
      initialSnapshot: recoverySnapshot,
    });

    const result = controller.dispatch({ type: "recovery.fail" });

    assert.equal(result.snapshot.phase, "active");
    assert.deepEqual(result.snapshot.cellValues, {});
    assert.deepEqual(result.events, [
      {
        type: "game.recovery.fallback",
        commandSequence: 1,
      },
    ]);
  });

  test("initial snapshot의 콘텐츠 정체성과 셀 범위를 검증하고 외부 객체를 복제한다", () => {
    const content = createContent();
    const initial = {
      ...createInitialGameSnapshot(content),
      phase: "active" as const,
      cellValues: { "0:0": "가" },
    };
    const controller = new GameController({
      content,
      profile: koKrLanguageProfile,
      initialSnapshot: initial,
    });
    initial.cellValues["0:0"] = "마";

    assert.equal(controller.getSnapshot().cellValues["0:0"], "가");
    assert.throws(
      () =>
        new GameController({
          content,
          profile: koKrLanguageProfile,
          initialSnapshot: {
            ...createInitialGameSnapshot(content),
            contentChecksum: "foreign-content",
          },
        }),
      /does not match content/,
    );
    assert.throws(
      () =>
        new GameController({
          content,
          profile: koKrLanguageProfile,
          initialSnapshot: {
            ...createInitialGameSnapshot(content),
            cellValues: { "99:99": "가" },
          },
        }),
      /invalid cell value/,
    );
  });
});
