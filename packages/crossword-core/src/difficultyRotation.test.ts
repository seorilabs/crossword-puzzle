import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  PUBLISHED_DIFFICULTY_ROTATION,
  resolveScheduledDifficulty,
} from "./difficultyRotation.ts";

describe("resolveScheduledDifficulty (#151)", () => {
  it("2시간 발행 주기마다 normal/easy/normal/hard를 반복한다", () => {
    assert.deepEqual(
      Array.from({ length: 12 }, (_, slotIndex) =>
        resolveScheduledDifficulty({ slotHour: slotIndex * 2 }),
      ),
      [
        "normal",
        "easy",
        "normal",
        "hard",
        "normal",
        "easy",
        "normal",
        "hard",
        "normal",
        "easy",
        "normal",
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
      dailyDifficulties.filter((difficulty) => difficulty === "normal").length,
      6,
    );
  });

  it("발행 주기 상수는 지원하는 세 난이도만 포함한다", () => {
    assert.deepEqual(PUBLISHED_DIFFICULTY_ROTATION, [
      "normal",
      "easy",
      "normal",
      "hard",
    ]);
  });

  it("시각과 간격 입력을 안전하게 정규화한다", () => {
    assert.equal(resolveScheduledDifficulty({ slotHour: 26 }), "easy");
    assert.equal(resolveScheduledDifficulty({ slotHour: -2 }), "hard");
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
  it("AC-4: 온보딩 램프 도입 후에도 발행 난이도 로테이션은 normal/easy/normal/hard로 불변이다", () => {
    // 발행 로테이션 상수는 램프와 독립적으로 유지된다.
    assert.deepEqual(
      [...PUBLISHED_DIFFICULTY_ROTATION],
      ["normal", "easy", "normal", "hard"],
    );
    // 실행 경로: 슬롯 시각으로 해석한 발행 난이도가 램프 도입 후에도 그대로다.
    assert.equal(resolveScheduledDifficulty({ slotHour: 0 }), "normal");
    assert.equal(resolveScheduledDifficulty({ slotHour: 2 }), "easy");
    assert.equal(resolveScheduledDifficulty({ slotHour: 6 }), "hard");
  });
});
