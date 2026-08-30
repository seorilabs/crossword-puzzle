// 오늘의 퍼즐 복귀 리마인드(D1 재방문) 푸시 동의 유도 정책.
//
// "언제, 몇 번 알림 동의를 요청할지"의 결정 로직만 코어에 두어 3개 시장
// (AIT/Web, Android, iOS)이 동일한 사용자 정책으로 동작하게 한다. 실제 동의
// 요청(시장별 알림 SDK 호출)은 어댑터에 분리한다. AIT/Web은
// `@apps-in-toss/web-framework`로 스마트발송 캠페인 동의를 받고 서버가 발송한다.
// Android/iOS는 RN adapter가 OS 권한을 받고 다음 날 로컬 알림 한 건을 예약한다.

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

// 실패가 발생한 실행 단계. SDK 호출 전 동기 실패(preflight), SDK 오류 콜백
// (sdk_callback), 콜백 무응답 안전망(timeout)을 구분해 운영 원인을 좁힌다.
export type ReturnReminderFailureStage =
  | "preflight"
  | "sdk_callback"
  | "timeout";

export type ReturnReminderFailureMetadata = {
  errorReason?: string;
  errorCode?: string;
  errorWrapperCode?: string;
  errorShape?: string;
  failureStage?: ReturnReminderFailureStage;
};

export type ReturnReminderState = {
  // 동의 유도(알림 동의 화면 노출)를 시도한 횟수.
  promptCount: number;
  // 마지막으로 동의를 유도한 날짜(YYYY-MM-DD, Asia/Seoul 기준 todayKey).
  lastPromptDate?: string;
  // 직전 동의 결과.
  outcome?: ReturnReminderOutcome;
  // outcome이 error일 때 SDK가 준 에러 요약(≤100자). 다른 결과에서는 비운다(#253).
  errorReason?: string;
  // outcome이 error일 때 SDK가 준 구조화 에러 코드(code/status, ≤100자). 서버 거절
  // 사유(요청 자체 거절)를 사람이 읽는 errorReason과 별개로 식별한다(#288).
  errorCode?: string;
  // 중첩 오류의 가장 구체적인 errorCode와 다른 최상위 래퍼 코드.
  errorWrapperCode?: string;
  // 구조화 코드를 찾지 못한 오류의 최상위 키 이름 목록. 값은 저장하지 않는다.
  errorShape?: string;
  // 실패가 발생한 실행 단계. 기존 저장값에는 없을 수 있어 선택 필드로 유지한다.
  failureStage?: ReturnReminderFailureStage;
};

export const RETURN_REMINDER_PROMPT_EVENT = "return_reminder_prompt";
export const RETURN_REMINDER_RESULT_EVENT = "return_reminder_result";
export const RETURN_REMINDER_OPENED_EVENT = "notification_opened";
export const RETURN_REMINDER_MAX_PROMPT_COUNT = 3;

export type ReturnReminderChannel = "ait" | "local";

export const RETURN_REMINDER_LOCAL_HOUR_KST = 9;

export type LocalReturnReminderSchedule = {
  reminderDate: string;
  timestamp: number;
};

// RN 로컬 알림은 완료일 다음 날 오전 9시(Asia/Seoul)에 1회 예약한다. 입력은
// 기존 getTodayDateKey와 같은 YYYY-MM-DD 계약이며, 잘못된 날짜는 SDK에 넘기지
// 않도록 null로 거절한다. 09:00 KST는 UTC 자정이라 DST가 없는 한국 시간대에서
// 결정적으로 계산할 수 있다.
export function getNextLocalReturnReminderSchedule(
  promptDate: string,
  hourKst: number = RETURN_REMINDER_LOCAL_HOUR_KST,
): LocalReturnReminderSchedule | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(promptDate);
  if (
    match == null ||
    !Number.isInteger(hourKst) ||
    hourKst < 0 ||
    hourKst > 23
  ) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day
  ) {
    return null;
  }

  const reminderDateValue = new Date(Date.UTC(year, month - 1, day + 1));
  const reminderDate = reminderDateValue.toISOString().slice(0, 10);
  const timestamp = Date.UTC(year, month - 1, day + 1, hourKst - 9);
  return { reminderDate, timestamp };
}

// 프롬프트/결과 이벤트에 실제 사용된 템플릿 코드의 출처. 환경변수(VITE_RETURN_
// REMINDER_TEMPLATE_CODE) 주입값이면 "env", 미주입 폴백이면 "default". 프로덕션이
// 어떤 코드로 나갔는지를 데이터로 구분하기 위함이다(#319).
export type ReturnReminderTemplateCodeSource = "env" | "default";

