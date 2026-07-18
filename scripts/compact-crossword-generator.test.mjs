import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  BATCH_LEGACY_SCORING_POLICY,
  LAUNCH_QUALITY_SCORING_POLICY,
  analyzeRuns,
  makeWordMap,
} from "./crossword-generator-prototype.mjs";
import {
  LAUNCH_COMPACT_FALLBACK_POLICY,
  generateCompactLaunchBoard,
} from "./compact-crossword-generator.mjs";

const THEME_ID = "living-world";
const COMPACT_WORDS = [
  "관상수",
  "목숨",
  "수목원",
  "추위",
  "치어",
  "목걸이",
  "주관적",
  "어린이",
  "위치",
  "목적",
].map((answer, index) => ({
  answer,
  clue: `compact fixture ${index}`,
  themeOwner: index < 5 ? THEME_ID : null,
}));

function generateFixture(
  scoringPolicyId = LAUNCH_QUALITY_SCORING_POLICY.policyId,
) {
  const wordMap = makeWordMap(COMPACT_WORDS);
  return generateCompactLaunchBoard({
    acceptRuns: () => true,
    boardSize: 8,
    compactMinimumBboxDensity: 0.5,
    compactMinimumCrossRatio: 0.55,
    compactMinimumMultiIntersectionRunRatio: 0.65,
    compactMinimumWordCount: 10,
    evaluateBoardQuality: (board) => {
      const runs = analyzeRuns(board, wordMap).runs;
      const preferredRunRatio =
        runs.filter((run) => wordMap.get(run.answer)?.themeOwner === THEME_ID)
          .length / runs.length;
      const multiIntersectionRunRatio =
        board.metrics.multiIntersectionPlacements / board.metrics.wordCount;
      return {
        pass:
          board.metrics.wordCount >= 10 &&
          board.metrics.crossRatio >= 0.55 &&
          board.metrics.bboxDensity >= 0.5 &&
          multiIntersectionRunRatio >= 0.65 &&
          preferredRunRatio >= 0.5,
      };
    },
    isPreferredRun: (run) => wordMap.get(run.answer)?.themeOwner === THEME_ID,
    maxWords: 10,
    minPreferredRunRatio: 0.5,
    minWordLength: 2,
    scoringPolicyId,
    wordBank: COMPACT_WORDS,
  });
}

describe("launch compact crossword fallback", () => {
  test("실제 10단어 구조를 품질 기준을 낮추지 않고 결정적으로 압축한다", () => {
    const first = generateFixture();
    const second = generateFixture();

    assert.ok(first.board);
    assert.deepEqual(first, second);
    assert.equal(first.trace.policyId, LAUNCH_COMPACT_FALLBACK_POLICY.policyId);
    assert.equal(first.trace.termination, "pass");
    assert.ok(first.trace.nodeCount <= first.trace.maxNodeCount);
    assert.deepEqual(
      {
        autoRunCount: first.board.metrics.autoRunCount,
        bboxArea: first.board.metrics.bboxArea,
        bboxDensity: first.board.metrics.bboxDensity,
        connectedComponents: first.board.metrics.connectedComponents,
        crossRatio: first.board.metrics.crossRatio,
        multiIntersectionPlacements:
          first.board.metrics.multiIntersectionPlacements,
        wordCount: first.board.metrics.wordCount,
      },
      {
        autoRunCount: 0,
        bboxArea: 30,
        bboxDensity: 0.533,
        connectedComponents: 1,
        crossRatio: 0.563,
        multiIntersectionPlacements: 8,
        wordCount: 10,
      },
    );
    assert.deepEqual(first.trace.selectedAnswers, [
      "관상수",
      "목걸이",
      "목숨",
      "목적",
      "수목원",
      "어린이",
      "위치",
      "주관적",
      "추위",
      "치어",
    ]);
  });

  test("2시간 배치 legacy 점수 정책에는 진입하지 않는다", () => {
    assert.throws(
      () => generateFixture(BATCH_LEGACY_SCORING_POLICY.policyId),
      /requires the launch scoring policy/,
    );
  });
});
