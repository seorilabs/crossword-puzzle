// 단서 큐레이션 정책 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import {
  CURATED_CLUE_SOURCE,
  DEFAULT_MAX_NEEDS_MANUAL_CLUE_RATIO,
  KO_KR_MIN_EXPOSED_ANSWER_FRAGMENT_LENGTH,
  applyManualClue,
  applyManualClues,
  countNeedsManualClue,
  findBoardClueQualityConflicts,
  findKoKrAnswerFragmentExposure,
  isSelfReferentialClue,
  needsManualClueRatio,
  summarizeManualClueCoverage,
} from "./clueCuration.ts";

describe("isSelfReferentialClue", () => {
  it("단서가 정답을 부분 문자열로 포함하면 true", () => {
    assert.equal(isSelfReferentialClue("사회", "사회의 한 구성원"), true);
    assert.equal(isSelfReferentialClue("평면", "두 평면이 만나는 선"), true);
    assert.equal(
      isSelfReferentialClue("지하철", "지하 철도를 달리는 차"),
      true,
    );
    assert.equal(isSelfReferentialClue("글자", "한글 자모를 적는 기호"), true);
  });

  it("정답을 포함하지 않으면 false", () => {
    assert.equal(
      isSelfReferentialClue("사회", "여러 사람이 어울려 사는 집단"),
      false,
    );
  });

  it("빈 단서/누락은 false", () => {
    assert.equal(isSelfReferentialClue("사회", ""), false);
    assert.equal(isSelfReferentialClue("사회", undefined), false);
    assert.equal(isSelfReferentialClue("사회", null), false);
  });
});

describe("findKoKrAnswerFragmentExposure", () => {
  it("복합어 조각·활용 어간·띄어 쓴 조각을 결정적으로 찾는다", () => {
    assert.equal(KO_KR_MIN_EXPOSED_ANSWER_FRAGMENT_LENGTH, 2);
    assert.equal(
      findKoKrAnswerFragmentExposure(
        "주재료",
        "어떤 것을 만드는 데 쓰는 가장 중심이 되는 재료",
      ),
      "재료",
    );
    assert.equal(
      findKoKrAnswerFragmentExposure("겨루기", "두 선수가 기술을 겨루는 경기"),
      "겨루",
    );
    assert.equal(
      findKoKrAnswerFragmentExposure("집안일", "청소처럼 집 안에서 하는 일"),
      "집안",
    );
  });

  it("서로 다른 token의 끝과 시작이 붙은 우연한 조각은 제외한다", () => {
    assert.equal(
      findKoKrAnswerFragmentExposure(
        "눌은밥",
        "솥에 눌어붙은 밥에 물을 부어 끓인 음식",
      ),
      null,
    );
    assert.equal(
      findKoKrAnswerFragmentExposure(
        "북반부",
        "남북으로 나누었을 때 북쪽 절반 부분",
      ),
      null,
    );
    assert.equal(
      findKoKrAnswerFragmentExposure("인문계", "언어와 역사 등의 학문 계통"),
      null,
    );
  });

  it("2글자 정답은 기존 full-answer gate만 담당한다", () => {
    assert.equal(findKoKrAnswerFragmentExposure("사회", "사회의 구성원"), null);
    assert.equal(isSelfReferentialClue("사회", "사회의 구성원"), true);
  });
});

describe("findBoardClueQualityConflicts", () => {
  it("다른 정답의 직접 노출과 정답 포함관계를 같은 보드에서 찾는다", () => {
    const conflicts = findBoardClueQualityConflicts([
      { answer: "방앗간", clue: "곡식을 찧거나 빻는 가게" },
      { answer: "가게", clue: "물건을 파는 작은 상점" },
      { answer: "주원료", clue: "가장 중심이 되는 기본 재료" },
      { answer: "원료", clue: "물건을 만드는 데 들어가는 재료" },
    ]);
    assert.deepEqual(
      conflicts.map((conflict) => [
        conflict.type,
        conflict.answer,
        conflict.otherAnswer,
      ]),
      [
        ["clue_contains_other_answer", "방앗간", "가게"],
        ["answer_contains_answer", "주원료", "원료"],
      ],
    );
  });

  it("정상 보드는 충돌이 없고 orthographic 포함은 의미와 무관하게 보드 제약이다", () => {
    assert.deepEqual(
      findBoardClueQualityConflicts([
        { answer: "토끼", clue: "귀가 길고 깡충깡충 뛰는 동물" },
        { answer: "기차", clue: "철길 위를 달리는 긴 탈것" },
      ]),
      [],
    );
    assert.equal(
      findBoardClueQualityConflicts([
        { answer: "운동화", clue: "달릴 때 편하게 신는 신발" },
        { answer: "동화", clue: "어린이를 위한 이야기" },
      ])[0]?.type,
      "answer_contains_answer",
    );
  });
});

