// 복귀 리마인드(D1 재방문) 푸시 동의 유도 정책 단위 테스트
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  applyReturnReminderOutcome,
  buildReturnReminderPromptParams,
  buildReturnReminderResultParams,
  initialReturnReminderState,
  isReturnReminderConfigErrorCode,
  isReturnReminderResolved,
  mapNotificationAgreementResult,
  markReturnReminderPrompted,
  RETURN_REMINDER_MAX_PROMPT_COUNT,
  RETURN_REMINDER_PROMPT_EVENT,
  RETURN_REMINDER_RESULT_EVENT,
  shouldPromptReturnReminder,
  summarizeAgreementError,
  summarizeAgreementFailure,
  extractAgreementErrorCode,
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
      outcome: "error",
      prompt_count: 1,
      error_reason: "E_TIMEOUT_BRIDGE",
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
      outcome: "error",
      prompt_count: 1,
      error_reason: "E_UNSUPPORTED: no bridge",
      error_code: "E_UNSUPPORTED",
    });
  });

  it("applyReturnReminderOutcome은 error에서만 errorCode를 보존한다 (#288)", () => {
    const withCode = applyReturnReminderOutcome(
      { promptCount: 1 },
      "error",
      "E_X: msg",
      "E_X",
    );
    assert.equal(withCode.errorCode, "E_X");
    // 다른 결과로 넘어가면 이전 코드가 남지 않는다.
    const agreed = applyReturnReminderOutcome(withCode, "agreed");
    assert.equal(agreed.errorCode, undefined);
    // error여도 코드가 없으면 비운다.
    const noCode = applyReturnReminderOutcome(withCode, "error", "msg");
    assert.equal(noCode.errorCode, undefined);
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

  it("templateCodeSource를 주면 결과 파라미터에 template_code_source를 적재한다 (#319)", () => {
    const state: ReturnReminderState = { promptCount: 1, outcome: "agreed" };
    assert.deepEqual(buildReturnReminderResultParams(state, "env"), {
      outcome: "agreed",
      prompt_count: 1,
      template_code_source: "env",
    });
    assert.deepEqual(buildReturnReminderResultParams(state, "default"), {
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
      { trigger: "mission_complete", template_code_source: "env" },
    );
    assert.deepEqual(
      buildReturnReminderPromptParams("mission_complete", "default"),
      { trigger: "mission_complete", template_code_source: "default" },
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
      summarizeAgreementFailure({ code: "E_UNSUPPORTED", message: "no bridge" }),
      { reason: "E_UNSUPPORTED: no bridge", code: "E_UNSUPPORTED" },
    );
  });

  it("Error 인스턴스는 message만 요약하고 code는 생략한다", () => {
    assert.deepEqual(
      summarizeAgreementFailure(new Error("bridge disconnected")),
      { reason: "bridge disconnected" },
    );
    assert.equal(
      extractAgreementErrorCode(new Error("bridge disconnected")),
      undefined,
    );
  });

  it("문자열은 reason만 남기고 code는 생략한다", () => {
    assert.deepEqual(summarizeAgreementFailure("알림 동의에 실패하였습니다."), {
      reason: "알림 동의에 실패하였습니다.",
    });
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
});