// 배포 설정 오류(콘솔 미발급 템플릿 코드 등)로 서버가 요청 자체를 거절할 때 SDK가
// 주는 error_code. 이 실패는 유저 노출·일시 오류가 아니라 배포 문제이므로 재유도
// 예산(promptCount 상한)을 소진시키지 않는다 — 설정이 고쳐지면 상한과 무관하게 다시
// 유도되어야 한다(#319). 같은 날 반복 노출은 날짜 가드가 계속 막는다.
export const RETURN_REMINDER_CONFIG_ERROR_CODES: ReadonlySet<string> = new Set([
  "4000",
]);

// error_code가 배포 설정 오류 코드인지 판정한다(트림 후 대조). 순수 함수라 core에
// 두고 단위 테스트로 고정한다(#319).
export function isReturnReminderConfigErrorCode(errorCode?: string): boolean {
  if (errorCode == null) {
    return false;
  }
  return RETURN_REMINDER_CONFIG_ERROR_CODES.has(errorCode.trim());
}

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
const ERROR_SHAPE_MAX_LENGTH = 100;
const AGREEMENT_ERROR_MAX_DEPTH = 3;
const AGREEMENT_ERROR_CONTAINER_KEYS = [
  "cause",
  "data",
  "error",
  "reason",
  "response",
  "details",
] as const;
const AGREEMENT_ERROR_CODE_KEYS = [
  "code",
  "status",
  "statusCode",
  "errorCode",
] as const;
const AGREEMENT_ERROR_MESSAGE_KEYS = [
  "message",
  "reason",
  "detail",
  "description",
  "errorMessage",
] as const;

type AgreementErrorCandidate = {
  depth: number;
  order: number;
  code?: string;
  message?: string;
};

