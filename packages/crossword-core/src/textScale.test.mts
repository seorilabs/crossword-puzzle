import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  DEFAULT_TEXT_SCALE,
  TEXT_SCALE_FONT_MULTIPLIER,
  getTextScaleFontMultiplier,
  normalizeTextScale,
} from "./textScale.ts";

describe("textScale", () => {
  it("기본 글자 크기는 보통(normal)이다", () => {
    assert.equal(DEFAULT_TEXT_SCALE, "normal");
  });

  it("normal 배율은 1, large 배율은 1보다 크다", () => {
    assert.equal(TEXT_SCALE_FONT_MULTIPLIER.normal, 1);
    assert.ok(TEXT_SCALE_FONT_MULTIPLIER.large > 1);
  });

  it("정규화: 알려진 값은 그대로, 나머지는 기본값(normal)으로 폴백한다", () => {
    assert.equal(normalizeTextScale("large"), "large");
    assert.equal(normalizeTextScale("normal"), "normal");
    // 구버전/오염/undefined/null/숫자 등은 normal로 폴백.
    assert.equal(normalizeTextScale("huge"), "normal");
    assert.equal(normalizeTextScale(undefined), "normal");
    assert.equal(normalizeTextScale(null), "normal");
    assert.equal(normalizeTextScale(2), "normal");
    assert.equal(normalizeTextScale(""), "normal");
  });

  it("배율 조회는 정규화 후 값을 돌려준다", () => {
    assert.equal(
      getTextScaleFontMultiplier("large"),
      TEXT_SCALE_FONT_MULTIPLIER.large,
    );
    assert.equal(getTextScaleFontMultiplier("normal"), 1);
    // 알 수 없는 값도 normal 배율(1)로 안전 처리.
    assert.equal(getTextScaleFontMultiplier("bogus"), 1);
  });
});
