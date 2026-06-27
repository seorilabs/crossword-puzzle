// 난이도 티어 프로파일/워드뱅크 필터 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  DIFFICULTY_ORDER,
  DIFFICULTY_PROFILES,
  filterWordsByDifficulty,
  getWordDifficulty,
  isDifficulty,
  resolveDifficultyProfile,
  summarizeWordDifficulties,
} from "./difficultyProfiles.ts";

describe("resolveDifficultyProfile", () => {
  it("유효한 난이도는 해당 프로파일을 반환한다", () => {
    assert.equal(resolveDifficultyProfile("easy").difficulty, "easy");
    assert.equal(resolveDifficultyProfile("normal").difficulty, "normal");
    assert.equal(resolveDifficultyProfile("hard").difficulty, "hard");
  });

  it("알 수 없는 값은 normal 프로파일로 폴백한다", () => {
    assert.equal(resolveDifficultyProfile(undefined).difficulty, "normal");
    assert.equal(resolveDifficultyProfile(null).difficulty, "normal");
    assert.equal(resolveDifficultyProfile("insane").difficulty, "normal");
  });
});

describe("isDifficulty", () => {
  it("easy/normal/hard 만 true", () => {
    assert.equal(isDifficulty("easy"), true);
    assert.equal(isDifficulty("normal"), true);
    assert.equal(isDifficulty("hard"), true);
    assert.equal(isDifficulty("medium"), false);
    assert.equal(isDifficulty(undefined), false);
    assert.equal(isDifficulty(2), false);
  });
});

describe("DIFFICULTY_PROFILES 단조성", () => {
  it("easy < normal < hard 로 boardSize 가 증가한다", () => {
    assert.ok(
      DIFFICULTY_PROFILES.easy.boardSize < DIFFICULTY_PROFILES.normal.boardSize,
    );
    assert.ok(
      DIFFICULTY_PROFILES.normal.boardSize < DIFFICULTY_PROFILES.hard.boardSize,
    );
  });

  it("easy < normal < hard 로 maxWords 가 증가한다", () => {
    assert.ok(
      DIFFICULTY_PROFILES.easy.maxWords < DIFFICULTY_PROFILES.normal.maxWords,
    );
    assert.ok(
      DIFFICULTY_PROFILES.normal.maxWords < DIFFICULTY_PROFILES.hard.maxWords,
    );
  });

  it("easy < normal < hard 로 minWordCount(단어 수 하한)가 증가한다", () => {
    assert.ok(
      DIFFICULTY_PROFILES.easy.minWordCount <
        DIFFICULTY_PROFILES.normal.minWordCount,
    );
    assert.ok(
      DIFFICULTY_PROFILES.normal.minWordCount <
        DIFFICULTY_PROFILES.hard.minWordCount,
    );
  });

  it("normal 프로파일은 기존 기본 생성값과 동일하다(회귀 방지)", () => {
    assert.equal(DIFFICULTY_PROFILES.normal.boardSize, 8);
    assert.equal(DIFFICULTY_PROFILES.normal.maxWords, 12);
    assert.equal(DIFFICULTY_PROFILES.normal.minWordLength, 2);
    assert.equal(DIFFICULTY_PROFILES.normal.minWordCount, 12);
  });

  it("DIFFICULTY_ORDER 는 easy→normal→hard 순이다", () => {
    assert.deepEqual([...DIFFICULTY_ORDER], ["easy", "normal", "hard"]);
  });
});

describe("getWordDifficulty", () => {
  it("정상 difficulty 는 그대로, 없거나 비정상이면 normal", () => {
    assert.equal(getWordDifficulty({ difficulty: "easy" }), "easy");
    assert.equal(getWordDifficulty({ difficulty: "hard" }), "hard");
    assert.equal(getWordDifficulty({ difficulty: null }), "normal");
    assert.equal(getWordDifficulty({ difficulty: "??" }), "normal");
    assert.equal(getWordDifficulty({}), "normal");
  });
});

describe("filterWordsByDifficulty", () => {
  const words = [
    { answer: "가게", difficulty: "easy" },
    { answer: "평면", difficulty: "normal" },
    { answer: "정정", difficulty: "hard" },
    { answer: "미상", difficulty: null },
  ];

  it("easy 프로파일은 easy 단어로 편향된다", () => {
    const result = filterWordsByDifficulty(words, DIFFICULTY_PROFILES.easy);
    assert.deepEqual(
      result.map((word) => word.answer),
      ["가게"],
    );
  });

  it("hard 프로파일은 easy 단어를 제외한다", () => {
    const result = filterWordsByDifficulty(words, DIFFICULTY_PROFILES.hard);
    const answers = result.map((word) => word.answer).sort();
    // normal(평면)·hard(정정)·difficulty 미상(normal 취급, 미상) 포함, easy(가게) 제외
    assert.deepEqual(answers, ["미상", "정정", "평면"]);
  });

  it("normal 프로파일은 모든 단어를 허용한다", () => {
    const result = filterWordsByDifficulty(words, DIFFICULTY_PROFILES.normal);
    assert.equal(result.length, words.length);
  });
});

describe("summarizeWordDifficulties", () => {
  it("difficulty 분포를 집계한다(미상은 normal 로 계수)", () => {
    const counts = summarizeWordDifficulties([
      { difficulty: "easy" },
      { difficulty: "easy" },
      { difficulty: "normal" },
      { difficulty: "hard" },
      { difficulty: null },
    ]);
    assert.deepEqual(counts, { easy: 2, normal: 2, hard: 1 });
  });
});
