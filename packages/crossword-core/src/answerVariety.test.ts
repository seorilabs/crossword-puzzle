import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  evaluateAnswerVariety,
  excludeAnswersSharingFragments,
  findOverusedSyllables,
  findSharedAnswerFragments,
  getAnswerFragments,
} from "./answerVariety.ts";

// 2026-08-16 발행된 easy 퍼즐(26081600). 플레이어가 "같은 단어만 나온다"고
// 지적한 실제 사례로, 9개 정답 중 6개가 학생 어근 군집이었다.
const CLUSTERED_EASY_ANSWERS = [
  "유학",
  "대학생",
  "여학생",
  "여행",
  "사이다",
  "유학생",
  "학생",
  "대학",
  "여행사",
];

// 2026-08-14 발행된 easy 퍼즐(26081400). 같은 규격에서 군집 없이 생성된 판.
const VARIED_EASY_ANSWERS = [
  "누나",
  "라디오",
  "자전거",
  "주인",
  "양말",
  "나라",
  "디자인",
  "오전",
  "거의",
  "주말",
];

describe("정답 조각 추출", () => {
  it("연속 음절 조각만 뽑는다", () => {
    assert.deepEqual([...getAnswerFragments("대학생", 2)], ["대학", "학생"]);
  });

  it("정답이 조각 길이보다 짧으면 조각이 없다", () => {
    assert.equal(getAnswerFragments("산", 2).size, 0);
  });
});

describe("공유 조각 규칙", () => {
  it("어근을 공유하는 정답 묶음을 찾는다", () => {
    const shared = findSharedAnswerFragments(CLUSTERED_EASY_ANSWERS);
    const fragments = shared.map((entry) => entry.fragment).sort();

    assert.deepEqual(fragments, ["대학", "여행", "유학", "학생"]);
    assert.deepEqual(
      shared.find((entry) => entry.fragment === "학생")?.answers.sort(),
      ["대학생", "여학생", "유학생", "학생"].sort(),
    );
  });

  it("1음절만 겹치는 교차는 위반이 아니다", () => {
    assert.deepEqual(findSharedAnswerFragments(["이날", "이해", "사이다"]), []);
  });

  it("군집이 없는 실제 퍼즐은 통과한다", () => {
    assert.deepEqual(findSharedAnswerFragments(VARIED_EASY_ANSWERS), []);
  });
});

describe("음절 과다 규칙", () => {
  it("상한을 넘겨 반복되는 음절을 찾는다", () => {
    const overused = findOverusedSyllables(CLUSTERED_EASY_ANSWERS, 3);

    assert.deepEqual(
      overused.map((entry) => entry.syllable).sort(),
      ["생", "학"],
    );
    assert.equal(
      overused.find((entry) => entry.syllable === "학")?.answers.length,
      6,
    );
  });

  it("한 정답 안의 같은 음절 반복은 정답 1개로 센다", () => {
    assert.deepEqual(findOverusedSyllables(["일주일"], 1), []);
    assert.deepEqual(
      findOverusedSyllables(["일주일", "일요일"], 1).map(
        (entry) => entry.syllable,
      ),
      ["일"],
    );
  });

  it("군집이 없는 실제 퍼즐은 통과한다", () => {
    assert.deepEqual(findOverusedSyllables(VARIED_EASY_ANSWERS, 3), []);
  });
});

describe("어휘 다양성 게이트", () => {
  it("군집 퍼즐을 탈락시킨다", () => {
    assert.equal(evaluateAnswerVariety(CLUSTERED_EASY_ANSWERS).pass, false);
  });

  it("다양한 퍼즐을 통과시킨다", () => {
    assert.equal(evaluateAnswerVariety(VARIED_EASY_ANSWERS).pass, true);
  });

  it("빈 정답 목록은 통과한다", () => {
    assert.equal(evaluateAnswerVariety([]).pass, true);
  });
});

describe("최근 사용 어근 배제", () => {
  it("이미 쓴 정답과 어근을 공유하는 후보를 뺀다", () => {
    const words = [
      { answer: "학생" },
      { answer: "대학생" },
      { answer: "대학" },
      { answer: "학교" },
      { answer: "나라" },
    ];

    assert.deepEqual(
      excludeAnswersSharingFragments(words, ["대학생"]).map(
        (word) => word.answer,
      ),
      ["학교", "나라"],
    );
  });

  it("사용 이력이 없으면 후보를 그대로 둔다", () => {
    const words = [{ answer: "학생" }, { answer: "나라" }];

    assert.deepEqual(excludeAnswersSharingFragments(words, []), words);
  });

  it("앞뒤 공백이 있는 사용 이력도 같은 정답으로 본다", () => {
    const words = [
      { answer: "가로" },
      { answer: "신상명세서" },
      { answer: "세로" },
    ];

    assert.deepEqual(excludeAnswersSharingFragments(words, [" 신상명세서 "]), [
      { answer: "가로" },
      { answer: "세로" },
    ]);
    assert.equal(words.length, 3);
  });
});
