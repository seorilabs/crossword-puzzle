import { useCallback, useEffect, useRef, useState } from "react";

// 결과 공유 전달 공통 로직. navigator.share(공유 시트)를 우선 시도하고,
// 미지원·실패 시 클립보드 복사로 폴백한다. ResultScreen과 완료 축하
// 다이얼로그가 같은 동작을 공유하도록 화면 밖으로 추출했다(#202).
export type ShareDeliveryOutcome = "shared" | "aborted" | "copied" | "failed";

export async function deliverShareText(
  text: string,
): Promise<ShareDeliveryOutcome> {
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
// 않는다(기존 ResultScreen 동작 유지).
export function useShareResult(): {
  shareCopied: boolean;
  shareFailed: boolean;
  share: (text: string) => void;
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

  const share = useCallback((text: string) => {
    void deliverShareText(text).then((outcome) => {
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
  }, []);

  return { shareCopied, shareFailed, share };
}