describe("DEFAULT_MAX_NEEDS_MANUAL_CLUE_RATIO", () => {
  it("미검수 단서 상한이 0.4 이하로 단계적으로 조여졌다(#173 → #201)", () => {
    assert.ok(
      DEFAULT_MAX_NEEDS_MANUAL_CLUE_RATIO <= 0.4,
      `상한 ${DEFAULT_MAX_NEEDS_MANUAL_CLUE_RATIO} — 0.4 이하여야 함`,
    );
    assert.ok(DEFAULT_MAX_NEEDS_MANUAL_CLUE_RATIO > 0);
  });
});

describe("needsManualClueRatio", () => {
  it("미검수 비율을 계산한다", () => {
    const entries = [
      { needsManualClue: true },
      { needsManualClue: true },
      { needsManualClue: false },
      { needsManualClue: false },
    ];
    assert.equal(countNeedsManualClue(entries), 2);
    assert.equal(needsManualClueRatio(entries), 0.5);
  });

  it("빈 목록은 0", () => {
    assert.equal(needsManualClueRatio([]), 0);
  });

  it("needsManualClue 누락은 검수 완료로 간주", () => {
    assert.equal(needsManualClueRatio([{}, { needsManualClue: true }]), 0.5);
  });
});

describe("applyManualClue", () => {
  it("검수 단서가 있으면 clue·clueSource·needsManualClue 를 갱신한다", () => {
    const entry = {
      answer: "사회",
      clue: "여러 사람으로 이루어진 집단을 일상적으로 이르는 말",
      clueSource: "krdict-definition",
      needsManualClue: true,
    };
    const result = applyManualClue(entry, {
      사회: "여러 사람이 어울려 사는 집단",
    });
    assert.notEqual(result, entry); // 불변(새 객체)
    assert.equal(result.clue, "여러 사람이 어울려 사는 집단");
    assert.equal(result.clueSource, CURATED_CLUE_SOURCE);
    assert.equal(result.needsManualClue, false);
  });

  it("검수 단서가 없으면 원본을 그대로 반환한다", () => {
    const entry = { answer: "평면", clue: "x", needsManualClue: true };
    const result = applyManualClue(entry, { 사회: "..." });
    assert.equal(result, entry);
  });
});

describe("applyManualClues", () => {
  it("일괄 적용 건수를 집계한다", () => {
    const items = [
      { answer: "사회", needsManualClue: true },
      { answer: "평면", needsManualClue: true },
      { answer: "정정", needsManualClue: true },
    ];
    const { items: next, applied } = applyManualClues(items, {
      사회: "여러 사람이 어울려 사는 집단",
      평면: "굴곡이 없는 반반한 표면",
    });
    assert.equal(applied, 2);
    assert.equal(next[0].needsManualClue, false);
    assert.equal(next[1].needsManualClue, false);
    assert.equal(next[2].needsManualClue, true);
  });
});

