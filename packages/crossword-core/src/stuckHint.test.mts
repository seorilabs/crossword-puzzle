// 막힘(stuck) 힌트 노출 정책 단위 테스트
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  resolveStuckHintExposure,
  STUCK_HINT_IDLE_MS,
  STUCK_HINT_NO_PROGRESS_IDLE_MS,
  STUCK_HINT_WRONG_IDLE_MS,
  WRONG_CELL_COUNT_FOR_STUCK_HINT,
} from "./stuckHint.ts";

describe("resolveStuckHintExposure", () => {
  it("진척이 있고 오답이 적으면 일반 정체 지연으로 노출한다", () => {
    assert.deepEqual(
      resolveStuckHintExposure({ wrongCellCount: 0, wordsFilled: 3 }),
      { delayMs: STUCK_HINT_IDLE_MS, trigger: "idle" },
    );
  });

  it("아직 한 단어도 완성하지 못하면 더 빠른 진척0 지연으로 노출한다", () => {
    assert.deepEqual(
      resolveStuckHintExposure({ wrongCellCount: 0, wordsFilled: 0 }),
      { delayMs: STUCK_HINT_NO_PROGRESS_IDLE_MS, trigger: "no_progress" },
    );
  });

  it("오답이 누적되면(임계 이상) 가장 빠른 오답 지연으로 노출한다", () => {
    assert.deepEqual(
      resolveStuckHintExposure({
        wrongCellCount: WRONG_CELL_COUNT_FOR_STUCK_HINT,
        wordsFilled: 0,
      }),
      { delayMs: STUCK_HINT_WRONG_IDLE_MS, trigger: "wrong_answer" },
    );
  });

  it("오답 누적은 진척0보다 우선한다(진척이 없어도 오답 트리거)", () => {
    assert.deepEqual(
      resolveStuckHintExposure({
        wrongCellCount: WRONG_CELL_COUNT_FOR_STUCK_HINT,
        wordsFilled: 2,
      }),
      { delayMs: STUCK_HINT_WRONG_IDLE_MS, trigger: "wrong_answer" },
    );
  });

  it("진척0 지연은 일반 정체보다 빠르고 오답 지연보다 느리다", () => {
    assert.ok(STUCK_HINT_WRONG_IDLE_MS < STUCK_HINT_NO_PROGRESS_IDLE_MS);
    assert.ok(STUCK_HINT_NO_PROGRESS_IDLE_MS < STUCK_HINT_IDLE_MS);
  });
});
