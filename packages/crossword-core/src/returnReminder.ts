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
// 샌드박스), error는 SDK onError(일시적 호출 오류), timeout은 콜백이 끝내
// 돌아오지 않아 안전망 타이머가 종료시킨 경우(브리지 미연결 추정)다. error와
// timeout을 나눠, 실패 원인(SDK 오류 vs 무응답)을 데이터로 구분한다(#253).
export type ReturnReminderOutcome =
  | "agreed"
  | "rejected"
  | "unsupported"
  | "error"
  | "timeout";

export type ReturnReminderState = {
  // 동의 유도(알림 동의 화면 노출)를 시도한 횟수.
  promptCount: number;
  // 마지막으로 동의를 유도한 날짜(YYYY-MM-DD, Asia/Seoul 기준 todayKey).
  lastPromptDate?: string;
  // 직전 동의 결과.
  outcome?: ReturnReminderOutcome;
  // outcome이 error일 때 SDK가 준 에러 요약(≤100자). 다른 결과에서는 비운다(#253).
  errorReason?: string;
};

export const RETURN_REMINDER_PROMPT_EVENT = "return_reminder_prompt";
export const RETURN_REMINDER_RESULT_EVENT = "return_reminder_result";
export const RETURN_REMINDER_MAX_PROMPT_COUNT = 3;

export const initialReturnReminderState: ReturnReminderState = {
  promptCount: 0,
};

// 다시 물어볼 필요가 없는(종결된) 동의 상태. error·timeout은 일시 실패로 보고
// 종결로 치지 않는다(횟수 가드로만 재유도를 막는다).
const RESOLVED_OUTCOMES: ReadonlySet<ReturnReminderOutcome> = new Set([
  "agreed",
  "rejected",
  "unsupported",
]);

// error_reason 요약 최대 길이(이벤트 파라미터 안전 상한).
const ERROR_REASON_MAX_LENGTH = 100;

// SDK onError가 전달하는 임의 에러 값을 error_reason 파라미터용 문자열(≤100자)로
// 요약한다. 코드/메시지를 우선 뽑고, 개행·연속 공백을 접어 한 줄로 만든다. 순수
// 함수라 core에 두고 단위 테스트로 고정한다(#253).
export function summarizeAgreementError(
  error: unknown,
  maxLength: number = ERROR_REASON_MAX_LENGTH,
): string {
  let raw: string;
  if (error == null) {
    raw = "unknown";
  } else if (typeof error === "string") {
    raw = error;
  } else if (error instanceof Error) {
    raw = error.message || error.name || "Error";
  } else if (typeof error === "object") {
    const record = error as { code?: unknown; message?: unknown };
    const parts = [record.code, record.message]
      .filter((part) => part != null && part !== "")
      .map((part) => String(part));
    raw = parts.length > 0 ? parts.join(": ") : String(error);
  } else {
    raw = String(error);
  }

  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length === 0) {
    return "unknown";
  }
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function isReturnReminderResolved(state: ReturnReminderState): boolean {
  return state.outcome != null && RESOLVED_OUTCOMES.has(state.outcome);
}

export type ShouldPromptReturnReminderInput = {
  enabled: boolean;
  promptDate: string;
  state: ReturnReminderState;
};

// 완료 직후(고관여 시점)에 최대 3회까지 푸시 동의를 유도한다.
// - enabled=false면 절대 노출하지 않는다(원격 설정/시장 게이트).
// - 이미 동의/거부/미지원으로 종결됐으면 다시 묻지 않는다.
// - error/timeout은 익일에만 재유도하고, 같은 날에는 다시 묻지 않는다.
// - 총 유도 상한에 도달하면 일시 실패여도 다시 묻지 않는다.
export function shouldPromptReturnReminder({
  enabled,
  promptDate,
  state,
}: ShouldPromptReturnReminderInput): boolean {
  if (!enabled) {
    return false;
  }
  if (isReturnReminderResolved(state)) {
    return false;
  }
  if (state.promptCount >= RETURN_REMINDER_MAX_PROMPT_COUNT) {
    return false;
  }
  if (state.promptCount === 0) {
    return true;
  }
  if (state.outcome !== "error" && state.outcome !== "timeout") {
    return false;
  }
  return state.lastPromptDate != null && state.lastPromptDate !== promptDate;
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
  errorReason?: string,
): ReturnReminderState {
  const next: ReturnReminderState = { ...state, outcome };
  // errorReason은 error 결과에서만 의미가 있다. 다른 결과로 넘어가면 이전 오류
  // 요약이 남지 않도록 항상 비운다.
  if (outcome === "error" && errorReason != null && errorReason !== "") {
    next.errorReason = errorReason;
  } else {
    delete next.errorReason;
  }
  return next;
}

// return_reminder_result 이벤트 파라미터(영문 키 유지). error 결과에 요약이 있으면
// error_reason을 덧붙여 실패 원인을 데이터로 남긴다(#253).
export function buildReturnReminderResultParams(state: ReturnReminderState): {
  outcome: ReturnReminderOutcome;
  prompt_count: number;
  error_reason?: string;
} {
  const params: {
    outcome: ReturnReminderOutcome;
    prompt_count: number;
    error_reason?: string;
  } = {
    outcome: state.outcome ?? "error",
    prompt_count: state.promptCount,
  };
  if (state.errorReason != null && state.errorReason !== "") {
    params.error_reason = state.errorReason;
  }
  return params;
}
