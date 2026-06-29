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
  shouldPromptReturnReminder,
  type ReturnReminderState,
} from "./returnReminder.ts";

describe("returnReminder 정책", () => {
  it("비활성(enabled=false)이면 절대 유도하지 않는다", () => {
    assert.equal(
      shouldPromptReturnReminder({
        enabled: false,
        state: initialReturnReminderState,
      }),
      false,
    );
  });

  it("활성이고 아직 유도한 적 없으면 유도한다", () => {
    assert.equal(
      shouldPromptReturnReminder({
        enabled: true,
        state: initialReturnReminderState,
      }),
      true,
    );
  });

  it("이미 한 번 유도했으면(promptCount>0) 자동 재유도하지 않는다", () => {
    const state: ReturnReminderState = { promptCount: 1, outcome: "error" };
    assert.equal(shouldPromptReturnReminder({ enabled: true, state }), false);
  });

  it("동의/거부/미지원으로 종결되면 다시 묻지 않는다", () => {
    for (const outcome of ["agreed", "rejected", "unsupported"] as const) {
      const state: ReturnReminderState = { promptCount: 0, outcome };
      assert.equal(
        shouldPromptReturnReminder({ enabled: true, state }),
        false,
        `${outcome}는 종결 상태`,
      );
      assert.equal(isReturnReminderResolved(state), true);
    }
  });

  it("error는 종결로 보지 않는다(promptCount=0이면 재유도 가능)", () => {
    const state: ReturnReminderState = { promptCount: 0, outcome: "error" };
    assert.equal(isReturnReminderResolved(state), false);
    assert.equal(shouldPromptReturnReminder({ enabled: true, state }), true);
  });

  it("AIT 동의 결과 원문을 outcome으로 매핑한다", () => {
    assert.equal(mapNotificationAgreementResult("newAgreement"), "agreed");
    assert.equal(mapNotificationAgreementResult("alreadyAgreed"), "agreed");
    assert.equal(mapNotificationAgreementResult("agreementRejected"), "rejected");
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

  it("buildReturnReminderResultParams는 영문 키와 outcome/횟수를 담는다", () => {
    const state: ReturnReminderState = { promptCount: 2, outcome: "rejected" };
    assert.deepEqual(buildReturnReminderResultParams(state), {
      outcome: "rejected",
      prompt_count: 2,
    });
  });

  it("outcome 미정이면 결과 파라미터 outcome은 error로 채운다", () => {
    const state: ReturnReminderState = { promptCount: 1 };
    assert.equal(buildReturnReminderResultParams(state).outcome, "error");
  });
});
