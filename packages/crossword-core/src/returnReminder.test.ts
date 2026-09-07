// 복귀 리마인드(D1 재방문) 푸시 동의 유도 정책 단위 테스트
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  RETURN_REMINDER_MAX_PROMPT_COUNT,
  RETURN_REMINDER_PREPROMPT_COPY,
  RETURN_REMINDER_PREPROMPT_EVENT,
  RETURN_REMINDER_PROMPT_EVENT,
  RETURN_REMINDER_RESULT_EVENT,
  RETURN_REMINDER_SCHEDULE_EVENT,
  type ReturnReminderState,
  applyReturnReminderOutcome,
  buildReturnReminderPrepromptParams,
  buildReturnReminderPromptParams,
  buildReturnReminderResultParams,
  extractAgreementErrorCode,
  formatReturnReminderPrepromptBody,
  getNextLocalReturnReminderSchedule,
  initialReturnReminderState,
  isReturnReminderConfigErrorCode,
  isReturnReminderResolved,
  mapNotificationAgreementResult,
  markReturnReminderPrompted,
  shouldCancelLocalReturnReminder,
  shouldPromptReturnReminder,
  shouldRefreshLocalReturnReminder,
  summarizeAgreementError,
  summarizeAgreementFailure,
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

  it("error/timeout 후 익일이면 재유도한다", () => {
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
    assert.equal(mapNotificationAgreementResult("unexpected"), "error");
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
    const resolved = applyReturnReminderOutcome(prompted, "error", {
      errorReason: "E_BRIDGE: not connected",
    });
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
      channel: "ait",
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
        [`${RETURN_REMINDER_RESULT_EVENT}.prompt_count`]:
          buildReturnReminderResultParams(resolved).prompt_count,
      },
      {
        "return_reminder_result.prompt_count": 2,
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
      channel: "ait",
      outcome: "error",
      prompt_count: 1,
      error_reason: "E_TIMEOUT_BRIDGE",
      stage: "sdk_callback",
    });
  });

  it("error_code가 있으면 결과 파라미터에 덧붙인다 (#288)", () => {
    const state: ReturnReminderState = {
      promptCount: 1,
      outcome: "error",
      errorReason: "E_UNSUPPORTED: no bridge",
      errorCode: "E_UNSUPPORTED",
    };
    assert.deepEqual(buildReturnReminderResultParams(state), {
      channel: "ait",
      outcome: "error",
      prompt_count: 1,
      error_reason: "E_UNSUPPORTED: no bridge",
      error_code: "E_UNSUPPORTED",
      stage: "sdk_callback",
    });
  });

  it("applyReturnReminderOutcome은 error에서만 errorCode를 보존한다 (#288)", () => {
    const withCode = applyReturnReminderOutcome({ promptCount: 1 }, "error", {
      errorReason: "E_X: msg",
      errorCode: "E_X",
    });
    assert.equal(withCode.errorCode, "E_X");
    // 다른 결과로 넘어가면 이전 코드가 남지 않는다.
    const agreed = applyReturnReminderOutcome(withCode, "agreed");
    assert.equal(agreed.errorCode, undefined);
    // error여도 코드가 없으면 비운다.
    const noCode = applyReturnReminderOutcome(withCode, "error", {
      errorReason: "msg",
    });
    assert.equal(noCode.errorCode, undefined);
  });

  it("실패 메타데이터를 보존하고 성공·거부 결과에서는 이전 값을 제거한다", () => {
    const failed = applyReturnReminderOutcome({ promptCount: 1 }, "error", {
      errorReason: "4000: invalid template",
      errorCode: "4000",
      errorWrapperCode: "NAF_ERROR",
      failureStage: "sdk_callback",
    });
    assert.equal(failed.errorWrapperCode, "NAF_ERROR");
    assert.equal(failed.failureStage, "sdk_callback");

    for (const outcome of ["agreed", "rejected"] as const) {
      const resolved = applyReturnReminderOutcome(failed, outcome);
      assert.equal(resolved.errorReason, undefined);
      assert.equal(resolved.errorCode, undefined);
      assert.equal(resolved.errorWrapperCode, undefined);
      assert.equal(resolved.failureStage, undefined);
    }
  });

  it("timeout outcome은 error_reason 없이 그대로 기록된다 (#253)", () => {
    const state: ReturnReminderState = {
      promptCount: 1,
      outcome: "timeout",
      failureStage: "timeout",
    };
    assert.deepEqual(buildReturnReminderResultParams(state), {
      channel: "ait",
      outcome: "timeout",
      prompt_count: 1,
      stage: "timeout",
    });
  });

  it("결과 파라미터에 error_wrapper_code와 stage를 추가한다", () => {
    const state: ReturnReminderState = {
      promptCount: 1,
      outcome: "error",
      errorReason: "4000: invalid template",
      errorCode: "4000",
      errorWrapperCode: "NAF_ERROR",
      failureStage: "sdk_callback",
    };
    assert.deepEqual(buildReturnReminderResultParams(state), {
      channel: "ait",
      outcome: "error",
      prompt_count: 1,
      error_reason: "4000: invalid template",
      error_code: "4000",
      error_wrapper_code: "NAF_ERROR",
      stage: "sdk_callback",
    });
  });

  it("unmapped 오류의 error_shape를 결과 파라미터에 추가한다 (#339)", () => {
    const state = applyReturnReminderOutcome({ promptCount: 1 }, "error", {
      errorReason: "알림 동의에 실패하였습니다.",
      errorCode: "unmapped",
      errorShape: "message,stack",
      failureStage: "sdk_callback",
    });
    assert.deepEqual(buildReturnReminderResultParams(state), {
      channel: "ait",
      outcome: "error",
      prompt_count: 1,
      error_reason: "알림 동의에 실패하였습니다.",
      error_code: "unmapped",
      error_shape: "message,stack",
      stage: "sdk_callback",
    });
    assert.equal(
      applyReturnReminderOutcome(state, "agreed").errorShape,
      undefined,
    );
  });

  it("outcome 미정이면 결과 파라미터 outcome은 error로 채운다", () => {
    const state: ReturnReminderState = { promptCount: 1 };
    assert.deepEqual(buildReturnReminderResultParams(state), {
      channel: "ait",
      outcome: "error",
      prompt_count: 1,
      stage: "sdk_callback",
    });
  });

  it("templateCodeSource를 주면 결과 파라미터에 template_code_source를 적재한다 (#319)", () => {
    const state: ReturnReminderState = { promptCount: 1, outcome: "agreed" };
    assert.deepEqual(buildReturnReminderResultParams(state, "env"), {
      channel: "ait",
      outcome: "agreed",
      prompt_count: 1,
      template_code_source: "env",
    });
    assert.deepEqual(buildReturnReminderResultParams(state, "default"), {
      channel: "ait",
      outcome: "agreed",
      prompt_count: 1,
      template_code_source: "default",
    });
  });

  it("templateCodeSource를 생략하면 template_code_source를 넣지 않는다(하위호환) (#319)", () => {
    const state: ReturnReminderState = { promptCount: 1, outcome: "agreed" };
    const params = buildReturnReminderResultParams(state);
    assert.equal("template_code_source" in params, false);
  });

  it("buildReturnReminderPromptParams는 trigger·template_code_source를 담는다 (#319)", () => {
    assert.deepEqual(
      buildReturnReminderPromptParams("mission_complete", "env"),
      {
        trigger: "mission_complete",
        channel: "ait",
        template_code_source: "env",
      },
    );
    assert.deepEqual(
      buildReturnReminderPromptParams("mission_complete", "default"),
      {
        trigger: "mission_complete",
        channel: "ait",
        template_code_source: "default",
      },
    );
  });

  it("RN 로컬 채널에는 템플릿 출처 없이 channel=local을 적재한다 (#352)", () => {
    assert.deepEqual(
      buildReturnReminderPromptParams("mission_complete", undefined, "local"),
      { trigger: "mission_complete", channel: "local" },
    );
    assert.deepEqual(
      buildReturnReminderResultParams(
        { promptCount: 1, outcome: "agreed" },
        undefined,
        "local",
      ),
      { channel: "local", outcome: "agreed", prompt_count: 1 },
    );
  });

  it("AC-3: buildReturnReminderResultParams의 template_code_source env/default를 return_reminder_prompt·return_reminder_result 양쪽에 적재한다 (#319)", () => {
    // App.tsx emit부가 두 이벤트에 쓰는 파라미터 빌더가 허용된 두 출처 값을
    // 동일하게 전달하는지 한 실행 테스트에서 폐곡한다.
    for (const source of ["env", "default"] as const) {
      const promptParams = buildReturnReminderPromptParams(
        "mission_complete",
        source,
      );
      const resultParams = buildReturnReminderResultParams(
        { promptCount: 1, outcome: "agreed" },
        source,
      );
      // 두 이벤트가 실재하고(상수) 각 파라미터에 동일 출처가 실린다.
      assert.equal(RETURN_REMINDER_PROMPT_EVENT, "return_reminder_prompt");
      assert.equal(RETURN_REMINDER_RESULT_EVENT, "return_reminder_result");
      assert.equal(promptParams.template_code_source, source);
      assert.equal(resultParams.template_code_source, source);
    }
  });
});

