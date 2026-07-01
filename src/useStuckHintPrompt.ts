import { useCallback, useEffect, useRef, useState } from "react";

import { getStuckHintDelayMs } from "../packages/crossword-core/src";

// 막힘(stuck) 힌트 CTA 노출 타이머를 캡슐화한 훅.
//
// 배경: 노출 지연·오답 임계는 launchConfig(Remote Config)로 원격 조정된다(#172).
// 이 훅은 App의 모놀리식 렌더에서 분리해 다음 동작을 회귀 테스트 가능하게 만든다.
// - active(보드·시작·미완료)일 때만 타이머를 건다.
// - 입력/단어 선택 등 활동(resetKeys)·임계·오답 수가 바뀌면 cleanup으로 이전
//   타이머를 취소하고 최신 값으로 재스케줄한다(stale 타이머 발화 없음).
// - 지연은 스케줄 시점에 고정한다(발화 시점에 지연을 다시 읽는 것은 무의미하고,
//   호출부 idle_seconds 텔레메트리는 실제 사용된 지연을 보고해야 정확하다).
// - 노출 페이로드(onShow)는 표준 latestRef 패턴으로 커밋 단계에서 최신화해, 발화
//   시점의 최신 상태를 렌더 중 부수효과 없이(동시성 안전) 읽는다. 덕분에 텔레메트리
//   전용 값 변화가 idle 타이머를 불필요하게 재스케줄하지 않으면서도 stale하지 않다.
export interface UseStuckHintPromptInput {
  // route === "today" && hasStarted && !isCompleted
  active: boolean;
  // 활동 신호: 값이 바뀌면 타이머를 리셋한다(예: cellValues 참조, 선택 단서 id).
  resetKeys: readonly unknown[];
  wrongCellCount: number;
  wrongCellThreshold: number;
  idleMs: number;
  wrongIdleMs: number;
  // CTA가 실제로 노출되는 순간 1회 호출(호출부에서 텔레메트리 emit). 발화 시점의
  // 최신 클로저가 호출되도록 latestRef로 보관한다.
  onShow: (info: { trigger: "idle" | "wrong_answer"; delayMs: number }) => void;
}

export interface UseStuckHintPromptResult {
  isVisible: boolean;
  // 사용자 동작(수락/공개/닫기)으로 CTA를 즉시 숨긴다.
  hide: () => void;
}

export function useStuckHintPrompt(
  input: UseStuckHintPromptInput,
): UseStuckHintPromptResult {
  const {
    active,
    resetKeys,
    wrongCellCount,
    wrongCellThreshold,
    idleMs,
    wrongIdleMs,
    onShow,
  } = input;

  const [isVisible, setIsVisible] = useState(false);

  // latestRef: 매 커밋 이후 최신 onShow를 반영한다(렌더 중 mutate 금지 → 동시성 안전).
  const onShowRef = useRef(onShow);
  useEffect(() => {
    onShowRef.current = onShow;
  });

  useEffect(() => {
    if (!active) {
      setIsVisible(false);
      return;
    }

    const trigger: "idle" | "wrong_answer" =
      wrongCellCount >= wrongCellThreshold ? "wrong_answer" : "idle";
    const delayMs = getStuckHintDelayMs({
      wrongCellCount,
      wrongCellThreshold,
      idleMs,
      wrongIdleMs,
    });

    setIsVisible(false);
    const timerId = window.setTimeout(() => {
      setIsVisible(true);
      onShowRef.current({ trigger, delayMs });
    }, delayMs);

    return () => window.clearTimeout(timerId);
    // resetKeys는 스프레드로 개별 의존성이 된다(활동 시 재스케줄). onShow는 위 latestRef
    // 경유이므로 의도적으로 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, wrongCellCount, wrongCellThreshold, idleMs, wrongIdleMs, ...resetKeys]);

  const hide = useCallback(() => setIsVisible(false), []);

  return { isVisible, hide };
}
