// AIT 네이티브 공유 시트 어댑터(#320).
// AIT 웹뷰에는 `navigator.share`가 없어 결과 공유가 전건 클립보드 폴백으로 떨어진다.
// `@apps-in-toss/web-framework`의 `share({ message })`는 네이티브 공유 시트를 띄우므로,
// 이를 먼저 시도해 `shared` 전달을 가능하게 한다. 미지원 환경(로컬 브라우저/QR 샌드박스
// 등)에서는 브리지가 없어 throw가 나므로 `unsupported`로 폴백해, 호출부가 기존
// navigator.share→클립보드 순서를 그대로 이어가게 한다(퍼즐 공유를 절대 막지 않는다).
import { share } from "@apps-in-toss/web-framework";

// 네이티브 공유 시트 전달 결과. shared=시트 노출 성공, unsupported=미지원(throw).
// 실제 전달 실패/취소 구분과 토스 진입 링크(getTossShareLink) 연동은 본 이슈 범위에서
// 제외하고 후속 이슈로 분리한다.
export type AitShareResult = "shared" | "unsupported";

// SDK share 호출부를 주입 가능하게 두어 성공/미지원(throw) 분기를 mock으로 단위
// 테스트한다(#320). 기본값은 실제 web-framework share다. 동기·비동기 throw 모두
// unsupported로 폴백한다.
export async function shareViaAitSheet(
  message: string,
  shareImpl: typeof share = share,
): Promise<AitShareResult> {
  try {
    await shareImpl({ message });
    return "shared";
  } catch {
    // AIT 웹뷰가 아니거나 브리지 미연결이면 throw가 난다. 미지원으로 보고 폴백한다.
    return "unsupported";
  }
}
