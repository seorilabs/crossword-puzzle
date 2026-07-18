import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  areCluesSimilar,
  clueSimilarityScore,
  normalizeClueForSimilarity,
} from "./clueSimilarity.ts";

describe("launch clue similarity policy", () => {
  test("띄어쓰기·문장부호·호환 문자를 같은 단서로 정규화한다", () => {
    assert.equal(
      normalizeClueForSimilarity("  물건을 넣어, 들고 다니는 것! "),
      "물건을넣어들고다니는것",
    );
  });

  test("동일 정의와 0.9 이상 bigram 유사 단서를 차단한다", () => {
    assert.equal(
      areCluesSimilar(
        "공공의 이익을 위하여 도의 예산으로 설립하고 관리함",
        "공공의 이익을 위하여 시의 예산으로 설립하고 관리함",
      ),
      true,
    );
    assert.ok(clueSimilarityScore("서로 다른 단서", "전혀 별개의 설명") < 0.9);
  });
});
