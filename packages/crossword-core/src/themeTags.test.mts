import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  assignThemeTags,
  buildThemeMeta,
  filterWordsByTheme,
  wordHasTheme,
} from "./themeTags.ts";
import type { ThemeCategory } from "./themeTags.ts";

const CATEGORIES: ThemeCategory[] = [
  { id: "food", label: "음식", keywords: ["음식", "요리", "채소"] },
  { id: "animal", label: "동물", keywords: ["동물", "포유류"] },
  { id: "nature", label: "자연", keywords: ["식물", "날씨"] },
];

describe("assignThemeTags", () => {
  it("뜻풀이에 카테고리 키워드가 있으면 해당 태그를 붙인다", () => {
    const tags = assignThemeTags(
      { answer: "당근", definition: "샐러드에 넣는 주황색 채소" },
      CATEGORIES,
    );
    assert.deepEqual(tags, ["food"]);
  });

  it("clue 텍스트도 매칭 대상에 포함한다", () => {
    const tags = assignThemeTags(
      { answer: "호랑이", definition: "", clue: "숲속의 큰 포유류 맹수" },
      CATEGORIES,
    );
    assert.deepEqual(tags, ["animal"]);
  });

  it("여러 카테고리에 걸리면 입력 순서대로 모두 반환한다", () => {
    const tags = assignThemeTags(
      { answer: "밭", definition: "채소를 기르는 곳으로 식물이 자란다" },
      CATEGORIES,
    );
    assert.deepEqual(tags, ["food", "nature"]);
  });

  it("매칭이 없으면 빈 배열을 반환한다", () => {
    const tags = assignThemeTags(
      { answer: "가게", definition: "물건을 파는 집" },
      CATEGORIES,
    );
    assert.deepEqual(tags, []);
  });

  it("answer 자체는 매칭 대상이 아니다(부분 문자열 오탐 방지)", () => {
    // answer 에 '음식'이 들어 있어도 뜻풀이에 키워드가 없으면 태깅하지 않는다.
    const tags = assignThemeTags(
      { answer: "음식점", definition: "여러 손님이 모여 밥을 먹는 장소" },
      CATEGORIES,
    );
    assert.deepEqual(tags, []);
  });

  it("빈 키워드는 무시한다(전량 매칭 방지)", () => {
    const tags = assignThemeTags(
      { answer: "무엇", definition: "아무 뜻" },
      [{ id: "x", label: "X", keywords: [""] }],
    );
    assert.deepEqual(tags, []);
  });

  it("definition/clue 가 없으면 빈 배열", () => {
    assert.deepEqual(assignThemeTags({ answer: "말" }, CATEGORIES), []);
  });

  it("동일 입력에 대해 반복 호출해도 결과가 같다(idempotent/결정적)", () => {
    // build-theme-tags 재실행 시 themeTags 가 변하지 않음을 뒷받침하는 회귀.
    const word = { answer: "당근", definition: "샐러드에 넣는 주황색 채소" };
    const first = assignThemeTags(word, CATEGORIES);
    const second = assignThemeTags(word, CATEGORIES);
    assert.deepEqual(first, second);
    assert.deepEqual(first, ["food"]);
  });
});

describe("filterWordsByTheme (생성기 주제 제약)", () => {
  const words = [
    { answer: "김치", themeTags: ["food"] },
    { answer: "호랑이", themeTags: ["animal"] },
    { answer: "당근", themeTags: ["food", "nature"] },
    { answer: "가게", themeTags: [] },
    { answer: "구버전" },
  ];

  it("해당 themeTag 를 가진 단어만 남긴다", () => {
    assert.deepEqual(
      filterWordsByTheme(words, "food").map((w) => w.answer),
      ["김치", "당근"],
    );
  });

  it("themeTags 가 없거나 매칭이 없으면 제외한다", () => {
    assert.deepEqual(
      filterWordsByTheme(words, "animal").map((w) => w.answer),
      ["호랑이"],
    );
    assert.deepEqual(filterWordsByTheme(words, "unknown"), []);
  });
});

describe("buildThemeMeta (매니페스트/퍼즐 주제 필드)", () => {
  it("themeTag/themeLabel 이 있으면 스프레드용 객체로 담는다", () => {
    assert.deepEqual(buildThemeMeta("food", "음식 특집"), {
      themeTag: "food",
      themeLabel: "음식 특집",
    });
  });

  it("theme 가 없으면 빈 객체(일반 퍼즐 항목에 필드 미추가)", () => {
    assert.deepEqual(buildThemeMeta(undefined, undefined), {});
  });

  it("한쪽만 있으면 그 필드만 담는다", () => {
    assert.deepEqual(buildThemeMeta("food", undefined), { themeTag: "food" });
  });
});

describe("wordHasTheme", () => {
  it("themeTags 에 id 가 있으면 true", () => {
    assert.equal(wordHasTheme(["food", "nature"], "nature"), true);
  });

  it("없으면 false", () => {
    assert.equal(wordHasTheme(["food"], "animal"), false);
  });

  it("undefined/비배열이면 false(안전 처리)", () => {
    assert.equal(wordHasTheme(undefined, "food"), false);
  });
});
