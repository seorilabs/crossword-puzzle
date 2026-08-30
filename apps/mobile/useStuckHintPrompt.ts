import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getStuckHintBackoffDelayMs,
  getStuckHintDelayMs,
  isNearFinishNudge,
  shouldScheduleStuckHintPrompt,
  type StuckHintTrigger,
} from '../../packages/crossword-core/src';

export type MobileStuckHintShowInfo = {
  trigger: StuckHintTrigger;
  delayMs: number;
  promptSeq: number;
  dismissCount: number;
  nearFinish: boolean;
  wordsRemaining: number;
};

type UseStuckHintPromptInput = {
  active: boolean;
  resetKeys: readonly unknown[];
  firstInputPending: boolean;
  firstInputIdleMs: number;
  wrongCellCount: number;
  wrongCellThreshold: number;
  idleMs: number;
  wrongIdleMs: number;
  puzzleKey: string;
  maxPromptsPerAttempt: number;
  maxDismissals: number;
  dismissBackoffFactor: number;
  minCooldownMs: number;
  progressPercent: number;
  wordsRemaining: number;
  finishNudgeProgressThreshold: number;
  finishNudgeWordsRemaining: number;
  onShow: (info: MobileStuckHintShowInfo) => void;
};

export function useStuckHintPrompt(input: UseStuckHintPromptInput) {
  const {
    active,
    resetKeys,
    firstInputPending,
    firstInputIdleMs,
    wrongCellCount,
    wrongCellThreshold,
    idleMs,
    wrongIdleMs,
    puzzleKey,
    maxPromptsPerAttempt,
    maxDismissals,
    dismissBackoffFactor,
    minCooldownMs,
    progressPercent,
    wordsRemaining,
    finishNudgeProgressThreshold,
    finishNudgeWordsRemaining,
    onShow,
  } = input;

  const [isVisible, setIsVisible] = useState(false);
  const [visibleInfo, setVisibleInfo] = useState({
    trigger: 'idle' as StuckHintTrigger,
    nearFinish: false,
    wordsRemaining: 0,
  });
  const [dismissTick, setDismissTick] = useState(0);
  const promptSeqRef = useRef(0);
  const dismissCountRef = useRef(0);
  const lastShownAtRef = useRef<number | null>(null);
  const previousPuzzleKeyRef = useRef(puzzleKey);
  const onShowRef = useRef(onShow);
  const nudgeInputsRef = useRef({
    progressPercent,
    wordsRemaining,
    finishNudgeProgressThreshold,
    finishNudgeWordsRemaining,
  });

  useEffect(() => {
    onShowRef.current = onShow;
  });

  useEffect(() => {
    nudgeInputsRef.current = {
      progressPercent,
      wordsRemaining,
      finishNudgeProgressThreshold,
      finishNudgeWordsRemaining,
    };
  });

  useEffect(() => {
    if (previousPuzzleKeyRef.current !== puzzleKey) {
      previousPuzzleKeyRef.current = puzzleKey;
      promptSeqRef.current = 0;
      dismissCountRef.current = 0;
      lastShownAtRef.current = null;
    }

    if (
      !active ||
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

    const trigger: StuckHintTrigger = firstInputPending
      ? 'first_input'
      : wrongCellCount >= wrongCellThreshold
        ? 'wrong_answer'
        : 'idle';
    const baseDelayMs = getStuckHintDelayMs({
      firstInputPending,
      firstInputIdleMs,
      wrongCellCount,
      wrongCellThreshold,
      idleMs,
      wrongIdleMs,
    });
    const backoffDelayMs = getStuckHintBackoffDelayMs({
      baseDelayMs,
      dismissCount: dismissCountRef.current,
      backoffFactor: dismissBackoffFactor,
    });
    const elapsedSinceLastShowMs =
      lastShownAtRef.current == null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, Date.now() - lastShownAtRef.current);
    const delayMs = Math.max(
      backoffDelayMs,
      Math.max(0, minCooldownMs - elapsedSinceLastShowMs),
    );

    setIsVisible(false);
    const timerId = setTimeout(() => {
      const nudge = nudgeInputsRef.current;
      const nearFinish =
        trigger !== 'first_input' &&
        isNearFinishNudge({
          progressPercent: nudge.progressPercent,
          wordsRemaining: nudge.wordsRemaining,
          progressThreshold: nudge.finishNudgeProgressThreshold,
          wordsRemainingThreshold: nudge.finishNudgeWordsRemaining,
        });

      lastShownAtRef.current = Date.now();
      promptSeqRef.current += 1;
      setVisibleInfo({
        trigger,
        nearFinish,
        wordsRemaining: nudge.wordsRemaining,
      });
      setIsVisible(true);
      onShowRef.current({
        trigger,
        delayMs,
        promptSeq: promptSeqRef.current,
        dismissCount: dismissCountRef.current,
        nearFinish,
        wordsRemaining: nudge.wordsRemaining,
      });
    }, delayMs);

    return () => clearTimeout(timerId);
    // resetKeys는 입력 활동마다 기존 타이머를 취소하고 새로 예약하기 위한 동적 의존성이다.
  }, [
    active,
    firstInputPending,
    firstInputIdleMs,
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
    setDismissTick(value => value + 1);
  }, []);

  return {
    isVisible,
    trigger: visibleInfo.trigger,
    nearFinish: visibleInfo.nearFinish,
    wordsRemaining: visibleInfo.wordsRemaining,
    hide,
    dismiss,
  };
}
