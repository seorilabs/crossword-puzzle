import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getAnswerCommitLetters,
  getAnswerInputLetters,
  isHangulJamoInput,
  isHangulJamoLetter,
} from "./answerInput.ts";

test("getAnswerInputLetters: 공백 제거 후 maxLength로 자른다", () => {
  assert.deepEqual(getAnswerInputLetters("가 나 다", 2), ["가", "나"]);
  assert.deepEqual(getAnswerInputLetters("abc", 5), ["a", "b", "c"]);
  assert.deepEqual(getAnswerInputLetters("", 3), []);
});

test("isHangulJamoLetter: 미완성 자모만 참", () => {
  assert.equal(isHangulJamoLetter("ㄱ"), true);
  assert.equal(isHangulJamoLetter("ㅏ"), true);
  assert.equal(isHangulJamoLetter("가"), false);
  assert.equal(isHangulJamoLetter("a"), false);
});

test("getAnswerCommitLetters: 미완성 자모는 커밋 대상에서 제외", () => {
  assert.deepEqual(getAnswerCommitLetters("강ㄴ", 5), ["강"]);
  assert.deepEqual(getAnswerCommitLetters("가나", 5), ["가", "나"]);
  assert.deepEqual(getAnswerCommitLetters("ㄱ", 5), []);
});

test("isHangulJamoInput: 전부 자모일 때만 참", () => {
  assert.equal(isHangulJamoInput("ㄱ"), true);
  assert.equal(isHangulJamoInput("ㄱㅏ"), true);
  assert.equal(isHangulJamoInput("가"), false);
  assert.equal(isHangulJamoInput("강ㄴ"), false);
  assert.equal(isHangulJamoInput(""), false);
});
