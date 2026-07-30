import { useCallback, useState } from "react";

import {
  buildLeaderboardScoreSubmitParams,
  LEADERBOARD_SCORE_SUBMIT_EVENT,
  type LeaderboardAdapter,
  type LeaderboardContext,
  type LeaderboardOperationOutcome,
  type TelemetryClient,
} from "../packages/crossword-core/src";

type LeaderboardTelemetry = Pick<TelemetryClient, "impression">;

type UseLeaderboardOptions = {
  enabled: boolean;
  adapter: LeaderboardAdapter;
  telemetry: LeaderboardTelemetry;
};

export function useLeaderboard({
  enabled,
  adapter,
  telemetry,
}: UseLeaderboardOptions) {
  // 지원 브리지가 있어도 게임센터 미승인·조회 실패가 확인되면 현재 세션에서는
  // 진입점을 숨긴다. 앱을 다시 열면 런타임 지원 여부를 다시 판정한다.
  const [sessionAvailable, setSessionAvailable] = useState(true);
  const visible = enabled && sessionAvailable && adapter.supported;

  const submitScore = useCallback(
    async (
      score: number,
      context: LeaderboardContext,
    ): Promise<LeaderboardOperationOutcome> => {
      if (!enabled || !sessionAvailable || !adapter.supported) {
        return "unsupported";
      }

      try {
        await adapter.submitScore(score, context);
        telemetry.impression(
          LEADERBOARD_SCORE_SUBMIT_EVENT,
          buildLeaderboardScoreSubmitParams(score, context, "success"),
        );
        return "success";
      } catch {
        // 제출 오류는 완료 플로우 밖에서 종결하고, 같은 세션의 순위 CTA만 숨긴다.
        setSessionAvailable(false);
        telemetry.impression(
          LEADERBOARD_SCORE_SUBMIT_EVENT,
          buildLeaderboardScoreSubmitParams(score, context, "failure"),
        );
        return "failure";
      }
    },
    [adapter, enabled, sessionAvailable, telemetry],
  );

  const openLeaderboard =
    useCallback(async (): Promise<LeaderboardOperationOutcome> => {
      if (!enabled || !sessionAvailable || !adapter.supported) {
        return "unsupported";
      }

      try {
        await adapter.openLeaderboard();
        return "success";
      } catch {
        // 게임센터 미승인·조회 실패 시 결과 화면은 유지하고 순위 CTA만 제거한다.
        setSessionAvailable(false);
        return "failure";
      }
    }, [adapter, enabled, sessionAvailable]);

  return {
    visible,
    submitScore,
    openLeaderboard,
  };
}
