// 결과 공유 텔레메트리 계약(3마켓 공통). 공유 CTA 클릭과 전달 결과를 표면(surface)별로
// 나눠 GA4에서 사용률·실패율을 볼 수 있게 한다. 실제 전달(AIT 공유 시트·navigator.share·
// 클립보드·RN Share)은 어댑터가 맡고, 여기는 이벤트 이름·파라미터만 정의한다.

// 공유 표면 구분(#299). 결과 화면·완료 축하 다이얼로그에서 각각 발화한다.
export type ShareSurface = "result_screen" | "completion_dialog";

// 전달 결과. shared=공유 시트로 전달, aborted=사용자가 시트를 닫음, copied=클립보드
// 폴백 성공, failed=전달 실패.
export type ShareDeliveryOutcome = "shared" | "aborted" | "copied" | "failed";

export const SHARE_RESULT_CLICK_EVENT = "share_result_click";
export const SHARE_RESULT_OUTCOME_EVENT = "share_result_outcome";

export function buildShareResultClickParams(
  surface: ShareSurface,
  context: { puzzleId?: string; difficulty?: string } = {},
): { surface: ShareSurface; puzzle_id?: string; difficulty?: string } {
  return {
    surface,
    ...(context.puzzleId == null ? {} : { puzzle_id: context.puzzleId }),
    ...(context.difficulty == null ? {} : { difficulty: context.difficulty }),
  };
}

export function buildShareResultOutcomeParams(
  surface: ShareSurface,
  outcome: ShareDeliveryOutcome,
): { surface: ShareSurface; outcome: ShareDeliveryOutcome } {
  return { surface, outcome };
}
