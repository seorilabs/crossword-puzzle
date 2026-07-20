import {
  getCompletionAchievements,
  getNextStreakMilestoneHint,
  getStreakBadgeLabel,
} from "../../packages/crossword-core/src";
import { formatThemeHeadline } from "../puzzleLabels";
import { useShareResult } from "../useShareResult";
import { ShareGridPreview } from "./ShareGridPreview";

export type CompletionCelebrationDialogProps = {
  attemptsUsed: number;
  completedCount: number;
  consecutiveStreak: number;
  elapsedLabel: string | null;
  hintCount: number;
  isNewBestTime: boolean;
  nextPuzzleLabel?: string;
  revealUsed: boolean;
  shareGrid: string;
  shareText: string;
  themeLabel?: string;
  totalCount: number;
  onClose: () => void;
  onGoHome: () => void;
  onSeeResult: () => void;
  onStartNextPuzzle?: () => void;
};

export function CompletionCelebrationDialog({
  attemptsUsed,
  completedCount,
  consecutiveStreak,
  elapsedLabel,
  hintCount,
  isNewBestTime,
  nextPuzzleLabel,
  revealUsed,
  shareGrid,
  shareText,
  themeLabel,
  totalCount,
  onClose,
  onGoHome,
  onSeeResult,
  onStartNextPuzzle,
}: CompletionCelebrationDialogProps) {
  const { shareCopied, shareFailed, share } = useShareResult();
  const themeHeadline = formatThemeHeadline(themeLabel);
  const streakBadge = getStreakBadgeLabel(consecutiveStreak);
  const nextStreakHint = getNextStreakMilestoneHint(consecutiveStreak);
  const achievements = getCompletionAchievements({
    hintCount,
    attemptsUsed,
    revealUsed,
  });

  const hasAchievements =
    isNewBestTime ||
    achievements.noHint ||
    achievements.firstTry ||
    streakBadge != null;
  const nextPuzzleButtonLabel =
    nextPuzzleLabel == null || nextPuzzleLabel === ""
      ? "다음 퍼즐 풀기"
      : `다음 퍼즐 풀기 · ${nextPuzzleLabel}`;

  return (
    <div className="rewardDialogScrim" onClick={onClose}>
      <section
        className="rewardDialog completionDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="completionDialogTitle"
        aria-describedby="completionDialogDescription"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confettiContainer" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className={`confettiPiece confettiPiece--${i + 1}`} />
          ))}
        </div>
        <div className="completionDialogBadge" aria-hidden="true">
          🎉
        </div>
        <div className="rewardDialogText">
          <h2 id="completionDialogTitle">퍼즐을 완성했어요!</h2>
          <p id="completionDialogDescription">
            낱말 {completedCount}/{totalCount}개를 모두 맞췄어요
            {hintCount > 0 ? ` · 힌트 ${hintCount}회 사용` : ""}.
          </p>
          {themeHeadline != null && (
            <p className="completionThemeLine">{themeHeadline}</p>
          )}
          {elapsedLabel != null && (
            <p className="celebrationStat">⏱ {elapsedLabel}</p>
          )}
          <ShareGridPreview shareGrid={shareGrid} />
          {hasAchievements && (
            <div className="resultAchievements">
              {isNewBestTime && (
                <span className="resultAchievement resultAchievementBest">
                  🏆 최고 기록 갱신!
                </span>
              )}
              {achievements.noHint && (
                <span className="resultAchievement">🎯 노힌트 클리어</span>
              )}
              {achievements.firstTry && (
                <span className="resultAchievement">💎 첫 도전 성공</span>
              )}
              {streakBadge != null && (
                <span className="resultAchievement">{streakBadge}</span>
              )}
            </div>
          )}
          {nextStreakHint != null && (
            <p className="streakNudge">{nextStreakHint}</p>
          )}
        </div>
        <div className="shareContainer">
          <button
            className="shareButton"
            type="button"
            onClick={() => share(shareText)}
          >
            결과 공유하기
          </button>
          {shareCopied && (
            <p className="shareToast" role="status" aria-live="polite">
              클립보드에 복사됐어요!
            </p>
          )}
          {shareFailed && (
            <p
              className="shareToast shareToastError"
              role="alert"
              aria-live="assertive"
            >
              클립보드 복사에 실패했어요.
            </p>
          )}
        </div>
        <div className="rewardDialogActions">
          {onStartNextPuzzle != null && (
            <button
              className="primaryButton completionNextPuzzleButton"
              type="button"
              onClick={onStartNextPuzzle}
              autoFocus
            >
              {nextPuzzleButtonLabel}
            </button>
          )}
          <button className="secondaryButton" type="button" onClick={onGoHome}>
            홈으로
          </button>
          <button
            className={
              onStartNextPuzzle == null ? "primaryButton" : "secondaryButton"
            }
            type="button"
            onClick={onSeeResult}
            autoFocus={onStartNextPuzzle == null}
          >
            결과 보기
          </button>
        </div>
        <button
          className="completionDialogReview"
          type="button"
          onClick={onClose}
        >
          퍼즐 다시 보기
        </button>
      </section>
    </div>
  );
}