describe("RN 로컬 복귀 알림 예약 시각 (#352)", () => {
  it("완료일 다음 날 09:00 KST를 UTC timestamp로 계산한다", () => {
    assert.deepEqual(getNextLocalReturnReminderSchedule("2026-08-31"), {
      reminderDate: "2026-09-01",
      timestamp: Date.UTC(2026, 8, 1, 0),
    });
  });

  it("월말·연말을 넘겨도 다음 날짜를 계산한다", () => {
    assert.deepEqual(getNextLocalReturnReminderSchedule("2026-12-31"), {
      reminderDate: "2027-01-01",
      timestamp: Date.UTC(2027, 0, 1, 0),
    });
  });

  it("잘못된 날짜나 시간은 예약값을 만들지 않는다", () => {
    assert.equal(getNextLocalReturnReminderSchedule("2026-02-30"), null);
    assert.equal(getNextLocalReturnReminderSchedule("not-a-date"), null);
    assert.equal(getNextLocalReturnReminderSchedule("2026-08-31", 24), null);
  });
});

describe("설정 오류(config error_code)는 예산을 소진하지 않는다 (#319)", () => {
  it("isReturnReminderConfigErrorCode는 4000(트림 포함)을 설정 오류로 본다", () => {
    assert.equal(isReturnReminderConfigErrorCode("4000"), true);
    assert.equal(isReturnReminderConfigErrorCode("  4000  "), true);
    assert.equal(isReturnReminderConfigErrorCode("E_BRIDGE"), false);
    assert.equal(isReturnReminderConfigErrorCode(undefined), false);
  });

  it("설정 오류(4000)로 상한에 도달해도 익일이면 재유도한다", () => {
    const state: ReturnReminderState = {
      promptCount: RETURN_REMINDER_MAX_PROMPT_COUNT,
      lastPromptDate: "2026-07-12",
      outcome: "error",
      errorCode: "4000",
    };
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-07-13",
        state,
      }),
      true,
    );
  });

  it("설정 오류(4000)여도 같은 날에는 재유도하지 않는다", () => {
    const state: ReturnReminderState = {
      promptCount: RETURN_REMINDER_MAX_PROMPT_COUNT,
      lastPromptDate: "2026-07-13",
      outcome: "error",
      errorCode: "4000",
    };
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-07-13",
        state,
      }),
      false,
    );
  });

  it("중첩 NAF 래퍼의 4000도 설정 오류 정책이 인식한다", () => {
    const summary = summarizeAgreementFailure({
      code: "NAF_ERROR",
      message: "notification agreement failed",
      data: { code: "4000", message: "invalid template code" },
    });
    const state = applyReturnReminderOutcome(
      {
        promptCount: RETURN_REMINDER_MAX_PROMPT_COUNT,
        lastPromptDate: "2026-07-12",
      },
      "error",
      {
        errorReason: summary.reason,
        errorCode: summary.code,
        errorWrapperCode: summary.wrapperCode,
        failureStage: "sdk_callback",
      },
    );
    assert.equal(state.errorCode, "4000");
    assert.equal(state.errorWrapperCode, "NAF_ERROR");
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-07-13",
        state,
      }),
      true,
    );
  });

  it("설정 오류가 아닌 일반 error는 상한에 도달하면 종결한다(기존 정책 유지)", () => {
    const state: ReturnReminderState = {
      promptCount: RETURN_REMINDER_MAX_PROMPT_COUNT,
      lastPromptDate: "2026-07-12",
      outcome: "error",
      errorCode: "E_BRIDGE",
    };
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-07-13",
        state,
      }),
      false,
    );
  });

  it("unmapped는 일반 일시 실패처럼 익일 재시도·상한 정책을 유지한다 (#339)", () => {
    const retryable: ReturnReminderState = {
      promptCount: 1,
      lastPromptDate: "2026-07-12",
      outcome: "error",
      errorCode: "unmapped",
    };
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-07-13",
        state: retryable,
      }),
      true,
    );
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-07-13",
        state: {
          ...retryable,
          promptCount: RETURN_REMINDER_MAX_PROMPT_COUNT,
        },
      }),
      false,
    );
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

