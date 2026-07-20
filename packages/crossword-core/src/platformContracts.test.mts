import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  STUCK_HINT_PROMPT_ACCEPT_EVENT,
  STUCK_HINT_PROMPT_DISMISS_EVENT,
  STUCK_HINT_PROMPT_EVENT,
  STUCK_HINT_PROMPT_REVEAL_WORD_EVENT,
} from "./platformContracts.ts";

describe("막힘 힌트 기존 telemetry 이벤트 계약 유지(#265)", () => {
  it("노출·수락·정답 보기·dismiss 이벤트 이름을 바꾸지 않는다", () => {
    assert.deepEqual(
      [
        STUCK_HINT_PROMPT_EVENT,
        STUCK_HINT_PROMPT_ACCEPT_EVENT,
        STUCK_HINT_PROMPT_REVEAL_WORD_EVENT,
        STUCK_HINT_PROMPT_DISMISS_EVENT,
      ],
      [
        "stuck_hint_prompt",
        "stuck_hint_prompt_accept",
        "stuck_hint_prompt_reveal_word",
        "stuck_hint_prompt_dismiss",
      ],
    );
  });
});
