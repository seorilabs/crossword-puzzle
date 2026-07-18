import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  BATCH_LEGACY_SCORING_POLICY,
  LAUNCH_QUALITY_SCORING_POLICY,
  generateBoards,
  resolveGeneratorScoringPolicy,
} from "./crossword-generator-prototype.mjs";

describe("crossword generator topology", () => {
  test("allowAdjacent는 빈 셀을 교차점으로 기록하지 않는다", () => {
    const wordBank = [
      ["나마아", "첫 번째 가로 fixture"],
      ["다바자", "두 번째 가로 fixture"],
      ["가라사", "세 번째 가로 fixture"],
      ["가나", "첫 번째 세로 fixture"],
      ["라마", "두 번째 세로 fixture"],
      ["사아", "세 번째 세로 fixture"],
      ["가나다", "첫 번째 세로 완성 fixture"],
      ["라마바", "두 번째 세로 완성 fixture"],
      ["사아자", "세 번째 세로 완성 fixture"],
    ].map(([answer, clue]) => ({ answer, clue }));
    const [board] = generateBoards({
      allowAdjacent: true,
      attempts: 1,
      beamWidth: 24,
      boardSize: 3,
      branchLimit: 18,
      candidateWordLimit: 20,
      denseCandidateLimit: 96,
      maxWords: 3,
      minWordLength: 2,
      samples: 1,
      seed: 0,
      topCandidates: 48,
      wordBank,
    });

    assert.ok(board);
    assert.deepEqual(
      board.placements.map((placement) => placement.intersections),
      [[], [], []],
    );
    assert.deepEqual(
      {
        autoRunCount: board.metrics.autoRunCount,
        connectedComponents: board.metrics.connectedComponents,
        crossCells: board.metrics.crossCells,
        multiIntersectionPlacements: board.metrics.multiIntersectionPlacements,
        wordCount: board.metrics.wordCount,
      },
      {
        autoRunCount: 3,
        connectedComponents: 1,
        crossCells: 9,
        multiIntersectionPlacements: 6,
        wordCount: 6,
      },
    );
  });

  test("batch와 launch 점수 정책을 명시적으로 격리한다", () => {
    assert.equal(
      resolveGeneratorScoringPolicy(BATCH_LEGACY_SCORING_POLICY.policyId),
      BATCH_LEGACY_SCORING_POLICY,
    );
    assert.equal(
      resolveGeneratorScoringPolicy(LAUNCH_QUALITY_SCORING_POLICY.policyId),
      LAUNCH_QUALITY_SCORING_POLICY,
    );
    assert.throws(
      () => resolveGeneratorScoringPolicy("unknown-policy"),
      /Unknown generator scoring policy/,
    );

    const wordBank = [
      "나마아",
      "다바자",
      "가라사",
      "가나",
      "라마",
      "사아",
      "가나다",
      "라마바",
      "사아자",
    ].map((answer, index) => ({
      answer,
      clue: `점수 정책 fixture ${index}`,
    }));
    const baseOptions = {
      allowAdjacent: true,
      attempts: 1,
      beamWidth: 24,
      boardSize: 3,
      branchLimit: 18,
      candidateWordLimit: 20,
      denseCandidateLimit: 96,
      maxWords: 3,
      minWordLength: 2,
      samples: 1,
      seed: 0,
      topCandidates: 48,
      wordBank,
    };
    const [batchBoard] = generateBoards({
      ...baseOptions,
      scoringPolicyId: BATCH_LEGACY_SCORING_POLICY.policyId,
    });
    const [launchBoard] = generateBoards({
      ...baseOptions,
      scoringPolicyId: LAUNCH_QUALITY_SCORING_POLICY.policyId,
    });

    assert.ok(batchBoard);
    assert.ok(launchBoard);
    assert.equal(batchBoard.metrics.score, 18183);
    assert.equal(launchBoard.metrics.score, 7683);
    assert.deepEqual(batchBoard.grid, launchBoard.grid);
    assert.deepEqual(
      launchBoard.placements.map((placement) => placement.intersections),
      [[], [], []],
    );
  });

  test("기존 글자와 실제로 겹친 셀만 교차점으로 기록한다", () => {
    const answers = [
      "가나",
      "나무",
      "무지",
      "지갑",
      "갑옷",
      "옷장",
      "장미",
      "미소",
      "소금",
      "금지",
      "지도",
      "도자기",
      "기차",
      "차표",
    ];
    const [board] = generateBoards({
      allowAdjacent: false,
      attempts: 10,
      beamWidth: 24,
      boardSize: 7,
      branchLimit: 18,
      candidateWordLimit: 50,
      denseCandidateLimit: 96,
      maxWords: 8,
      minWordLength: 2,
      samples: 1,
      seed: 0,
      topCandidates: 48,
      wordBank: answers.map((answer, index) => ({
        answer,
        clue: `실제 교차 fixture ${index}`,
      })),
    });

    assert.ok(board);
    assert.deepEqual(
      board.placements.map((placement) => placement.answer),
      ["무지", "지갑", "갑옷", "나무", "옷장", "장미", "가나", "미소"],
    );
    assert.equal(board.placements[0].intersections.length, 0);
    assert.ok(
      board.placements
        .slice(1)
        .every((placement) => placement.intersections.length === 1),
    );
    for (const placement of board.placements.slice(1)) {
      for (const intersection of placement.intersections) {
        const [row, col] = intersection.split(",").map(Number);
        const sharingPlacements = board.placements.filter((candidate) =>
          candidate.cells.some((cell) => cell.row === row && cell.col === col),
        );
        assert.equal(sharingPlacements.length, 2);
      }
    }
  });
});
