import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  PUBLISHED_DIFFICULTY_ROTATION,
  resolveScheduledDifficulty,
} from "./difficultyRotation.ts";

describe("resolveScheduledDifficulty (#151)", () => {
  it("2시간 발행 주기마다 easy/hard를 번갈아 반복한다", () => {
    assert.deepEqual(
      Array.from({ length: 12 }, (_, slotIndex) =>
        resolveScheduledDifficulty({ slotHour: slotIndex * 2 }),
      ),
      [
        "easy",
        "hard",
        "easy",
        "hard",
        "easy",
        "hard",
        "easy",
        "hard",
        "easy",
        "hard",
        "easy",
        "hard",
      ],
    );
  });

  it("하루 발행 팩에 easy와 hard가 각각 하나 이상 포함된다", () => {
    const dailyDifficulties = Array.from({ length: 12 }, (_, slotIndex) =>
      resolveScheduledDifficulty({ slotHour: slotIndex * 2 }),
    );

    assert.equal(dailyDifficulties.includes("easy"), true);
    assert.equal(dailyDifficulties.includes("hard"), true);
    assert.equal(
      dailyDifficulties.filter((difficulty) => difficulty === "easy").length,
      6,
    );
  });

  it("발행 주기 상수는 지원하는 두 난이도만 포함한다", () => {
    assert.deepEqual(PUBLISHED_DIFFICULTY_ROTATION, ["easy", "hard"]);
  });

  it("시각과 간격 입력을 안전하게 정규화한다", () => {
    // 26시 → 2시(슬롯 1), 24시 → 0시(슬롯 0), 음수는 24시간으로 되감는다.
    assert.equal(resolveScheduledDifficulty({ slotHour: 26 }), "hard");
    assert.equal(resolveScheduledDifficulty({ slotHour: 24 }), "easy");
    assert.equal(resolveScheduledDifficulty({ slotHour: -2 }), "hard");
    // 간격이 0이면 기본값 2시간으로 폴백한다.
    assert.equal(
      resolveScheduledDifficulty({ slotHour: 6, intervalHours: 0 }),
      "hard",
    );
  });
});

// AC-4(#291): 온보딩 난이도 램프는 완료 직후 배정(추천) 계층에서만 완화하고, 발행 난이도
// 로테이션(difficultyRotation)은 바꾸지 않는다. 기존 난이도 로테이션 테스트에 이 비간섭
// 회귀 가드를 신규 케이스로 추가한다.
describe("발행 로테이션은 온보딩 램프와 무관하다 (#291)", () => {
  it("AC-4: 온보딩 램프는 발행 난이도 로테이션에 개입하지 않는다", () => {
    // 발행 로테이션 상수는 램프와 독립적으로 유지된다.
    assert.deepEqual([...PUBLISHED_DIFFICULTY_ROTATION], ["easy", "hard"]);
    // 실행 경로: 슬롯 시각으로 해석한 발행 난이도가 램프와 무관하게 결정된다.
    assert.equal(resolveScheduledDifficulty({ slotHour: 0 }), "easy");
    assert.equal(resolveScheduledDifficulty({ slotHour: 2 }), "hard");
    assert.equal(resolveScheduledDifficulty({ slotHour: 4 }), "easy");
  });
});
