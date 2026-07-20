import { useCallback, useEffect, useRef, useState } from "react";

import {
  getStuckHintBackoffDelayMs,
  getStuckHintDelayMs,
  shouldScheduleStuckHintPrompt,
} from "../packages/crossword-core/src";

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
  // 퍼즐 식별자(#265). 값이 바뀔 때만 노출/닫기/쿨다운 상태를 리셋해, 같은 퍼즐의
  // 재도전이나 화면 왕복으로 억제 상태를 우회하지 못하게 한다.
  puzzleKey?: unknown;
  // 퍼즐 당 노출 상한(#254, #265). 0 이하면 무제한(미지정 시 무제한).
  maxPromptsPerAttempt?: number;
  // 퍼즐 당 닫기 상한(#254, #265). 0 이하면 무제한.
  maxDismissals?: number;
  // 닫을 때마다 다음 노출 지연에 곱하는 배수(#254). 미지정/1 이면 백오프 없음.
  dismissBackoffFactor?: number;
  // 직전 노출 후 다음 노출까지 보장할 최소 간격(ms, #265).
  minCooldownMs?: number;
  // CTA가 실제로 노출되는 순간 1회 호출(호출부에서 텔레메트리 emit). 발화 시점의
  // 최신 클로저가 호출되도록 latestRef로 보관한다. promptSeq(이번 퍼즐 N번째
  // 노출)·dismissCount(그 전까지 닫은 횟수)를 함께 전달한다(#254).
  onShow: (info: {
    trigger: "idle" | "wrong_answer";
    delayMs: number;
    promptSeq: number;
    dismissCount: number;
  }) => void;
}

export interface UseStuckHintPromptResult {
  isVisible: boolean;
  // 수락/공개 등 닫기가 아닌 동작으로 CTA를 즉시 숨긴다(닫기 카운터 미증가).
  hide: () => void;
  // 사용자가 CTA를 닫는다(#254). 숨기고 닫기 카운터를 올려 백오프·상한을 재평가한다.
  dismiss: () => void;
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
    puzzleKey,
    maxPromptsPerAttempt = 0,
    maxDismissals = 0,
    dismissBackoffFactor = 1,
    minCooldownMs = 0,
    onShow,
  } = input;

  const [isVisible, setIsVisible] = useState(false);

  // 이번 퍼즐의 노출/닫기/직전 노출 시각(#254, #265). 렌더를 유발하지 않도록 ref로 둔다.
  const promptSeqRef = useRef(0);
  const dismissCountRef = useRef(0);
  const lastShownAtRef = useRef<number | null>(null);
  const prevPuzzleKeyRef = useRef(puzzleKey);
  // 닫기 시 재스케줄(백오프·상한 재평가)을 트리거하기 위한 tick.
  const [dismissTick, setDismissTick] = useState(0);

  // latestRef: 매 커밋 이후 최신 onShow를 반영한다(렌더 중 mutate 금지 → 동시성 안전).
  const onShowRef = useRef(onShow);
  useEffect(() => {
    onShowRef.current = onShow;
  });

  useEffect(() => {
    // 다른 퍼즐로 바뀔 때만 노출/닫기/쿨다운 상태를 리셋한다(#265).
    if (prevPuzzleKeyRef.current !== puzzleKey) {
      prevPuzzleKeyRef.current = puzzleKey;
      promptSeqRef.current = 0;
      dismissCountRef.current = 0;
      lastShownAtRef.current = null;
    }

    if (!active) {
      setIsVisible(false);
      return;
    }

    // 노출/닫기 상한에 도달했으면 이 퍼즐에서는 더 스케줄하지 않는다(#254, #265).
    if (
      !shouldScheduleStuckHintPrompt({
        promptSeq: promptSeqRef.current,
        dismissCount: dismissCountRef.current,
        maxPromptsPerAttempt,
        maxDismissals,
      })
    ) {
      setIsVisible(false);
      return;
    }

    const trigger: "idle" | "wrong_answer" =
      wrongCellCount >= wrongCellThreshold ? "wrong_answer" : "idle";
    const baseDelayMs = getStuckHintDelayMs({
      wrongCellCount,
      wrongCellThreshold,
      idleMs,
      wrongIdleMs,
    });
    // 닫은 횟수만큼 다음 노출 지연을 백오프로 늘린다(#254).
    const backoffDelayMs = getStuckHintBackoffDelayMs({
      baseDelayMs,
      dismissCount: dismissCountRef.current,
      backoffFactor: dismissBackoffFactor,
    });
    const elapsedSinceLastShowMs =
      lastShownAtRef.current == null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, Date.now() - lastShownAtRef.current);
    const cooldownDelayMs = Math.max(
      0,
      minCooldownMs - elapsedSinceLastShowMs,
    );
    const delayMs = Math.max(backoffDelayMs, cooldownDelayMs);

    setIsVisible(false);
    const timerId = window.setTimeout(() => {
      lastShownAtRef.current = Date.now();
      promptSeqRef.current += 1;
      setIsVisible(true);
      onShowRef.current({
        trigger,
        delayMs,
        promptSeq: promptSeqRef.current,
        dismissCount: dismissCountRef.current,
      });
    }, delayMs);

    return () => window.clearTimeout(timerId);
    // resetKeys는 스프레드로 개별 의존성이 된다(활동 시 재스케줄). onShow는 위 latestRef
    // 경유이므로 의도적으로 제외한다. dismissTick은 닫기 후 재스케줄 트리거.
  }, [
    active,
    wrongCellCount,
    wrongCellThreshold,
    idleMs,
    wrongIdleMs,
    puzzleKey,
    maxPromptsPerAttempt,
    maxDismissals,
    dismissBackoffFactor,
    minCooldownMs,
    dismissTick,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ...resetKeys,
  ]);

  const hide = useCallback(() => setIsVisible(false), []);

  const dismiss = useCallback(() => {
    setIsVisible(false);
    dismissCountRef.current += 1;
    // 재스케줄(백오프·상한 재평가)을 유발한다.
    setDismissTick((tick) => tick + 1);
  }, []);

  return { isVisible, hide, dismiss };
}
