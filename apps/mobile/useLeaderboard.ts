import { useCallback, useState } from 'react';

import {
  buildLeaderboardScoreSubmitParams,
  LEADERBOARD_SCORE_SUBMIT_EVENT,
  type LeaderboardAdapter,
  type LeaderboardContext,
  type LeaderboardOperationOutcome,
  type TelemetryClient,
} from '../../packages/crossword-core/src';

type LeaderboardTelemetry = Pick<TelemetryClient, 'impression'>;

type UseLeaderboardOptions = {
  enabled: boolean;
  adapter: LeaderboardAdapter;
  telemetry: LeaderboardTelemetry;
};

// 네이티브 인증·콘솔 설정 오류가 완료 화면 전체를 깨뜨리지 않도록 AIT와 같은
// 세션 단위 격리 정책을 적용한다. 다음 앱 실행에서는 지원 여부를 다시 판정한다.
export function useLeaderboard({
  enabled,
  adapter,
  telemetry,
}: UseLeaderboardOptions) {
  const [sessionAvailable, setSessionAvailable] = useState(true);
  const visible = enabled && sessionAvailable && adapter.supported;

  const submitScore = useCallback(
    async (
      score: number,
      context: LeaderboardContext,
    ): Promise<LeaderboardOperationOutcome> => {
      if (!enabled || !sessionAvailable || !adapter.supported) {
        return 'unsupported';
      }

      try {
        await adapter.submitScore(score, context);
        telemetry.impression(
          LEADERBOARD_SCORE_SUBMIT_EVENT,
          buildLeaderboardScoreSubmitParams(score, context, 'success'),
        );
        return 'success';
      } catch {
        setSessionAvailable(false);
        telemetry.impression(
          LEADERBOARD_SCORE_SUBMIT_EVENT,
          buildLeaderboardScoreSubmitParams(score, context, 'failure'),
        );
        return 'failure';
      }
    },
    [adapter, enabled, sessionAvailable, telemetry],
  );

  const openLeaderboard =
    useCallback(async (): Promise<LeaderboardOperationOutcome> => {
      if (!enabled || !sessionAvailable || !adapter.supported) {
        return 'unsupported';
      }

      try {
        await adapter.openLeaderboard();
        return 'success';
      } catch {
        setSessionAvailable(false);
        return 'failure';
      }
    }, [adapter, enabled, sessionAvailable]);

  return { visible, submitScore, openLeaderboard };
}
