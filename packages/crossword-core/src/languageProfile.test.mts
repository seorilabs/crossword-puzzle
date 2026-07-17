import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  getLanguageProfileKey,
  koKrLanguageProfile,
  normalizeAndValidateAnswerCells,
  projectAnswerCells,
  resolveLanguageProfile,
  type LanguageProfile,
} from "./languageProfile.ts";
import {
  getCompletedEntries,
  getEntryAnswerLength,
  getEntryCells,
} from "./puzzle.ts";
import type { PuzzleEntry } from "./types.ts";

describe("ko-KR/v1 LanguageProfile", () => {
  test("NFD 입력을 NFC 완성형 음절로 정규화하고 셀로 나눈다", () => {
    assert.deepEqual(koKrLanguageProfile.segmentAnswer(" 가 나 "), [
      "가",
      "나",
    ]);
    assert.equal(koKrLanguageProfile.normalizeCommittedCell("가"), "가");
    assert.equal(koKrLanguageProfile.validateCell("가"), true);
  });

  test("미완성 자모·라틴 문자·복수 음절은 한 셀로 허용하지 않는다", () => {
    assert.equal(koKrLanguageProfile.validateCell("ㄱ"), false);
    assert.equal(koKrLanguageProfile.validateCell("A"), false);
    assert.equal(koKrLanguageProfile.validateCell("가나"), false);
  });

  test("profile ID/version과 contentLocale가 모두 맞아야 resolve한다", () => {
    assert.equal(getLanguageProfileKey(koKrLanguageProfile), "ko-KR/v1");
    assert.equal(
      resolveLanguageProfile({ id: "ko-KR", version: 1 }, "ko-KR"),
      koKrLanguageProfile,
    );
    assert.equal(
      resolveLanguageProfile({ id: "ko-KR", version: 2 }, "ko-KR"),
      null,
    );
    assert.equal(
      resolveLanguageProfile({ id: "ko-KR", version: 1 }, "future-X"),
      null,
    );
  });

  test("answerCells 정규화와 legacy answer projection이 결정적이다", () => {
    const result = normalizeAndValidateAnswerCells(koKrLanguageProfile, [
      "가",
      "나",
    ]);
    assert.deepEqual(result, { cells: ["가", "나"], valid: true });
    assert.equal(projectAnswerCells(result.cells), "가나");
  });
});

describe("locale-independent atomic answerCells", () => {
  const syntheticProfile: LanguageProfile = {
    id: "future-X",
    version: 1,
    contentLocale: "x-future",
    normalizeSource: (value) => value,
    segmentAnswer: (value) => value.split("|"),
    normalizeCommittedCell: (value) => value,
    validateCell: (value) => value.length > 0,
    cellsEqual: (left, right) => left === right,
  };

  test("multi-code-point 셀도 answerCells 원소 하나를 게임 셀 하나로 센다", () => {
    const answerCells = syntheticProfile.segmentAnswer("á|👩‍🔬");
    const entry: PuzzleEntry = {
      id: "synthetic-across",
      answer: projectAnswerCells(answerCells),
      answerCells,
      clue: "synthetic fixture",
      direction: "across",
      row: 0,
      col: 0,
      generatedBy: "placed",
    };

    assert.equal(getEntryAnswerLength(entry), 2);
    assert.deepEqual(getEntryCells(entry), [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
    assert.deepEqual(
      getCompletedEntries([entry], { "0:0": "á", "0:1": "👩‍🔬" }),
      [entry],
    );
  });
});
