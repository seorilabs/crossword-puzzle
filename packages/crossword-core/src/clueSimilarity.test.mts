import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  LAUNCH_CLUE_SIMILARITY_POLICY_ID,
  LAUNCH_CLUE_SIMILARITY_THRESHOLD,
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

  test("동일 정의와 0.88 이상 bigram 유사 단서를 차단한다", () => {
    assert.equal(
      LAUNCH_CLUE_SIMILARITY_POLICY_ID,
      "ko-kr-launch-bigram-dice-v2",
    );
    assert.equal(LAUNCH_CLUE_SIMILARITY_THRESHOLD, 0.88);
    assert.equal(
      areCluesSimilar(
        "공공의 이익을 위하여 도의 예산으로 설립하고 관리함",
        "공공의 이익을 위하여 시의 예산으로 설립하고 관리함",
      ),
      true,
    );
    assert.ok(clueSimilarityScore("서로 다른 단서", "전혀 별개의 설명") < 0.9);
  });

  test("0.882 중복 계열은 막고 0.875 정상 대조 단서는 허용한다", () => {
    const duplicateLeft = "어떤 것을 만드는 데 가장 중심이 되는 재료";
    const duplicateRight = "어떤 것을 만드는 데 쓰는 가장 중심이 되는 재료";
    assert.equal(
      clueSimilarityScore(duplicateLeft, duplicateRight),
      0.8823529411764706,
    );
    assert.equal(areCluesSimilar(duplicateLeft, duplicateRight), true);

    const contrastLeft = "암수로 나뉘는 동물에서 정자를 만드는 쪽";
    const contrastRight = "암수로 나뉘는 동물에서 난자를 만드는 쪽";
    assert.equal(clueSimilarityScore(contrastLeft, contrastRight), 0.875);
    assert.equal(areCluesSimilar(contrastLeft, contrastRight), false);
  });
});