function normalizeAgreementErrorText(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (
    value == null ||
    (typeof value === "object" && value !== null) ||
    typeof value === "function"
  ) {
    return undefined;
  }
  let raw: string;
  try {
    raw = String(value);
  } catch {
    return undefined;
  }
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length === 0) {
    return undefined;
  }
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function readAgreementErrorField(value: object, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function summarizeAgreementErrorShape(error: unknown): string {
  if (error === null) {
    return "type:null";
  }
  if (typeof error !== "object") {
    return `type:${typeof error}`;
  }

  let keys: string[];
  try {
    keys = Object.getOwnPropertyNames(error).sort();
  } catch {
    return "uninspectable";
  }
  const shape = keys.length === 0 ? "no_keys" : keys.join(",");
  return shape.slice(0, ERROR_SHAPE_MAX_LENGTH);
}

function firstAgreementErrorText(
  value: object,
  keys: readonly string[],
  maxLength: number,
): string | undefined {
  for (const key of keys) {
    const candidate = normalizeAgreementErrorText(
      readAgreementErrorField(value, key),
      maxLength,
    );
    if (candidate != null) {
      return candidate;
    }
  }
  return undefined;
}

function inspectAgreementError(
  error: unknown,
  maxLength: number,
): AgreementErrorSummary {
  const candidates: AgreementErrorCandidate[] = [];
  const visited = new WeakSet<object>();
  let order = 0;

  const visit = (value: unknown, depth: number): void => {
    if (value == null) {
      return;
    }
    if (typeof value !== "object") {
      const message = normalizeAgreementErrorText(value, maxLength);
      if (message != null) {
        candidates.push({ depth, order: order++, message });
      }
      return;
    }
    if (visited.has(value)) {
      return;
    }
    visited.add(value);

    const code = firstAgreementErrorText(
      value,
      AGREEMENT_ERROR_CODE_KEYS,
      maxLength,
    );
    const message = firstAgreementErrorText(
      value,
      AGREEMENT_ERROR_MESSAGE_KEYS,
      maxLength,
    );
    candidates.push({ depth, order: order++, code, message });

    if (depth >= AGREEMENT_ERROR_MAX_DEPTH) {
      return;
    }
    for (const key of AGREEMENT_ERROR_CONTAINER_KEYS) {
      const nested = readAgreementErrorField(value, key);
      if (nested != null && nested !== value) {
        visit(nested, depth + 1);
      }
    }
  };

  visit(error, 0);

  const codeCandidates = candidates.filter(
    (candidate) => candidate.code != null,
  );
  const codeCandidate = codeCandidates.reduce<
    AgreementErrorCandidate | undefined
  >(
    (selected, candidate) =>
      selected == null || candidate.depth > selected.depth
        ? candidate
        : selected,
    undefined,
  );
  const wrapperCandidate = codeCandidates.reduce<
    AgreementErrorCandidate | undefined
  >(
    (selected, candidate) =>
      selected == null ||
      candidate.depth < selected.depth ||
      (candidate.depth === selected.depth && candidate.order < selected.order)
        ? candidate
        : selected,
    undefined,
  );
  const messageCandidate =
    (codeCandidate?.message != null ? codeCandidate : undefined) ??
    candidates.reduce<AgreementErrorCandidate | undefined>(
      (selected, candidate) =>
        candidate.message != null &&
        (selected == null || candidate.depth > selected.depth)
          ? candidate
          : selected,
      undefined,
    );

  const parts = [codeCandidate?.code, messageCandidate?.message].filter(
    (part, index, values): part is string =>
      part != null && part !== "" && values.indexOf(part) === index,
  );
  let reason = parts.join(": ");
  if (reason === "" && error != null && typeof error === "object") {
    try {
      reason = String(error);
    } catch {
      reason = "unknown";
    }
  }
  reason = reason.replace(/\s+/g, " ").trim() || "unknown";
  if (reason.length > maxLength) {
    reason = reason.slice(0, maxLength);
  }

  const code = codeCandidate?.code ?? "unmapped";
  const wrapperCode =
    codeCandidate != null &&
    wrapperCandidate?.code != null &&
    wrapperCandidate.depth < codeCandidate.depth &&
    wrapperCandidate.code !== code
      ? wrapperCandidate.code
      : undefined;
  return {
    reason,
    code,
    ...(wrapperCode == null ? {} : { wrapperCode }),
    ...(codeCandidate == null
      ? { shape: summarizeAgreementErrorShape(error) }
      : {}),
  };
}

// SDK onError가 전달하는 임의 에러 값을 error_reason 파라미터용 문자열(≤100자)로
// 요약한다. 코드/메시지를 우선 뽑고, 개행·연속 공백을 접어 한 줄로 만든다. 순수
// 함수라 core에 두고 단위 테스트로 고정한다(#253).
export function summarizeAgreementError(
  error: unknown,
  maxLength: number = ERROR_REASON_MAX_LENGTH,
): string {
  return inspectAgreementError(error, maxLength).reason;
}

// SDK onError가 구조화 필드(code/status)를 준 경우 이를 error_code용 문자열로 보존한다.
// error_reason(사람이 읽는 요약)과 별개로, 서버 거절 사유를 코드로 식별하기 위함이다(#288).
// 구조화 코드가 없으면(문자열/일반 Error 등) unmapped를 돌려 결측을 막는다.
export function extractAgreementErrorCode(
  error: unknown,
  maxLength: number = ERROR_REASON_MAX_LENGTH,
): string {
  return inspectAgreementError(error, maxLength).code;
}

// error_reason(요약 문자열), error_code(구조화 코드 또는 unmapped), error_shape(코드
// 미매핑 시 최상위 키 이름만)를 함께 산출한다. 값은 shape에 넣지 않는다(#288, #339).
export type AgreementErrorSummary = {
  reason: string;
  code: string;
  wrapperCode?: string;
  shape?: string;
};

export function summarizeAgreementFailure(
  error: unknown,
  maxLength: number = ERROR_REASON_MAX_LENGTH,
): AgreementErrorSummary {
  return inspectAgreementError(error, maxLength);
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
// - 총 유도 상한에 도달하면 일시 실패여도 다시 묻지 않는다. 단, 배포 설정 오류
//   (config error_code)로 인한 실패는 예산을 소진하지 않아 상한 가드를 건너뛴다(#319).
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
  // 배포 설정 오류로 인한 직전 실패는 상한 가드를 건너뛴다(예산 미소진). 같은 날
  // 반복 노출은 아래 날짜 가드가 계속 막으므로 하루 1회로 제한된다(#319).
  const lastWasConfigError =
    state.outcome === "error" &&
    isReturnReminderConfigErrorCode(state.errorCode);
  if (
    !lastWasConfigError &&
    state.promptCount >= RETURN_REMINDER_MAX_PROMPT_COUNT
  ) {
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
  type: NotificationAgreementResultType | string,
): ReturnReminderOutcome {
  switch (type) {
    case "newAgreement":
    case "alreadyAgreed":
      return "agreed";
    case "agreementRejected":
      return "rejected";
    default:
      return "error";
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
  metadata: ReturnReminderFailureMetadata = {},
): ReturnReminderState {
  const next: ReturnReminderState = { ...state, outcome };
  // 오류 상세는 error 결과에서만 의미가 있다. 성공·거부·다른 실패로 넘어가면
  // 이전 SDK 오류 정보가 남지 않도록 항상 비운다.
  if (
    outcome === "error" &&
    metadata.errorReason != null &&
    metadata.errorReason !== ""
  ) {
    next.errorReason = metadata.errorReason;
  } else {
    delete next.errorReason;
  }
  if (
    outcome === "error" &&
    metadata.errorCode != null &&
    metadata.errorCode !== ""
  ) {
    next.errorCode = metadata.errorCode;
  } else {
    delete next.errorCode;
  }
  if (
    outcome === "error" &&
    metadata.errorWrapperCode != null &&
    metadata.errorWrapperCode !== ""
  ) {
    next.errorWrapperCode = metadata.errorWrapperCode;
  } else {
    delete next.errorWrapperCode;
  }
  if (
    outcome === "error" &&
    metadata.errorCode === "unmapped" &&
    metadata.errorShape != null &&
    metadata.errorShape !== ""
  ) {
    next.errorShape = metadata.errorShape;
  } else {
    delete next.errorShape;
  }
  if (
    (outcome === "error" ||
      outcome === "timeout" ||
      outcome === "unsupported") &&
    metadata.failureStage != null
  ) {
    next.failureStage = metadata.failureStage;
  } else {
    delete next.failureStage;
  }
  return next;
}

// return_reminder_prompt 이벤트 파라미터(영문 키 유지). 프로덕션이 어떤 템플릿 코드
// 출처(env/default)로 나갔는지 프롬프트 시점에도 남긴다(#319).
export function buildReturnReminderPromptParams(
  trigger: string,
  templateCodeSource?: ReturnReminderTemplateCodeSource,
  channel: ReturnReminderChannel = "ait",
): {
  trigger: string;
  channel: ReturnReminderChannel;
  template_code_source?: ReturnReminderTemplateCodeSource;
} {
  return {
    trigger,
    channel,
    ...(templateCodeSource == null
      ? {}
      : { template_code_source: templateCodeSource }),
  };
}

// return_reminder_result 이벤트 파라미터(영문 키 유지). error 결과에 요약, 코드,
// 미매핑 shape와 실패 단계를 덧붙여 원인 결측을 막는다. templateCodeSource를 주면
// 실제 사용된 템플릿 코드 출처(env/default)를 결과에도 남긴다(#319, #339).
export function buildReturnReminderResultParams(
  state: ReturnReminderState,
  templateCodeSource?: ReturnReminderTemplateCodeSource,
  channel: ReturnReminderChannel = "ait",
): {
  channel: ReturnReminderChannel;
  outcome: ReturnReminderOutcome;
  prompt_count: number;
  template_code_source?: ReturnReminderTemplateCodeSource;
  error_reason?: string;
  error_code?: string;
  error_wrapper_code?: string;
  error_shape?: string;
  stage?: ReturnReminderFailureStage;
} {
  const params: {
    channel: ReturnReminderChannel;
    outcome: ReturnReminderOutcome;
    prompt_count: number;
    template_code_source?: ReturnReminderTemplateCodeSource;
    error_reason?: string;
    error_code?: string;
    error_wrapper_code?: string;
    error_shape?: string;
    stage?: ReturnReminderFailureStage;
  } = {
    channel,
    outcome: state.outcome ?? "error",
    prompt_count: state.promptCount,
  };
  if (templateCodeSource != null) {
    params.template_code_source = templateCodeSource;
  }
  if (state.errorReason != null && state.errorReason !== "") {
    params.error_reason = state.errorReason;
  }
  if (state.errorCode != null && state.errorCode !== "") {
    params.error_code = state.errorCode;
  }
  if (state.errorWrapperCode != null && state.errorWrapperCode !== "") {
    params.error_wrapper_code = state.errorWrapperCode;
  }
  if (
    state.errorCode === "unmapped" &&
    state.errorShape != null &&
    state.errorShape !== ""
  ) {
    params.error_shape = state.errorShape;
  }
  if (state.failureStage != null) {
    params.stage = state.failureStage;
  } else if (params.outcome === "error") {
    // 구버전 저장 상태나 방어적 error 폴백도 stage 결측 없이 관측한다.
    params.stage = "sdk_callback";
  }
  return params;
}
