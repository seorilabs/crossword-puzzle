import assert from "node:assert/strict";
import { test } from "node:test";
import {
  VOCABULARY_WEIGHTS,
  sampleVocabulary,
  getVocabularyMix,
} from "./vocabularySelection.ts";
test("전체 어휘 등급에 양의 추첨 가능성을 남기고 원본을 보존한다", () => {
  assert.ok(Object.values(VOCABULARY_WEIGHTS).every((weight) => weight > 0));
  const words = [
    { answer: "나무", level: "초급" },
    { answer: "등가", level: "고급" },
    { answer: "임의" },
  ];
  const source = JSON.stringify(words);
  assert.equal(sampleVocabulary(words, 3, () => 0.5).length, 3);
  assert.equal(JSON.stringify(words), source);
  assert.deepEqual(
    sampleVocabulary(words, 1, () => 0.5).map((word) => word.answer),
    ["나무"],
  );
});
test("반복 추첨은 중복 없이 동일한 입력과 난수로 재현된다", () => {
  const words = Array.from({ length: 30 }, (_, i) => ({
    answer: String(i),
    level: i < 10 ? "초급" : "고급",
  }));
  const a = sampleVocabulary(words, 15, () => 0.4);
  assert.equal(new Set(a).size, 15);
  assert.deepEqual(
    a,
    sampleVocabulary(words, 15, () => 0.4),
  );
  assert.deepEqual(
    getVocabularyMix([
      { level: "초급" },
      { level: "중급" },
      { level: "고급" },
      {},
    ]),
    { familiar: 2, total: 4, ratio: 0.5 },
  );
});
