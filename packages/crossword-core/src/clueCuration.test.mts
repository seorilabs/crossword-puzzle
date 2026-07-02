// 단서 큐레이션 정책 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import {
  CURATED_CLUE_SOURCE,
  DEFAULT_MAX_NEEDS_MANUAL_CLUE_RATIO,
  applyManualClue,
  applyManualClues,
  countNeedsManualClue,
  isSelfReferentialClue,
  needsManualClueRatio,
} from "./clueCuration.ts";

describe("isSelfReferentialClue", () => {
  it("단서가 정답을 부분 문자열로 포함하면 true", () => {
    assert.equal(isSelfReferentialClue("사회", "사회의 한 구성원"), true);
    assert.equal(isSelfReferentialClue("평면", "두 평면이 만나는 선"), true);
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

// 발행에 쓰이는 검수 단서 데이터(data/lexicon/manual-clues.json) 자체가
// 자기참조 금지 규칙과 커버리지 기준을 지키는지 고정한다(#152). node:test는
// 저장소 루트에서 실행되므로 cwd 기준 경로로 읽는다.
describe("manual-clues.json 검수 단서 데이터", () => {
  const raw = JSON.parse(
    readFileSync("data/lexicon/manual-clues.json", "utf8"),
  ) as Record<string, string>;
  const clues = Object.entries(raw).filter(([answer]) => !answer.startsWith("_"));

  it("검수 단서 항목 수가 커버리지 확대 기준(400개 이상)을 충족한다(#201)", () => {
    assert.ok(
      clues.length >= 400,
      `검수 단서 ${clues.length}개 — 400개 이상이어야 함`,
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
