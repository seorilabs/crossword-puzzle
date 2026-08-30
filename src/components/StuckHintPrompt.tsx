import {
  getStuckHintPromptText,
  type StuckHintTrigger,
} from "../../packages/crossword-core/src";

export interface StuckHintPromptProps {
  trigger: StuckHintTrigger;
  nearFinish: boolean;
  wordsRemaining: number;
  hasHintCredits: boolean;
  offerWordReveal: boolean;
  onAcceptFirstInput: () => void;
  onAcceptHint: () => void;
  onAcceptNearFinish: () => void;
  onRevealWord: () => void;
  onDismiss: () => void;
}

export function StuckHintPrompt({
  trigger,
  nearFinish,
  wordsRemaining,
  hasHintCredits,
  offerWordReveal,
  onAcceptFirstInput,
  onAcceptHint,
  onAcceptNearFinish,
  onRevealWord,
  onDismiss,
}: StuckHintPromptProps) {
  const isFirstInput = trigger === "first_input";

  return (
    <div className="stuckHintPrompt" role="status">
      <span className="stuckHintPromptText">
        {getStuckHintPromptText({
          trigger,
          nearFinish,
          wordsRemaining,
          hasHintCredits,
        })}
      </span>
      <div className="stuckHintPromptActions">
        {isFirstInput ? (
          <button
            type="button"
            className="stuckHintPromptCta"
            onClick={onAcceptFirstInput}
          >
            입력 시작하기
          </button>
        ) : (
          <>
            {nearFinish ? (
              <button
                type="button"
                className="stuckHintPromptCta"
                onClick={onAcceptNearFinish}
              >
                남은 단어 마저 풀기
              </button>
            ) : null}
            <button
              type="button"
              className="stuckHintPromptCta"
              onClick={onAcceptHint}
            >
              {hasHintCredits ? "무료 힌트 보기" : "힌트 보기"}
            </button>
            {offerWordReveal ? (
              <button
                type="button"
                className="stuckHintPromptReveal"
                onClick={onRevealWord}
              >
                이 단어 정답 보기
              </button>
            ) : null}
          </>
        )}
        <button
          type="button"
          className="stuckHintPromptClose"
          aria-label={isFirstInput ? "입력 안내 닫기" : "힌트 안내 닫기"}
          onClick={onDismiss}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