describe("summarizeManualClueCoverage", () => {
  it("난이도·주제별로 미검수 비율을 집계하고 게이트 초과를 표시한다", () => {
    const summary = summarizeManualClueCoverage(
      [
        {
          difficulty: "easy",
          entries: [
            { needsManualClue: false },
            { needsManualClue: false },
            { needsManualClue: true },
          ],
        },
        {
          difficulty: "hard",
          entries: [{ needsManualClue: true }, { needsManualClue: true }],
        },
        {
          difficulty: "normal",
          themeTag: "food",
          entries: [{ needsManualClue: false }, { needsManualClue: true }],
        },
      ],
      0.4,
    );

    const easy = summary.groups.find((g) => g.key === "easy");
    assert.equal(easy?.kind, "difficulty");
    assert.equal(easy?.total, 3);
    assert.equal(easy?.needsManualClue, 1);
    assert.ok(Math.abs((easy?.ratio ?? 0) - 1 / 3) < 1e-9);
    assert.equal(easy?.exceedsGate, false);

    const hard = summary.groups.find((g) => g.key === "hard");
    assert.equal(hard?.ratio, 1);
    assert.equal(hard?.exceedsGate, true);

    const food = summary.groups.find(
      (g) => g.kind === "theme" && g.key === "food",
    );
    assert.equal(food?.total, 2);
    assert.equal(food?.ratio, 0.5);
    assert.equal(food?.exceedsGate, true);

    assert.equal(summary.anyExceeded, true);
  });

  it("한 퍼즐이 난이도·주제 그룹 양쪽에 합산된다", () => {
    const summary = summarizeManualClueCoverage([
      {
        difficulty: "normal",
        themeTag: "animal",
        entries: [{ needsManualClue: true }],
      },
    ]);
    assert.equal(summary.groups.length, 2);
    assert.deepEqual(
      summary.groups.map((g) => `${g.kind}:${g.key}`),
      ["difficulty:normal", "theme:animal"],
    );
  });

  it("난이도 그룹은 easy<normal<hard, 주제는 난이도 뒤에 온다(결정적 정렬)", () => {
    const summary = summarizeManualClueCoverage([
      { difficulty: "hard", themeTag: "food", entries: [{}] },
      { difficulty: "easy", entries: [{}] },
      { difficulty: "normal", themeTag: "animal", entries: [{}] },
    ]);
    assert.deepEqual(
      summary.groups.map((g) => `${g.kind}:${g.key}`),
      [
        "difficulty:easy",
        "difficulty:normal",
        "difficulty:hard",
        "theme:animal",
        "theme:food",
      ],
    );
  });

  it("빈 목록은 그룹 없음·초과 없음", () => {
    const summary = summarizeManualClueCoverage([]);
    assert.deepEqual(summary.groups, []);
    assert.equal(summary.anyExceeded, false);
  });
});

// 발행에 쓰이는 검수 단서 데이터(data/lexicon/manual-clues.json) 자체가
// 자기참조 금지 규칙과 커버리지 기준을 지키는지 고정한다(#152). node:test는
// 저장소 루트에서 실행되므로 cwd 기준 경로로 읽는다.
describe("manual-clues.json 검수 단서 데이터", () => {
  const raw = JSON.parse(
    readFileSync("data/lexicon/manual-clues.json", "utf8"),
  ) as Record<string, string>;
  const clues = Object.entries(raw).filter(
    ([answer]) => !answer.startsWith("_"),
  );

  it("검수 단서 항목 수가 커버리지 확대 기준(500개 이상)을 충족한다(#201 → #250)", () => {
    assert.ok(
      clues.length >= 500,
      `검수 단서 ${clues.length}개 — 500개 이상이어야 함`,
    );
  });

  it("모든 검수 단서가 54자 이하다(생성 파이프라인 --maxClueLength 기준)", () => {
    const over = clues.filter(([, clue]) => [...clue].length > 54);
    assert.deepEqual(
      over.map(([answer]) => answer),
      [],
      "54자를 넘는 단서가 있으면 안 됨",
    );
  });

  it("모든 검수 단서가 비어 있지 않다", () => {
    for (const [answer, clue] of clues) {
      assert.ok(
        typeof clue === "string" && clue.trim().length > 0,
        `빈 단서: ${answer}`,
      );
    }
  });

  it("어떤 검수 단서도 정답을 부분 문자열로 포함하지 않는다(자기참조 금지)", () => {
    const offenders = clues.filter(([answer, clue]) =>
      isSelfReferentialClue(answer, clue),
    );
    assert.deepEqual(
      offenders.map(([answer]) => answer),
      [],
      "자기참조 단서가 있으면 안 됨",
    );
  });
});
