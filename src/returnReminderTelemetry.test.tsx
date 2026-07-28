import { afterEach, describe, expect, it, vi } from "vitest";

// AC-3(#319) 행위 검증: return_reminder_prompt/return_reminder_result 두 이벤트
// emit이 실제 telemetry 파사드(compactTelemetryParams 포함)를 거쳐 sink
// (dispatchAnalytics)에 도달할 때, template_code_source가 두 이벤트 파라미터에
// 모두 실려 전달되는지 확인한다. telemetry 모듈을 목킹하지 않고 sink만 목킹해
// "계측을 검증한다면서 계측을 목킹하는" 순환을 피한다(historyOpenTelemetry 패턴).
const { dispatchMock } = vi.hoisted(() => ({ dispatchMock: vi.fn() }));

vi.mock("./adapters/analyticsSinks", () => ({
  dispatchAnalytics: dispatchMock,
}));

import { telemetry } from "./adapters/telemetry";
import { RETURN_REMINDER_TEMPLATE_CODE_SOURCE } from "./adapters/notificationAgreement";
import {
  applyReturnReminderOutcome,
  buildReturnReminderPromptParams,
  buildReturnReminderResultParams,
  markReturnReminderPrompted,
  RETURN_REMINDER_PROMPT_EVENT,
  RETURN_REMINDER_RESULT_EVENT,
} from "../packages/crossword-core/src";

afterEach(() => {
  dispatchMock.mockReset();
});

describe("복귀 리마인더 이벤트 template_code_source 배선 (#319)", () => {
  it("AC-3: prompt·result 두 이벤트 emit이 sink까지 template_code_source를 전달한다", () => {
    // App.tsx maybePromptReturnReminder의 emit 배선을 그대로 재현한다:
    // 프롬프트 노출 시 return_reminder_prompt, 결과 확정 시 return_reminder_result.
    const prompted = markReturnReminderPrompted(
      { promptCount: 0 },
      "2026-07-28",
    );
    telemetry.impression(
      RETURN_REMINDER_PROMPT_EVENT,
      buildReturnReminderPromptParams(
        "mission_complete",
        RETURN_REMINDER_TEMPLATE_CODE_SOURCE,
      ),
    );

    const resolved = applyReturnReminderOutcome(prompted, "agreed");
    telemetry.impression(
      RETURN_REMINDER_RESULT_EVENT,
      buildReturnReminderResultParams(
        resolved,
        RETURN_REMINDER_TEMPLATE_CODE_SOURCE,
      ),
    );

    const dispatched = dispatchMock.mock.calls.map((call) => call[0]);
    const promptEvent = dispatched.find(
      (event) => event.name === RETURN_REMINDER_PROMPT_EVENT,
    );
    const resultEvent = dispatched.find(
      (event) => event.name === RETURN_REMINDER_RESULT_EVENT,
    );

    // 두 이벤트 모두 sink에 도달했고, template_code_source가 compaction 후에도
    // 파라미터에 남아 두 이벤트에 실렸다.
    expect(promptEvent?.kind).toBe("impression");
    expect(resultEvent?.kind).toBe("impression");
    expect(promptEvent?.params.template_code_source).toBe(
      RETURN_REMINDER_TEMPLATE_CODE_SOURCE,
    );
    expect(resultEvent?.params.template_code_source).toBe(
      RETURN_REMINDER_TEMPLATE_CODE_SOURCE,
    );
    // 결과 이벤트는 outcome/prompt_count 계약도 함께 유지한다.
    expect(resultEvent?.params.outcome).toBe("agreed");
    expect(resultEvent?.params.prompt_count).toBe(1);
    // jsdom(import.meta.env의 VITE_RETURN_REMINDER_TEMPLATE_CODE 부재)에서는
    // 출처가 default로 해석된다.
    expect(RETURN_REMINDER_TEMPLATE_CODE_SOURCE).toBe("default");
  });
});
