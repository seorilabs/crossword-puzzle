import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { GameController } from "./gameController.ts";
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
    controller.dispatch({ type: "input.commit", entryId: "a1", cells: ["가", "나"] });
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
});
