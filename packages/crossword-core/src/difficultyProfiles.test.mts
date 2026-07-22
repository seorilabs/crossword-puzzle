// 난이도 티어 프로파일/워드뱅크 필터 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  DIFFICULTY_ORDER,
  DIFFICULTY_PROFILES,
  MIN_GENERATION_WORD_POOL,
  ONBOARDING_MEDIUM_PROFILE,
  filterWordsByDifficulty,
  getWordDifficulty,
  isDifficulty,
  resolveDifficultyProfile,
  selectWordsForProfile,
  summarizeWordDifficulties,
} from "./difficultyProfiles.ts";

function makeWords(difficulty: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    answer: `${difficulty}${index}`,
    difficulty,
  }));
}

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

  it("normal 프로파일은 완료 시간 단축을 위해 단어 수를 낮춘 값으로 고정한다(회귀 방지)", () => {
    // 첫 완료 소요(~10분) 단축을 위해 maxWords/minWordCount 를 12→10 으로 낮췄다.
    // 보드 크기는 easy(7)와의 단조성을 위해 8로 유지한다.
    assert.equal(DIFFICULTY_PROFILES.normal.boardSize, 8);
    assert.equal(DIFFICULTY_PROFILES.normal.maxWords, 10);
    assert.equal(DIFFICULTY_PROFILES.normal.minWordLength, 2);
    assert.equal(DIFFICULTY_PROFILES.normal.minWordCount, 10);
  });

  it("normal 의 교차율·밀도가 기존 전역 기본값(0.55/0.5)과 동일하다(회귀 방지)", () => {
    assert.equal(DIFFICULTY_PROFILES.normal.minCrossRatio, 0.55);
    assert.equal(DIFFICULTY_PROFILES.normal.minBboxDensity, 0.5);
  });

  it("easy/normal/hard 모두 교차율·밀도 임계값이 숫자로 정의되어 있다", () => {
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

  it("교차율은 easy ≥ normal ≥ hard(easy 더 촘촘, hard 완화)", () => {
    assert.ok(
      DIFFICULTY_PROFILES.easy.minCrossRatio >=
        DIFFICULTY_PROFILES.normal.minCrossRatio,
    );
    assert.ok(
      DIFFICULTY_PROFILES.normal.minCrossRatio >=
        DIFFICULTY_PROFILES.hard.minCrossRatio,
    );
  });

  it("밀도는 hard 가 normal 이하로 완화된다", () => {
    assert.ok(
      DIFFICULTY_PROFILES.hard.minBboxDensity <=
        DIFFICULTY_PROFILES.normal.minBboxDensity,
    );
  });

  it("DIFFICULTY_ORDER 는 easy→normal→hard 순이다", () => {
    assert.deepEqual([...DIFFICULTY_ORDER], ["easy", "normal", "hard"]);
  });
});

