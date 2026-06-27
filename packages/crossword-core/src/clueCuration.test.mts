// 단서 큐레이션 정책 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  CURATED_CLUE_SOURCE,
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
