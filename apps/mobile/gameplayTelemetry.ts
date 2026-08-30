import {
  getNewlyReachedProgressMilestones,
  type GameAnalyticsClient,
  type GamePuzzleContext,
  type TelemetryClient,
  type TelemetryParams,
} from '../../packages/crossword-core/src';

export type MobilePuzzleAbandonSnapshot = {
  attemptsUsed: number;
  elapsedSeconds: number;
  gameContext: GamePuzzleContext;
  hadFirstInput: boolean;
  hasStarted: boolean;
  hintCount: number;
  isCompleted: boolean;
  progressPercent: number;
  puzzleId: string;
  remainingAttempts: number;
  route: string;
  telemetryParams: TelemetryParams;
  totalWords: number;
  wordsFilled: number;
};

type MobileGameplayTelemetryClients = {
  telemetry: Pick<TelemetryClient, 'impression'>;
  gameAnalytics: Pick<GameAnalyticsClient, 'track'>;
};

export type MobileGameplayAttemptTracker = {
  emitPuzzleAbandon(
    snapshot: MobilePuzzleAbandonSnapshot,
    lastScreen: string,
    clients: MobileGameplayTelemetryClients,
  ): boolean;
  getNewProgressMilestones(input: {
    attemptKey: string;
    isCompleted: boolean;
    progressPercent: number;
  }): number[];
};

export function createMobileGameplayAttemptTracker(): MobileGameplayAttemptTracker {
  const abandonedAttemptKeys = new Set<string>();
  let progressAttemptKey = '';
  let reachedProgressMilestone = 0;

  return {
    emitPuzzleAbandon(snapshot, lastScreen, clients) {
      if (!snapshot.hasStarted || snapshot.isCompleted) {
        return false;
      }

      const attemptKey = `${snapshot.puzzleId}:${snapshot.attemptsUsed}`;
      if (abandonedAttemptKeys.has(attemptKey)) {
        return false;
      }
      abandonedAttemptKeys.add(attemptKey);

      try {
        clients.telemetry.impression('puzzle_abandon', {
          ...snapshot.telemetryParams,
          attempt_number: snapshot.attemptsUsed,
          elapsed_seconds: snapshot.elapsedSeconds,
          had_first_input: snapshot.hadFirstInput,
          hint_count: snapshot.hintCount,
          last_screen: lastScreen,
          progress_percent: snapshot.progressPercent,
          remaining_attempts: snapshot.remainingAttempts,
          total_words: snapshot.totalWords,
          words_filled: snapshot.wordsFilled,
        });
      } catch {
        // 분석 실패는 플레이와 다른 sink의 전송을 막지 않는다.
      }

      try {
        clients.gameAnalytics.track(
          'game_puzzle_abandon',
          snapshot.gameContext,
          {
            elapsedSec: snapshot.elapsedSeconds,
            completedWordCount: snapshot.wordsFilled,
            totalWordCount: snapshot.totalWords,
            progressPercent: snapshot.progressPercent,
            hadFirstInput: snapshot.hadFirstInput,
          },
        );
      } catch {
        // 분석 실패는 플레이를 막지 않는다.
      }

      return true;
    },

    getNewProgressMilestones({ attemptKey, isCompleted, progressPercent }) {
      if (progressAttemptKey !== attemptKey) {
        progressAttemptKey = attemptKey;
        const alreadyReached = getNewlyReachedProgressMilestones(
          0,
          progressPercent,
        );
        reachedProgressMilestone =
          alreadyReached[alreadyReached.length - 1] ?? 0;
        return [];
      }

      if (isCompleted) {
        return [];
      }

      const newlyReached = getNewlyReachedProgressMilestones(
        reachedProgressMilestone,
        progressPercent,
      );
      reachedProgressMilestone =
        newlyReached[newlyReached.length - 1] ?? reachedProgressMilestone;
      return newlyReached;
    },
  };
}
