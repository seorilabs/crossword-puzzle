import {
  getCompletionAchievements,
  getNextStreakMilestoneHint,
  getStreakBadgeLabel,
  type Puzzle,
} from "../../packages/crossword-core/src";
import { telemetry } from "../adapters/telemetry";
import { formatThemeHeadline } from "../puzzleLabels";
import { useShareResult } from "../useShareResult";
import { ReturnReminderPrepromptCard } from "./ReturnReminderPrepromptCard";
import { ShareGridPreview } from "./ShareGridPreview";

// 복귀 알림 사전 안내. 값이 있으면 스트릭 배지 아래에 카드를 그린다. 카드에 답하지
// 않고 다이얼로그를 닫거나 다른 동선으로 나가면 보류(onDecline)로 정리한다.
export type CompletionReturnReminderPreprompt = {
  body: string;
  onAccept: () => void;
  onDecline: () => void;
};

export type CompletionCelebrationDialogProps = {
  attemptsUsed: number;
  completedCount: number;
  consecutiveStreak: number;
  difficulty?: Puzzle["difficulty"];
  elapsedLabel: string | null;
  hintCount: number;
  isNewBestTime: boolean;
  // 완료 직후 primary CTA 문구. 사다리 다음 단계면 "오늘의 퍼즐 이어서 풀기"처럼
  // 호출부(core formatDailyLadderNextLabel)가 완성한 문구를 그대로 받는다.
  nextPuzzleButtonLabel?: string;
  puzzleId: string;
  returnReminderPreprompt?: CompletionReturnReminderPreprompt;
  revealUsed: boolean;
  shareGrid: string;
  shareText: string;
  themeLabel?: string;
  totalCount: number;
  onClose: () => void;
  onGoHome: () => void;
  onSeeHistory: () => void;
  onSeeResult: () => void;
  onStartNextPuzzle?: () => void;
};

export function CompletionCelebrationDialog({
  attemptsUsed,
  completedCount,
  consecutiveStreak,
  difficulty,
  elapsedLabel,
  hintCount,
  isNewBestTime,
  nextPuzzleButtonLabel,
  puzzleId,
  returnReminderPreprompt,
  revealUsed,
  shareGrid,
  shareText,
  themeLabel,
  totalCount,
  onClose,
  onGoHome,
  onSeeHistory,
  onSeeResult,
  onStartNextPuzzle,
}: CompletionCelebrationDialogProps) {
  const { shareCopied, shareFailed, share } =
    useShareResult("completion_dialog");
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
  const nextPuzzleCtaText =
    nextPuzzleButtonLabel == null || nextPuzzleButtonLabel === ""
      ? "다음 퍼즐 풀기"
      : nextPuzzleButtonLabel;

  // 사전 안내에 답하지 않고 다이얼로그를 떠나면 보류로 기록한다(익일 재안내).
  function settleReturnReminderPreprompt() {
    returnReminderPreprompt?.onDecline();
  }

  function leaveWith(action: () => void) {
    return () => {
      settleReturnReminderPreprompt();
      action();
    };
  }

  // 완료 직후(고관여 시점) 기록 화면으로 잇는 보조 동선. 진입 소스를 구분해
  // 계측한 뒤(#300) 다이얼로그 닫힘·이동은 호출부(onSeeHistory)에 위임한다.
  function seeHistory() {
    settleReturnReminderPreprompt();
    telemetry.click("history_open", { source: "completion_dialog" });
    onSeeHistory();
  }

  return (
    <div className="rewardDialogScrim" onClick={leaveWith(onClose)}>
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
          {returnReminderPreprompt != null && (
            <ReturnReminderPrepromptCard
              body={returnReminderPreprompt.body}
              onAccept={returnReminderPreprompt.onAccept}
              onDecline={returnReminderPreprompt.onDecline}
            />
          )}
        </div>
        <div className="shareContainer">
          <button
            className="shareButton"
            type="button"
            onClick={() =>
              share(shareText, { puzzle_id: puzzleId, difficulty })
            }
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
              onClick={leaveWith(onStartNextPuzzle)}
              autoFocus
            >
              {nextPuzzleCtaText}
            </button>
          )}
          <button
            className="secondaryButton"
            type="button"
            onClick={leaveWith(onGoHome)}
          >
            홈으로
          </button>
          <button
            className={
              onStartNextPuzzle == null ? "primaryButton" : "secondaryButton"
            }
            type="button"
            onClick={leaveWith(onSeeResult)}
            autoFocus={onStartNextPuzzle == null}
          >
            결과 보기
          </button>
          <button
            className="secondaryButton completionSeeHistoryButton"
            type="button"
            onClick={seeHistory}
          >
            내 기록 보기
          </button>
        </div>
        <button
          className="completionDialogReview"
          type="button"
          onClick={leaveWith(onClose)}
        >
          퍼즐 다시 보기
        </button>
      </section>
    </div>
  );
}
