import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  compactTelemetryParams,
  STUCK_HINT_PROMPT_ACCEPT_EVENT,
  STUCK_HINT_PROMPT_DISMISS_EVENT,
  STUCK_HINT_PROMPT_EVENT,
  STUCK_HINT_PROMPT_REVEAL_WORD_EVENT,
} from "./platformContracts.ts";

describe("퍼즐 식별자 telemetry 문자열 계약 (#351)", () => {
  it("식별자 키는 문자열로 통일하고 일반 숫자 지표는 숫자로 유지한다", () => {
    assert.deepEqual(
      compactTelemetryParams({
        next_puzzle_id: 26082101,
        pack_id: 260821,
        puzzle_alias: 26082100,
        puzzle_id: 26082100,
        slot_id: 26082102,
        attempt_number: 2,
        omitted: null,
      }),
      {
        next_puzzle_id: "26082101",
        pack_id: "260821",
        puzzle_alias: "26082100",
        puzzle_id: "26082100",
        slot_id: "26082102",
        attempt_number: 2,
      },
    );
  });
});

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
