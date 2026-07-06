// AIT 푸시 알림 동의(스마트발송) 어댑터.
// `requestNotificationAgreement`는 콜백 기반이라 Promise로 감싸고, 결정 로직은
// 코어(returnReminder)에 위임한다. 로컬 브라우저/QR 샌드박스 등 미지원 환경에서는
// "unsupported"로 폴백해 퍼즐 플레이를 절대 막지 않는다.
import { requestNotificationAgreement } from "@apps-in-toss/web-framework";
import {
  mapNotificationAgreementResult,
  summarizeAgreementError,
  type ReturnReminderOutcome,
} from "../../packages/crossword-core/src/returnReminder.ts";

// 동의 요청 결과. outcome이 error일 때만 errorReason(SDK 에러 요약, ≤100자)을
// 함께 준다(#253). timeout은 안전망 타이머가 종료시킨 경우다.
export type ReturnReminderAgreementResult = {
  outcome: ReturnReminderOutcome;
  errorReason?: string;
};

// 앱인토스 콘솔 > 미니앱 > 스마트발송에서 발급한 "오늘의 퍼즐" 복귀 리마인드
// 캠페인 템플릿 코드. 광고 그룹 ID(appsInTossAds.ts)와 동일하게 상수로 둔다.
export const RETURN_REMINDER_TEMPLATE_CODE = "crossword-daily-reminder";

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

    const finish = (outcome: ReturnReminderOutcome, errorReason?: string) => {
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
      resolve(errorReason == null ? { outcome } : { outcome, errorReason });
    };

    try {
      cleanup = requestAgreement({
        options: { templateCode: RETURN_REMINDER_TEMPLATE_CODE },
        onEvent: (result) => finish(mapNotificationAgreementResult(result.type)),
        // SDK onError(일시 오류): 에러 정보를 error_reason 요약으로 남긴다.
        onError: (error: unknown) =>
          finish("error", summarizeAgreementError(error)),
      });
    } catch {
      // 미지원 환경(로컬 브라우저 등)에서는 동기 throw가 날 수 있다.
      finish("unsupported");
      return;
    }

    // 콜백이 끝내 돌아오지 않는(브리지 미연결) 경우의 안전망. onError와 구분해
    // timeout으로 기록한다. 콜백이 이미 동기적으로 결과를 확정했다면(settled)
    // 타이머를 걸지 않아 불필요한 대기·핸들 누수를 막는다.
    if (!settled) {
      timer = setTimeout(() => finish("timeout"), timeoutMs);
    }
  });
}
