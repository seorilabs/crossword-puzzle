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
