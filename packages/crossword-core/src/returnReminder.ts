// 오늘의 퍼즐 복귀 리마인드(D1 재방문) 푸시 동의 유도 정책.
//
// "언제, 몇 번 알림 동의를 요청할지"의 결정 로직만 코어에 두어 3개 시장
// (AIT/Web, Android, iOS)이 동일한 사용자 정책으로 동작하게 한다. 실제 동의
// 요청(시장별 알림 SDK 호출)은 어댑터에 분리한다. AIT/Web은
// `@apps-in-toss/web-framework`의 `requestNotificationAgreement`로 스마트발송
// 캠페인 동의를 받고, 다음날 "오늘의 퍼즐" 리마인드를 서버(스마트발송)가 발송한다.

// AIT 알림 동의 결과 원문(@apps-in-toss):
//   newAgreement | alreadyAgreed | agreementRejected
export type NotificationAgreementResultType =
  | "newAgreement"
  | "alreadyAgreed"
  | "agreementRejected";

// 코어가 다루는 동의 결과. unsupported는 알림 SDK 미지원(로컬 브라우저/QR
// 샌드박스), error는 일시적 호출 오류.
export type ReturnReminderOutcome =
  | "agreed"
  | "rejected"
  | "unsupported"
  | "error";

export type ReturnReminderState = {
  // 동의 유도(알림 동의 화면 노출)를 시도한 횟수.
  promptCount: number;
  // 마지막으로 동의를 유도한 날짜(YYYY-MM-DD, Asia/Seoul 기준 todayKey).
  lastPromptDate?: string;
  // 직전 동의 결과.
  outcome?: ReturnReminderOutcome;
};

export const RETURN_REMINDER_PROMPT_EVENT = "return_reminder_prompt";
export const RETURN_REMINDER_RESULT_EVENT = "return_reminder_result";

export const initialReturnReminderState: ReturnReminderState = {
  promptCount: 0,
};

// 다시 물어볼 필요가 없는(종결된) 동의 상태. error는 일시 오류로 보고 종결로
// 치지 않는다(횟수 가드로만 재유도를 막는다).
const RESOLVED_OUTCOMES: ReadonlySet<ReturnReminderOutcome> = new Set([
  "agreed",
  "rejected",
  "unsupported",
]);

export function isReturnReminderResolved(state: ReturnReminderState): boolean {
  return state.outcome != null && RESOLVED_OUTCOMES.has(state.outcome);
}

export type ShouldPromptReturnReminderInput = {
  enabled: boolean;
  state: ReturnReminderState;
};

// 완료 직후(고관여 시점)에 최대 1회만 푸시 동의를 유도한다.
// - enabled=false면 절대 노출하지 않는다(원격 설정/시장 게이트).
// - 이미 동의/거부/미지원으로 종결됐으면 다시 묻지 않는다.
// - 이미 한 번이라도 유도했으면(promptCount>0) 자동 재유도하지 않는다.
export function shouldPromptReturnReminder({
  enabled,
  state,
}: ShouldPromptReturnReminderInput): boolean {
  if (!enabled) {
    return false;
  }
  if (state.promptCount > 0) {
    return false;
  }
  return !isReturnReminderResolved(state);
}

// AIT 알림 동의 결과(원문)를 코어 outcome으로 매핑한다.
export function mapNotificationAgreementResult(
  type: NotificationAgreementResultType,
): ReturnReminderOutcome {
  switch (type) {
    case "newAgreement":
    case "alreadyAgreed":
      return "agreed";
    case "agreementRejected":
      return "rejected";
  }
}

// 동의 유도 1회 반영: 횟수 증가 + 유도 날짜 기록. outcome은 결과 콜백에서 별도 반영.
export function markReturnReminderPrompted(
  state: ReturnReminderState,
  promptDate: string,
): ReturnReminderState {
  return {
    ...state,
    promptCount: state.promptCount + 1,
    lastPromptDate: promptDate,
  };
}

export function applyReturnReminderOutcome(
  state: ReturnReminderState,
  outcome: ReturnReminderOutcome,
): ReturnReminderState {
  return { ...state, outcome };
}

// return_reminder_result 이벤트 파라미터(영문 키 유지).
export function buildReturnReminderResultParams(state: ReturnReminderState): {
  outcome: ReturnReminderOutcome;
  prompt_count: number;
} {
  return {
    outcome: state.outcome ?? "error",
    prompt_count: state.promptCount,
  };
}
