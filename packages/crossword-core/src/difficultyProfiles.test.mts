// 난이도 티어 프로파일 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  DIFFICULTY_ORDER,
  DIFFICULTY_PROFILES,
  isDifficulty,
  resolveDifficultyProfile,
} from "./difficultyProfiles.ts";

describe("resolveDifficultyProfile", () => {
  it("유효한 난이도는 해당 프로파일을 반환한다", () => {
    assert.equal(resolveDifficultyProfile("easy").difficulty, "easy");
    assert.equal(resolveDifficultyProfile("hard").difficulty, "hard");
  });

  it("알 수 없는 값은 가벼운 쪽(easy)으로 폴백한다", () => {
    assert.equal(resolveDifficultyProfile(undefined).difficulty, "easy");
    assert.equal(resolveDifficultyProfile(null).difficulty, "easy");
    assert.equal(resolveDifficultyProfile("insane").difficulty, "easy");
  });

  it("폐지된 normal 도 폴백 대상이다", () => {
    assert.equal(resolveDifficultyProfile("normal").difficulty, "easy");
  });
});

describe("isDifficulty", () => {
  it("easy/hard 만 true", () => {
    assert.equal(isDifficulty("easy"), true);
    assert.equal(isDifficulty("hard"), true);
    assert.equal(isDifficulty("normal"), false);
    assert.equal(isDifficulty("medium"), false);
    assert.equal(isDifficulty(undefined), false);
    assert.equal(isDifficulty(2), false);
  });
});

describe("난이도 티어 구성", () => {
  it("쉬움/어려움 두 단계만 제공한다", () => {
    assert.deepEqual(Object.keys(DIFFICULTY_PROFILES).sort(), ["easy", "hard"]);
    assert.deepEqual([...DIFFICULTY_ORDER], ["easy", "hard"]);
  });

  it("어떤 티어도 어휘를 제한하지 않는다(난이도는 개수로만 가른다)", () => {
    for (const difficulty of DIFFICULTY_ORDER) {
      assert.equal(
        "wordDifficulties" in DIFFICULTY_PROFILES[difficulty],
        false,
        `${difficulty} 는 어휘 등급을 선택하지 않아야 한다`,
      );
    }
  });
});

describe("DIFFICULTY_PROFILES 단조성", () => {
  it("easy는 5×5, hard는 8×8로 제공한다", () => {
    assert.equal(DIFFICULTY_PROFILES.easy.boardSize, 5);
    assert.equal(DIFFICULTY_PROFILES.hard.boardSize, 8);
    assert.ok(
      DIFFICULTY_PROFILES.easy.boardSize < DIFFICULTY_PROFILES.hard.boardSize,
    );
  });

  it("배치 단어 수는 easy < hard 로 증가한다", () => {
    assert.ok(
      DIFFICULTY_PROFILES.easy.maxWords < DIFFICULTY_PROFILES.hard.maxWords,
    );
    assert.ok(
      DIFFICULTY_PROFILES.easy.minWordCount <
        DIFFICULTY_PROFILES.hard.minWordCount,
    );
  });

  it("최소 글자 수는 두 티어가 동일하다(정책 일관성)", () => {
    assert.equal(
      DIFFICULTY_PROFILES.easy.minWordLength,
      DIFFICULTY_PROFILES.hard.minWordLength,
    );
    assert.equal(DIFFICULTY_PROFILES.easy.minWordLength, 2);
  });

  it("easy/hard 모두 교차율·밀도 임계값이 숫자로 정의되어 있다", () => {
    for (const difficulty of DIFFICULTY_ORDER) {
      const profile = DIFFICULTY_PROFILES[difficulty];
      assert.equal(
        typeof profile.minCrossRatio,
        "number",
        `${difficulty} minCrossRatio`,
      );
      assert.equal(
        typeof profile.minBboxDensity,
        "number",
        `${difficulty} minBboxDensity`,
      );
    }
  });

  it("교차율·밀도는 easy 가 hard 이상이다(easy 더 촘촘, hard 완화)", () => {
    assert.ok(
      DIFFICULTY_PROFILES.easy.minCrossRatio >=
        DIFFICULTY_PROFILES.hard.minCrossRatio,
    );
    assert.ok(
      DIFFICULTY_PROFILES.easy.minBboxDensity >=
        DIFFICULTY_PROFILES.hard.minBboxDensity,
    );
  });
});

describe("DIFFICULTY_PROFILES hard 점프 완화 (#154)", () => {
  it("hard 프로파일은 8×8 생성 검증을 통과한 값으로 고정한다", () => {
    assert.equal(DIFFICULTY_PROFILES.hard.boardSize, 8);
    assert.equal(DIFFICULTY_PROFILES.hard.maxWords, 11);
    assert.equal(DIFFICULTY_PROFILES.hard.minWordCount, 12);
  });
});
