// AIT 푸시 알림 동의(스마트발송) 어댑터.
// `requestNotificationAgreement`는 콜백 기반이라 Promise로 감싸고, 결정 로직은
// 코어(returnReminder)에 위임한다. 로컬 브라우저/QR 샌드박스 등 미지원 환경에서는
// "unsupported"로 폴백해 퍼즐 플레이를 절대 막지 않는다.
import { requestNotificationAgreement } from "@apps-in-toss/web-framework";
import {
  mapNotificationAgreementResult,
  summarizeAgreementFailure,
  type ReturnReminderFailureMetadata,
  type ReturnReminderFailureStage,
  type ReturnReminderOutcome,
  type ReturnReminderTemplateCodeSource,
} from "../../packages/crossword-core/src/returnReminder.ts";

// 동의 요청 결과. outcome이 error일 때 errorReason, errorCode(없으면 unmapped),
// errorShape(최상위 키 이름만)를 함께 준다. timeout은 안전망 타이머가 종료시킨 경우다.
export type ReturnReminderAgreementResult = {
  outcome: ReturnReminderOutcome;
  errorReason?: string;
  errorCode?: string;
  errorWrapperCode?: string;
  errorShape?: string;
  failureStage?: ReturnReminderFailureStage;
};

// 앱인토스 콘솔 > 미니앱 > 스마트발송에서 알림 동의문·기능성 캠페인을 만들고 검수
// 승인을 받으면 발급되는 "오늘의 퍼즐" 복귀 리마인드 템플릿 코드의 기본값(현행 슬러그).
// 콘솔 발급 코드가 이와 다르면 SDK가 요청을 거절하므로(#288), 빌드 환경변수
// VITE_RETURN_REMINDER_TEMPLATE_CODE로 실제 발급 코드를 주입해 덮어쓴다. 절차는 README 참고.
export const DEFAULT_RETURN_REMINDER_TEMPLATE_CODE = "crossword-daily-reminder";

// 주입된 코드 문자열을 정규화해 실제 사용할 템플릿 코드를 고른다. 트림 후 비어있으면
// 기본값으로 폴백한다. 환경변수 주입/미주입 두 분기를 모두 헤드리스로 검증할 수 있도록
// import.meta.env 접근과 분리한 순수 함수다(#288).
export function pickReturnReminderTemplateCode(configured?: string): string {
  const trimmed = configured?.trim();
  return trimmed != null && trimmed !== ""
    ? trimmed
    : DEFAULT_RETURN_REMINDER_TEMPLATE_CODE;
}

// 빌드타임 환경변수 우선, 미설정 시 기본값. node 테스트 등 import.meta.env 부재 환경
// 에서도 안전하게 기본값으로 폴백한다(옵셔널 체이닝).
export function resolveReturnReminderTemplateCode(): string {
  const env = import.meta.env as ImportMetaEnv | undefined;
  return pickReturnReminderTemplateCode(
    env?.VITE_RETURN_REMINDER_TEMPLATE_CODE,
  );
}

// 현재 빌드에 적용된 템플릿 코드(환경변수 또는 기본값).
export const RETURN_REMINDER_TEMPLATE_CODE =
  resolveReturnReminderTemplateCode();

// 주입된 코드 문자열로부터 템플릿 코드 출처(env/default)를 판정한다. pick~와 동일한
// 트림 규칙을 써서 "실제로 env 코드가 쓰였는가"와 일관되게 한다. 순수 함수로 두어
// 헤드리스로 검증한다(#319).
export function pickReturnReminderTemplateCodeSource(
  configured?: string,
): ReturnReminderTemplateCodeSource {
  const trimmed = configured?.trim();
  return trimmed != null && trimmed !== "" ? "env" : "default";
}

