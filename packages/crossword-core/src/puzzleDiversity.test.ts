import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  DEFAULT_MAX_SCAFFOLD_SIMILARITY,
  DEFAULT_MAX_SHARED_ANSWER_RATIO,
  evaluatePuzzleDiversity,
  type PuzzleDiversitySnapshot,
} from "./puzzleDiversity.ts";

function snapshot(
  puzzleId: string,
  answers: string[],
  occupiedCellKeys: string[],
): PuzzleDiversitySnapshot {
  return { puzzleId, answers, occupiedCellKeys };
}

describe("퍼즐 다양성 게이트", () => {
  const yesterday = snapshot(
    "26072500",
    [
      "가요",
      "그날",
      "그림",
      "다음날",
      "사이",
      "사이다",
      "음악가",
      "회사",
      "회사원",
    ],
    [
      "0:0",
      "0:1",
      "0:2",
      "1:0",
      "1:1",
      "1:3",
      "1:4",
      "2:1",
      "2:2",
      "2:3",
      "3:2",
      "4:2",
      "4:3",
    ],
  );

  it("정답 6/9와 골격 11/14가 겹치는 다음날 Easy 후보를 거부한다", () => {
    const today = snapshot(
      "26072600",
      [
        "그날",
        "그때",
        "다음날",
        "사이",
        "사이다",
        "음식",
        "이때",
        "회사",
        "회사원",
      ],
      [
        "0:0",
        "0:1",
        "0:2",
        "0:4",
        "1:0",
        "1:1",
        "1:3",
        "1:4",
        "2:1",
        "2:2",
        "2:3",
        "3:2",
      ],
    );

    const result = evaluatePuzzleDiversity(today, [yesterday]);

    assert.equal(result.pass, false);
    assert.equal(result.maxSharedAnswerRatio, 6 / 9);
    assert.equal(result.maxScaffoldSimilarity, 11 / 14);
    assert.ok(result.maxSharedAnswerRatio > DEFAULT_MAX_SHARED_ANSWER_RATIO);
    assert.ok(result.maxScaffoldSimilarity > DEFAULT_MAX_SCAFFOLD_SIMILARITY);
  });

  it("정답과 골격이 충분히 다른 품질 후보는 통과한다", () => {
    const diverseCandidate = snapshot(
      "next-easy",
      [
        "다음",
        "음악가",
        "그날",
        "구월",
        "다음날",
        "음악",
        "가구",
        "그때",
        "월급",
      ],
      ["0:0", "0:1", "1:1", "1:2", "2:0", "2:1", "2:2", "3:1", "4:1"],
    );

    const result = evaluatePuzzleDiversity(diverseCandidate, [yesterday]);

    assert.equal(result.pass, true);
    assert.ok(result.maxSharedAnswerRatio <= DEFAULT_MAX_SHARED_ANSWER_RATIO);
    assert.ok(result.maxScaffoldSimilarity <= DEFAULT_MAX_SCAFFOLD_SIMILARITY);
  });

  it("비교할 과거 퍼즐이 없으면 통과한다", () => {
    const result = evaluatePuzzleDiversity(
      snapshot("first", ["가게"], ["0:0", "0:1"]),
      [],
    );

    assert.deepEqual(result, {
      comparisons: [],
      maxSharedAnswerRatio: 0,
      maxScaffoldSimilarity: 0,
      pass: true,
    });
  });
});
