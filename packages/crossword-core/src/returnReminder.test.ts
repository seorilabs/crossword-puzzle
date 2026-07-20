// 복귀 리마인드(D1 재방문) 푸시 동의 유도 정책 단위 테스트
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  applyReturnReminderOutcome,
  buildReturnReminderResultParams,
  initialReturnReminderState,
  isReturnReminderResolved,
  mapNotificationAgreementResult,
  markReturnReminderPrompted,
  RETURN_REMINDER_MAX_PROMPT_COUNT,
  RETURN_REMINDER_RESULT_EVENT,
  shouldPromptReturnReminder,
  summarizeAgreementError,
  type ReturnReminderState,
} from "./returnReminder.ts";

describe("returnReminder 정책", () => {
  it("비활성(enabled=false)이면 절대 유도하지 않는다", () => {
    assert.equal(
      shouldPromptReturnReminder({
        enabled: false,
        promptDate: "2026-07-13",
        state: initialReturnReminderState,
      }),
      false,
    );
  });

  it("활성이고 아직 유도한 적 없으면 유도한다", () => {
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-07-13",
        state: initialReturnReminderState,
      }),
      true,
    );
  });

  it("error 후 익일이면 재유도한다", () => {
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-07-13",
        state: {
          promptCount: 1,
          lastPromptDate: "2026-07-12",
          outcome: "error",
        },
      }),
      true,
    );
  });

  it("timeout 후 익일이면 재유도한다", () => {
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-07-13",
        state: {
          promptCount: 1,
          lastPromptDate: "2026-07-12",
          outcome: "timeout",
        },
      }),
      true,
    );
  });

  it("error/timeout이어도 같은 날에는 재유도하지 않는다", () => {
    for (const outcome of ["error", "timeout"] as const) {
      const state: ReturnReminderState = {
        promptCount: 1,
        lastPromptDate: "2026-07-13",
        outcome,
      };
      assert.equal(
        shouldPromptReturnReminder({
          enabled: true,
          promptDate: "2026-07-13",
          state,
        }),
        false,
      );
    }
  });

  it("총 유도 상한에 도달하면 일시 실패여도 종결한다", () => {
    const states: ReturnReminderState[] = [
      {
        promptCount: RETURN_REMINDER_MAX_PROMPT_COUNT,
        lastPromptDate: "2026-07-12",
        outcome: "error",
      },
      {
        promptCount: RETURN_REMINDER_MAX_PROMPT_COUNT,
        lastPromptDate: "2026-07-12",
        outcome: "timeout",
      },
      {
        promptCount: RETURN_REMINDER_MAX_PROMPT_COUNT,
        lastPromptDate: "2026-07-12",
      },
    ];
    for (const state of states) {
      assert.equal(
        shouldPromptReturnReminder({
          enabled: true,
          promptDate: "2026-07-13",
          state,
        }),
        false,
      );
    }
  });

  it("동의/거부/미지원으로 종결되면 다시 묻지 않는다", () => {
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-07-13",
        state: {
          promptCount: 1,
          lastPromptDate: "2026-07-12",
          outcome: "agreed",
        },
      }),
      false,
    );
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-07-13",
        state: {
          promptCount: 1,
          lastPromptDate: "2026-07-12",
          outcome: "rejected",
        },
      }),
      false,
    );
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-07-13",
        state: {
          promptCount: 1,
          lastPromptDate: "2026-07-12",
          outcome: "unsupported",
        },
      }),
      false,
    );
  });

  it("error는 종결로 보지 않는다(promptCount=0이면 재유도 가능)", () => {
    const state: ReturnReminderState = { promptCount: 0, outcome: "error" };
    assert.equal(isReturnReminderResolved(state), false);
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-07-13",
        state,
      }),
      true,
    );
  });

  it("AIT 동의 결과 원문을 outcome으로 매핑한다", () => {
    assert.equal(mapNotificationAgreementResult("newAgreement"), "agreed");
    assert.equal(mapNotificationAgreementResult("alreadyAgreed"), "agreed");
    assert.equal(
      mapNotificationAgreementResult("agreementRejected"),
      "rejected",
    );
  });

  it("markReturnReminderPrompted는 횟수 증가·날짜 기록(불변 업데이트)", () => {
    const next = markReturnReminderPrompted(
      initialReturnReminderState,
      "2026-06-29",
    );
    assert.equal(next.promptCount, 1);
    assert.equal(next.lastPromptDate, "2026-06-29");
    assert.equal(
      initialReturnReminderState.promptCount,
      0,
      "원본 상태는 변경되지 않는다",
    );
  });

  it("applyReturnReminderOutcome는 outcome만 갱신한다", () => {
    const prompted = markReturnReminderPrompted(
      initialReturnReminderState,
      "2026-06-29",
    );
    const resolved = applyReturnReminderOutcome(prompted, "agreed");
    assert.equal(resolved.outcome, "agreed");
    assert.equal(resolved.promptCount, 1);
    assert.equal(resolved.lastPromptDate, "2026-06-29");
  });

  it("timeout도 종결로 보지 않는다(promptCount=0이면 재유도 가능) (#253)", () => {
    const state: ReturnReminderState = { promptCount: 0, outcome: "timeout" };
    assert.equal(isReturnReminderResolved(state), false);
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-07-13",
        state,
      }),
      true,
    );
  });

  it("error 결과면 errorReason을 상태에 담는다 (#253)", () => {
    const prompted: ReturnReminderState = { promptCount: 1 };
    const resolved = applyReturnReminderOutcome(
      prompted,
      "error",
      "E_BRIDGE: not connected",
    );
    assert.equal(resolved.outcome, "error");
    assert.equal(resolved.errorReason, "E_BRIDGE: not connected");
  });

  it("error가 아닌 결과로 넘어가면 이전 errorReason을 비운다 (#253)", () => {
    const withError: ReturnReminderState = {
      promptCount: 1,
      outcome: "error",
      errorReason: "E_BRIDGE",
    };
    const agreed = applyReturnReminderOutcome(withError, "agreed");
    assert.equal(agreed.errorReason, undefined);
    // errorReason 없이 error를 넘겨도 잔여값이 남지 않는다.
    const errorNoReason = applyReturnReminderOutcome(withError, "error");
    assert.equal(errorNoReason.errorReason, undefined);
  });

  it("buildReturnReminderResultParams는 영문 키와 outcome/횟수를 담는다", () => {
    const state: ReturnReminderState = { promptCount: 2, outcome: "rejected" };
    assert.deepEqual(buildReturnReminderResultParams(state), {
      outcome: "rejected",
      prompt_count: 2,
    });
  });

  it("재유도 결과의 prompt_count는 증가한 회차를 반영한다", () => {
    const retried = markReturnReminderPrompted(
      {
        promptCount: 1,
        lastPromptDate: "2026-07-12",
        outcome: "error",
      },
      "2026-07-13",
    );
    const resolved = applyReturnReminderOutcome(retried, "agreed");
    assert.deepEqual(
      {
        event_name: RETURN_REMINDER_RESULT_EVENT,
        params: buildReturnReminderResultParams(resolved),
      },
      {
        event_name: "return_reminder_result",
        params: { outcome: "agreed", prompt_count: 2 },
      },
    );
  });

  it("error_reason이 있으면 결과 파라미터에 덧붙인다 (#253)", () => {
    const state: ReturnReminderState = {
      promptCount: 1,
      outcome: "error",
      errorReason: "E_TIMEOUT_BRIDGE",
    };
    assert.deepEqual(buildReturnReminderResultParams(state), {
      outcome: "error",
      prompt_count: 1,
      error_reason: "E_TIMEOUT_BRIDGE",
    });
  });

  it("timeout outcome은 error_reason 없이 그대로 기록된다 (#253)", () => {
    const state: ReturnReminderState = { promptCount: 1, outcome: "timeout" };
    assert.deepEqual(buildReturnReminderResultParams(state), {
      outcome: "timeout",
      prompt_count: 1,
    });
  });

  it("outcome 미정이면 결과 파라미터 outcome은 error로 채운다", () => {
    const state: ReturnReminderState = { promptCount: 1 };
    assert.equal(buildReturnReminderResultParams(state).outcome, "error");
  });
});

describe("summarizeAgreementError (#253)", () => {
  it("Error 인스턴스는 message를 요약한다", () => {
    assert.equal(
      summarizeAgreementError(new Error("bridge disconnected")),
      "bridge disconnected",
    );
  });

  it("code/message 객체는 'code: message'로 합친다", () => {
    assert.equal(
      summarizeAgreementError({ code: "E_UNSUPPORTED", message: "no bridge" }),
      "E_UNSUPPORTED: no bridge",
    );
  });

  it("문자열은 그대로, 개행·연속 공백은 한 줄로 접는다", () => {
    assert.equal(summarizeAgreementError("a\n  b\tc"), "a b c");
  });

  it("null/빈 값은 unknown으로 대체한다", () => {
    assert.equal(summarizeAgreementError(null), "unknown");
    assert.equal(summarizeAgreementError(undefined), "unknown");
    assert.equal(summarizeAgreementError("   "), "unknown");
  });

  it("100자를 넘으면 잘라 상한을 지킨다", () => {
    const long = "x".repeat(250);
    const summary = summarizeAgreementError(long);
    assert.equal(summary.length, 100);
  });
});
