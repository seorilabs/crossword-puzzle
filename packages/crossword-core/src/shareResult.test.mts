import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  buildShareResultClickParams,
  buildShareResultOutcomeParams,
  SHARE_RESULT_CLICK_EVENT,
  SHARE_RESULT_OUTCOME_EVENT,
} from "./shareResult.ts";

describe("shareResult 텔레메트리 계약", () => {
  it("클릭 파라미터는 surface 와 있는 퍼즐 맥락만 담는다", () => {
    assert.deepEqual(
      buildShareResultClickParams("completion_dialog", {
        puzzleId: "26090700",
        difficulty: "easy",
      }),
      { surface: "completion_dialog", puzzle_id: "26090700", difficulty: "easy" },
    );
    assert.deepEqual(buildShareResultClickParams("result_screen"), {
      surface: "result_screen",
    });
  });

  it("결과 파라미터는 surface 와 outcome 을 담고 이벤트 이름은 고정이다", () => {
    assert.deepEqual(buildShareResultOutcomeParams("result_screen", "shared"), {
      surface: "result_screen",
      outcome: "shared",
    });
    assert.equal(SHARE_RESULT_CLICK_EVENT, "share_result_click");
    assert.equal(SHARE_RESULT_OUTCOME_EVENT, "share_result_outcome");
  });
});
