import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildShareResultClickParams,
  buildShareResultOutcomeParams,
  SHARE_RESULT_CLICK_EVENT,
  SHARE_RESULT_OUTCOME_EVENT,
  type ShareDeliveryOutcome,
  type ShareSurface,
  type TelemetryParams,
} from "../packages/crossword-core/src";
import { telemetry } from "./adapters/telemetry";
import { shareViaAitSheet } from "./adapters/aitShare";

// 결과 공유 전달 공통 로직. AIT 네이티브 공유 시트를 우선 시도하고(#320), 미지원이면
// navigator.share(공유 시트) → 클립보드 복사 순서로 폴백한다. ResultScreen과 완료 축하
// 다이얼로그가 같은 동작을 공유하도록 화면 밖으로 추출했다(#202). 이벤트 이름·파라미터
// 계약은 core shareResult 에 두어 RN 과 같은 표면 구분을 쓴다.
export type { ShareDeliveryOutcome, ShareSurface };

export async function deliverShareText(
  text: string,
): Promise<ShareDeliveryOutcome> {
  // AIT 웹뷰에는 navigator.share가 없어 항상 클립보드로 떨어진다(#320). 네이티브
  // 공유 시트를 먼저 시도하고, 성공하면 shared로 종료한다. 미지원(로컬 브라우저 등)
  // 이면 아래 기존 순서(navigator.share → 클립보드)로 폴백한다.
  if ((await shareViaAitSheet(text)) === "shared") {
    return "shared";
  }

  if (typeof navigator !== "undefined" && navigator.share != null) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (error: unknown) {
      // 사용자가 공유 시트를 직접 닫은 경우는 실패로 보지 않는다.
      if (error instanceof Error && error.name === "AbortError") {
        return "aborted";
      }
      // 그 외 실패는 클립보드 폴백으로 이어간다.
    }
  }

  if (
    typeof navigator === "undefined" ||
    typeof navigator.clipboard?.writeText !== "function"
  ) {
    return "failed";
  }

  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

// 공유 버튼 상태 훅: 복사 성공 토스트(2초 뒤 자동 소멸)와 실패 토스트 상태를
// 관리한다. 공유 시트로 전달됐거나 사용자가 닫은 경우에는 토스트를 띄우지
// 않는다(기존 ResultScreen 동작 유지). surface(공유 표면)를 받아 클릭·전달
// 결과 텔레메트리에 실어 GA4에서 표면별로 사용률·실패율을 분석한다(#299).
export function useShareResult(surface: ShareSurface): {
  shareCopied: boolean;
  shareFailed: boolean;
  share: (text: string, clickParams?: TelemetryParams) => void;
} {
  const [shareCopied, setShareCopied] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const share = useCallback(
    (text: string, clickParams?: TelemetryParams) => {
      telemetry.click(SHARE_RESULT_CLICK_EVENT, {
        ...buildShareResultClickParams(surface),
        ...clickParams,
      });
      void deliverShareText(text).then((outcome) => {
        telemetry.impression(
          SHARE_RESULT_OUTCOME_EVENT,
          buildShareResultOutcomeParams(surface, outcome),
        );
        if (outcome === "copied") {
          setShareCopied(true);
          setShareFailed(false);
          if (timeoutRef.current != null) {
            window.clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = window.setTimeout(() => {
            setShareCopied(false);
            timeoutRef.current = null;
          }, 2000);
          return;
        }
        if (outcome === "failed") {
          setShareCopied(false);
          setShareFailed(true);
          if (timeoutRef.current != null) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        }
      });
    },
    [surface],
  );

  return { shareCopied, shareFailed, share };
}
