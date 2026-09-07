import type {
  DailyLadder,
  DailyLadderStep,
} from "../../packages/crossword-core/src";

export type DailyLadderCardProps = {
  ladder: DailyLadder;
  selectedPuzzleId: string;
  disabled: boolean;
  onStepPress: (step: DailyLadderStep) => void;
};

// 홈 "오늘의 사다리" 카드. 같은 날짜의 두 난이도를 병렬 선택지가 아니라
// 워밍업 → 오늘의 퍼즐 두 단계로 보여 준다. 단계 순서·상태·CTA 판정은 core
// (buildDailyLadder)가 하고, 여기서는 단계를 눌러 바로 시작하는 렌더만 맡는다.
// 2단계를 직접 누르는 숙련자 경로는 막지 않는다.
export function DailyLadderCard({
  ladder,
  selectedPuzzleId,
  disabled,
  onStepPress,
}: DailyLadderCardProps) {
  if (ladder.steps.length === 0) {
    return null;
  }

  const ctaStepId =
    ladder.cta.kind === "start" || ladder.cta.kind === "resume"
      ? ladder.cta.step.puzzleId
      : null;

  return (
    <section className="dailyLadder" aria-label="오늘의 사다리">
      {ladder.steps.map((step) => {
        const isCta = step.puzzleId === ctaStepId;
        const isSelected = step.puzzleId === selectedPuzzleId;

        return (
          <button
            key={step.puzzleId}
            type="button"
            className={[
              "dailyLadderStep",
              `dailyLadderStep--${step.status}`,
              isCta ? "dailyLadderStepNext" : "",
              isSelected ? "dailyLadderStepSelected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={isCta ? "step" : undefined}
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onStepPress(step)}
          >
            <span className="dailyLadderStepIndex" aria-hidden="true">
              {step.status === "done" ? "✓" : step.step}
            </span>
            <span className="dailyLadderStepBody">
              <span className="dailyLadderStepTitle">{step.label}</span>
              <span className="dailyLadderStepStatus">
                {isCta ? `${step.statusLabel} · 다음 단계` : step.statusLabel}
              </span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