// 온보딩 난이도 램프 수락 조건(#291). it 이름의 AC-N 은 이슈 인수조건 번호와 대응한다.
describe("온보딩 중간 난이도 프로파일 수락 조건 (#291)", () => {
  const easy = DIFFICULTY_PROFILES.easy;
  const normal = DIFFICULTY_PROFILES.normal;
  const medium = ONBOARDING_MEDIUM_PROFILE;

  it("AC-1: difficultyProfiles 에 easy 와 normal 사이의 완화 normal 파라미터 세트를 추가한다", () => {
    // 새 티어(enum)를 만들지 않으려고 difficulty 는 normal 유지(파급 0).
    assert.equal(medium.difficulty, "normal");
    assert.equal(isDifficulty("medium"), false);
    // minWordCount 는 easy(8)<9<normal(10) 로 엄밀히 중간.
    assert.ok(
      easy.minWordCount < medium.minWordCount &&
        medium.minWordCount < normal.minWordCount,
      `${easy.minWordCount} < ${medium.minWordCount} < ${normal.minWordCount}`,
    );
    // 단어 수 상한은 normal 미만(완료 부담↓), easy 이상.
    assert.ok(medium.maxWords < normal.maxWords);
    assert.ok(medium.maxWords >= easy.maxWords);
    // 교차율은 normal 이상(easy 수준)으로 단서 연결을 쉽게 한다.
    assert.ok(medium.minCrossRatio >= normal.minCrossRatio);
    assert.equal(medium.minCrossRatio, easy.minCrossRatio);
    // 보드 크기는 단조성 유지를 위해 normal 과 동일(8).
    assert.equal(medium.boardSize, normal.boardSize);
    // 고급(hard) 어휘 배제로 어휘 편향도 완화.
    assert.deepEqual([...medium.wordDifficulties], ["easy", "normal"]);
  });

  it("AC-4: 중간 프로파일 신규 케이스로 난이도 프로파일 테스트를 보강한다", () => {
    // 이 describe 자체가 difficultyProfiles 테스트의 신규 케이스다(AC-4 커버리지 앵커).
    assert.equal(typeof medium.boardSize, "number");
    assert.equal(medium.minWordLength, 2);
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

describe("selectWordsForProfile", () => {
  it("1차 풀이 충분하면 보강 없이 순수 티어 풀을 쓴다(easy=easy만)", () => {
    const words = [
      ...makeWords("easy", MIN_GENERATION_WORD_POOL + 50),
      ...makeWords("normal", 1000),
      ...makeWords("hard", 1000),
    ];
    const selection = selectWordsForProfile(words, DIFFICULTY_PROFILES.easy);
    assert.equal(selection.broadened, false);
    assert.deepEqual(selection.broadenedWith, []);
    assert.deepEqual(selection.difficulties, ["easy"]);
    const counts = summarizeWordDifficulties(selection.words);
    assert.ok(counts.easy > 0);
    assert.equal(counts.normal, 0);
    assert.equal(counts.hard, 0);
  });

  it("1차 풀이 임계값 미만이면 인접 티어로 보강한다", () => {
    const words = [
      ...makeWords("easy", 10),
      ...makeWords("normal", 1000),
      ...makeWords("hard", 1000),
    ];
    const selection = selectWordsForProfile(words, DIFFICULTY_PROFILES.easy);
    assert.equal(selection.broadened, true);
    // easy 다음 난이도(normal)부터 더해 임계값을 채운다
    assert.equal(selection.broadenedWith[0], "normal");
    assert.ok(selection.words.length >= MIN_GENERATION_WORD_POOL);
    assert.ok(summarizeWordDifficulties(selection.words).normal > 0);
  });

  it("minPool 을 0 으로 주면 보강 없이 빈 풀도 그대로 반환(테스트 편의)", () => {
    const selection = selectWordsForProfile(
      makeWords("hard", 5),
      DIFFICULTY_PROFILES.easy,
      0,
    );
    assert.equal(selection.broadened, false);
    assert.equal(selection.words.length, 0);
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

describe("DIFFICULTY_PROFILES hard 점프 완화 (#154)", () => {
  it("hard 프로파일은 점프 완화 값으로 고정한다(회귀 방지)", () => {
    assert.equal(DIFFICULTY_PROFILES.hard.maxWords, 13);
    assert.equal(DIFFICULTY_PROFILES.hard.minWordCount, 14);
  });

  it("normal→hard maxWords/minWordCount 증가율이 과거(16/18)보다 완화된다", () => {
    const n = DIFFICULTY_PROFILES.normal;
    const h = DIFFICULTY_PROFILES.hard;
    const maxWordsJump = (h.maxWords - n.maxWords) / n.maxWords;
    const minWordCountJump = (h.minWordCount - n.minWordCount) / n.minWordCount;
    // 과거 값(maxWords 16, minWordCount 18) 기준 점프: 0.6, 0.8
    assert.ok(maxWordsJump < 0.6, `maxWords 증가율 ${maxWordsJump} < 0.6`);
    assert.ok(minWordCountJump < 0.8, `minWordCount 증가율 ${minWordCountJump} < 0.8`);
  });

  it("hard 품질 게이트(교차율·밀도) 하한은 유지한다", () => {
    assert.equal(DIFFICULTY_PROFILES.hard.minCrossRatio, 0.5);
    assert.equal(DIFFICULTY_PROFILES.hard.minBboxDensity, 0.45);
  });
});