// 빌드타임 환경변수 주입 여부로 출처를 해석한다(import.meta.env 부재 시 default).
export function resolveReturnReminderTemplateCodeSource(): ReturnReminderTemplateCodeSource {
  const env = import.meta.env as ImportMetaEnv | undefined;
  return pickReturnReminderTemplateCodeSource(
    env?.VITE_RETURN_REMINDER_TEMPLATE_CODE,
  );
}

// 현재 빌드에 적용된 템플릿 코드의 출처. 프롬프트/결과 이벤트에 적재한다(#319).
export const RETURN_REMINDER_TEMPLATE_CODE_SOURCE =
  resolveReturnReminderTemplateCodeSource();

// 동의 다이얼로그 콜백이 전혀 돌아오지 않는(브리지 미연결) 상황에서 Promise가
// 영원히 미해결로 남지 않도록 두는 안전망.
const AGREEMENT_TIMEOUT_MS = 120000;

// SDK 호출부·타임아웃을 주입 가능하게 두어 결과 분기(동의/거부/미지원/error/
// timeout)를 SDK 없이 단위 테스트로 고정한다(#253). 기본값은 실제 AIT SDK와
// 120초 안전망이다.
export function requestReturnReminderAgreement(
  requestAgreement: typeof requestNotificationAgreement = requestNotificationAgreement,
  timeoutMs: number = AGREEMENT_TIMEOUT_MS,
): Promise<ReturnReminderAgreementResult> {
  return new Promise((resolve) => {
    let settled = false;
    let cleanup: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined = undefined;

    const finish = (
      outcome: ReturnReminderOutcome,
      metadata: ReturnReminderFailureMetadata = {},
    ) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer != null) {
        clearTimeout(timer);
      }
      try {
        cleanup?.();
      } catch {
        // cleanup 실패는 무시한다.
      }
      const result: ReturnReminderAgreementResult = { outcome };
      if (metadata.errorReason != null) {
        result.errorReason = metadata.errorReason;
      }
      if (metadata.errorCode != null) {
        result.errorCode = metadata.errorCode;
      }
      if (metadata.errorWrapperCode != null) {
        result.errorWrapperCode = metadata.errorWrapperCode;
      }
      if (metadata.errorShape != null) {
        result.errorShape = metadata.errorShape;
      }
      if (metadata.failureStage != null) {
        result.failureStage = metadata.failureStage;
      }
      resolve(result);
    };

    try {
      cleanup = requestAgreement({
        options: { templateCode: RETURN_REMINDER_TEMPLATE_CODE },
        onEvent: (result) => {
          const outcome = mapNotificationAgreementResult(result.type);
          if (outcome !== "error") {
            finish(outcome);
            return;
          }
          const { reason, code, wrapperCode, shape } =
            summarizeAgreementFailure(result);
          finish("error", {
            errorReason: reason,
            errorCode: code,
            errorWrapperCode: wrapperCode,
            errorShape: shape,
            failureStage: "sdk_callback",
          });
        },
        // SDK onError(일시 오류): 에러 정보를 error_reason 요약과 error_code로 남긴다.
        onError: (error: unknown) => {
          const { reason, code, wrapperCode, shape } =
            summarizeAgreementFailure(error);
          finish("error", {
            errorReason: reason,
            errorCode: code,
            errorWrapperCode: wrapperCode,
            errorShape: shape,
            failureStage: "sdk_callback",
          });
        },
      });
    } catch {
      // 미지원 환경(로컬 브라우저 등)에서는 동기 throw가 날 수 있다.
      finish("unsupported", { failureStage: "preflight" });
      return;
    }

    // 콜백이 끝내 돌아오지 않는(브리지 미연결) 경우의 안전망. onError와 구분해
    // timeout으로 기록한다. 콜백이 이미 동기적으로 결과를 확정했다면(settled)
    // 타이머를 걸지 않아 불필요한 대기·핸들 누수를 막는다.
    if (!settled) {
      timer = setTimeout(
        () => finish("timeout", { failureStage: "timeout" }),
        timeoutMs,
      );
    }
  });
}