describe("summarizeAgreementFailure / error_code (#288)", () => {
  it("{code, message} 객체는 reason 합성 + code 보존", () => {
    assert.deepEqual(
      summarizeAgreementFailure({
        code: "E_UNSUPPORTED",
        message: "no bridge",
      }),
      { reason: "E_UNSUPPORTED: no bridge", code: "E_UNSUPPORTED" },
    );
  });

  it("Error 인스턴스는 unmapped 코드와 키 이름만 남긴다 (#339)", () => {
    assert.deepEqual(
      summarizeAgreementFailure(new Error("bridge disconnected")),
      {
        reason: "bridge disconnected",
        code: "unmapped",
        shape: "message,stack",
      },
    );
    assert.equal(
      extractAgreementErrorCode(new Error("bridge disconnected")),
      "unmapped",
    );
  });

  it("문자열 실패도 unmapped와 값 없는 타입 shape를 남긴다 (#339)", () => {
    assert.deepEqual(summarizeAgreementFailure("알림 동의에 실패하였습니다."), {
      reason: "알림 동의에 실패하였습니다.",
      code: "unmapped",
      shape: "type:string",
    });
  });

  it("error_shape는 최상위 키 이름만 포함하고 값·메시지 본문을 포함하지 않는다 (#339)", () => {
    const secretMessage = "private-message-value";
    const summary = summarizeAgreementFailure({
      message: secretMessage,
      requestId: "sensitive-id-value",
      response: { token: "sensitive-token-value" },
    });
    assert.equal(summary.code, "unmapped");
    assert.equal(summary.shape, "message,requestId,response");
    assert.equal(summary.shape?.includes(secretMessage), false);
    assert.equal(summary.shape?.includes("sensitive-id-value"), false);
    assert.equal(summary.shape?.includes("sensitive-token-value"), false);
  });

  it("error_shape는 100자 상한을 지킨다 (#339)", () => {
    const summary = summarizeAgreementFailure({ ["k".repeat(150)]: true });
    assert.equal(summary.code, "unmapped");
    assert.equal(summary.shape?.length, 100);
  });

  it("code가 없고 status만 있으면 status를 코드로 보존한다", () => {
    assert.equal(
      extractAgreementErrorCode({ status: 400, message: "잘못된 요청입니다." }),
      "400",
    );
  });

  it("code가 100자를 넘으면 상한을 지킨다", () => {
    const code = extractAgreementErrorCode({ code: "e".repeat(250) });
    assert.equal(code?.length, 100);
  });

  it("중첩 NAF 래퍼에서 가장 구체적인 4000 코드·메시지와 래퍼 코드를 보존한다", () => {
    assert.deepEqual(
      summarizeAgreementFailure({
        code: "NAF_ERROR",
        message: "notification agreement failed",
        data: { code: "4000", message: "invalid template code" },
      }),
      {
        reason: "4000: invalid template code",
        code: "4000",
        wrapperCode: "NAF_ERROR",
      },
    );
  });

  it("cause 경로의 구체적인 하위 오류를 탐색한다", () => {
    assert.deepEqual(
      summarizeAgreementFailure({
        code: "WRAPPED",
        cause: { status: 503, message: "service unavailable" },
      }),
      {
        reason: "503: service unavailable",
        code: "503",
        wrapperCode: "WRAPPED",
      },
    );
  });

  it("순환 참조를 만나도 한 번만 탐색하고 종료한다", () => {
    const cyclic: Record<string, unknown> = {
      code: "E_CYCLE",
      message: "cyclic error",
    };
    cyclic.cause = cyclic;
    assert.deepEqual(summarizeAgreementFailure(cyclic), {
      reason: "E_CYCLE: cyclic error",
      code: "E_CYCLE",
    });
  });

  it("깊이 3까지만 탐색해 더 깊은 코드는 무시한다", () => {
    const failure = {
      code: "WRAPPER",
      cause: {
        code: "LEVEL_1",
        cause: {
          code: "LEVEL_2",
          cause: {
            code: "LEVEL_3",
            message: "depth three",
            cause: { code: "4000", message: "too deep" },
          },
        },
      },
    };
    assert.deepEqual(summarizeAgreementFailure(failure), {
      reason: "LEVEL_3: depth three",
      code: "LEVEL_3",
      wrapperCode: "WRAPPER",
    });
  });

  it("중첩 메시지도 공백을 정리하고 최종 요약을 100자로 제한한다", () => {
    const summary = summarizeAgreementFailure({
      error: { code: "4000", message: ` invalid\n ${"x".repeat(200)} ` },
    });
    assert.equal(summary.code, "4000");
    assert.equal(summary.reason.includes("\n"), false);
    assert.equal(summary.reason.length, 100);
  });
});

