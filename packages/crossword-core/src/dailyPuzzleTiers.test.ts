import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { DAILY_PUZZLE_TIERS } from "./dailyPuzzleTiers.ts";
import { DIFFICULTY_PROFILES } from "./difficultyProfiles.ts";

describe("일간 퍼즐 난이도 구성", () => {
  it("매일 easy, normal, hard를 서로 다른 슬롯으로 한 판씩 발행한다", () => {
    assert.deepEqual(DAILY_PUZZLE_TIERS, [
      { difficulty: "easy", slotHour: 0 },
      { difficulty: "hard", slotHour: 1 },
    ]);
  });

  it("easy는 5×5, hard는 8×8 프로파일을 사용한다", () => {
    assert.equal(DIFFICULTY_PROFILES.easy.boardSize, 5);
    assert.equal(DIFFICULTY_PROFILES.hard.boardSize, 8);
  });
});
