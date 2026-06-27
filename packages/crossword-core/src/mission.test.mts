// mission 완료 성취/최고 기록 판정 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { getCompletionAchievements } from "./mission.ts";

describe("getCompletionAchievements", () => {
  it("힌트 0·첫 도전·정답 미공개면 노힌트·첫 도전·최고기록 모두 인정", () => {
    const result = getCompletionAchievements({
      hintCount: 0,
      attemptsUsed: 1,
      revealUsed: false,
    });
    assert.equal(result.noHint, true);
    assert.equal(result.firstTry, true);
    assert.equal(result.bestTimeEligible, true);
  });

  it("힌트를 쓰면 노힌트 배지만 무효(첫 도전·최고기록은 유지)", () => {
    const result = getCompletionAchievements({
      hintCount: 2,
      attemptsUsed: 1,
      revealUsed: false,
    });
    assert.equal(result.noHint, false);
    assert.equal(result.firstTry, true);
    assert.equal(result.bestTimeEligible, true);
  });

  it("두 번째 이상 도전이면 첫 도전 배지만 무효", () => {
    const result = getCompletionAchievements({
      hintCount: 0,
      attemptsUsed: 2,
      revealUsed: false,
    });
    assert.equal(result.noHint, true);
    assert.equal(result.firstTry, false);
    assert.equal(result.bestTimeEligible, true);
  });

  it("정답 보기로 단어를 공개하면 노힌트·첫 도전·최고기록 판정이 모두 무효", () => {
    const result = getCompletionAchievements({
      hintCount: 0,
      attemptsUsed: 1,
      revealUsed: true,
    });
    assert.equal(result.noHint, false);
    assert.equal(result.firstTry, false);
    assert.equal(result.bestTimeEligible, false);
  });

  it("정답 공개는 힌트·도전 수와 무관하게 항상 best-time 후보에서 제외", () => {
    const result = getCompletionAchievements({
      hintCount: 5,
      attemptsUsed: 3,
      revealUsed: true,
    });
    assert.equal(result.noHint, false);
    assert.equal(result.firstTry, false);
    assert.equal(result.bestTimeEligible, false);
  });
});