describe("사전 안내(pre-prompt)와 RN 재예약·취소 규칙", () => {
  it("declined 는 종결이 아니라 익일 재유도 대상이며 예산을 소진한다", () => {
    const declined = applyReturnReminderOutcome(
      markReturnReminderPrompted({ promptCount: 0 }, "2026-09-08"),
      "declined",
    );
    assert.equal(isReturnReminderResolved(declined), false);
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-09-08",
        state: declined,
      }),
      false,
      "같은 날에는 다시 묻지 않는다",
    );
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-09-09",
        state: declined,
      }),
      true,
      "익일에는 다시 안내한다",
    );
    const exhausted: ReturnReminderState = {
      promptCount: RETURN_REMINDER_MAX_PROMPT_COUNT,
      lastPromptDate: "2026-09-08",
      outcome: "declined",
    };
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-09-09",
        state: exhausted,
      }),
      false,
      "3회 예산을 다 쓰면 declined 여도 종결한다",
    );
  });

  it("사전 안내 문구는 스트릭을 프레이밍하고 알림 시각을 알린다", () => {
    assert.equal(
      RETURN_REMINDER_PREPROMPT_COPY.title,
      "내일 새 퍼즐이 나오면 알려드릴게요",
    );
    assert.equal(
      formatReturnReminderPrepromptBody(3),
      "🔥 3일 연속 기록 지키기 · 매일 아침 9시 알림",
    );
    assert.equal(
      formatReturnReminderPrepromptBody(0),
      "🔥 연속 기록 시작하기 · 매일 아침 9시 알림",
    );
    assert.equal(
      formatReturnReminderPrepromptBody(Number.NaN),
      "🔥 연속 기록 시작하기 · 매일 아침 9시 알림",
    );
  });

  it("return_reminder_preprompt 파라미터에 action·channel·회차·스트릭을 담는다", () => {
    const prompted = markReturnReminderPrompted({ promptCount: 1 }, "2026-09-08");
    assert.deepEqual(
      buildReturnReminderPrepromptParams("shown", prompted, "local", 4.7),
      { action: "shown", channel: "local", prompt_count: 2, streak_days: 4 },
    );
    assert.deepEqual(
      buildReturnReminderPrepromptParams("decline", prompted, "ait", -1),
      { action: "decline", channel: "ait", prompt_count: 2, streak_days: 0 },
    );
    assert.equal(RETURN_REMINDER_PREPROMPT_EVENT, "return_reminder_preprompt");
    assert.equal(RETURN_REMINDER_SCHEDULE_EVENT, "return_reminder_schedule");
  });

  it("RN 재예약은 agreed 상태에서만, 취소는 예약 날짜가 오늘 이전·오늘일 때만 한다", () => {
    assert.equal(
      shouldRefreshLocalReturnReminder({ promptCount: 1, outcome: "agreed" }),
      true,
    );
    assert.equal(
      shouldRefreshLocalReturnReminder({ promptCount: 1, outcome: "rejected" }),
      false,
    );
    assert.equal(shouldRefreshLocalReturnReminder({ promptCount: 0 }), false);
    assert.equal(shouldCancelLocalReturnReminder("2026-09-08", "2026-09-08"), true);
    assert.equal(shouldCancelLocalReturnReminder("2026-09-07", "2026-09-08"), true);
    assert.equal(shouldCancelLocalReturnReminder("2026-09-09", "2026-09-08"), false);
    assert.equal(shouldCancelLocalReturnReminder("nope", "2026-09-08"), false);
  });

  it("사전 안내를 띄운 채 앱이 종료돼 응답이 없으면 익일에 다시 안내한다(예산은 소진)", () => {
    // promptCount 만 1 이고 outcome 이 없는 상태 = 카드 노출 후 강제 종료.
    const unanswered = markReturnReminderPrompted({ promptCount: 0 }, "2026-09-08");
    assert.equal(unanswered.outcome, undefined);
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-09-08",
        state: unanswered,
      }),
      false,
      "같은 날에는 다시 묻지 않는다",
    );
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-09-09",
        state: unanswered,
      }),
      true,
      "익일에는 다시 안내한다",
    );
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        promptDate: "2026-09-09",
        state: { promptCount: RETURN_REMINDER_MAX_PROMPT_COUNT, lastPromptDate: "2026-09-08" },
      }),
      false,
      "예산을 다 썼으면 미응답이어도 종결한다",
    );
  });
});
