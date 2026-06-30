// 개인 누적 통계의 공유 계약(3마켓 공통). 기기에 남은 퍼즐 기록 배열에서
// 사용자 단위 집계 지표(총 완료·완료율·노힌트 완료·보유 최고기록)를 계산한다.
// 진척 가시성(progression visibility)으로 코어 사용자의 재방문 동기를 높인다.
// core에는 React / React Native / AppsInToss / Firebase SDK import를 넣지 않는다.

/** 집계 입력 1건(기기에 기록이 남은 퍼즐 1개). 플랫폼 어댑터가 채워서 넘긴다. */
export type PersonalStatsRecord = {
  // 이 퍼즐을 정답으로 끝까지 완료했는지
  completed: boolean;
  // 힌트·정답 보기 없이(unaided) 완료했는지. `completed`가 아니면 무시된다.
  noHintCompletion: boolean;
  // 이 퍼즐에 보유한 최고 기록(best-time)이 있는지
  hasBestTime: boolean;
};

/** 사용자 단위 누적 통계. HistoryScreen 요약 카드가 표시한다. */
export type PersonalStats = {
  // 집계 대상(기기에 기록이 남은) 퍼즐 수
  totalPuzzles: number;
  // 완료한 퍼즐 수
  completedCount: number;
  // 완료율(0~1). 대상이 0이면 0으로 둔다(NaN 방지).
  completionRate: number;
  // 힌트 없이 완료한 퍼즐 수
  noHintCompletedCount: number;
  // 보유한 최고 기록 수
  bestTimeCount: number;
};

/**
 * 기기에 남은 퍼즐 기록 배열에서 개인 누적 통계를 집계한다.
 *
 * - 완료율은 `completedCount / totalPuzzles`이며, 대상이 0건이면 0이다.
 * - 노힌트 완료 수는 `completed && noHintCompletion`인 기록만 센다(미완료 기록의
 *   noHintCompletion 값은 무시 — 완료 사실이 항상 우선한다).
 */
export function computePersonalStats(
  records: readonly PersonalStatsRecord[],
): PersonalStats {
  const totalPuzzles = records.length;

  let completedCount = 0;
  let noHintCompletedCount = 0;
  let bestTimeCount = 0;

  for (const record of records) {
    if (record.completed) {
      completedCount += 1;
      if (record.noHintCompletion) {
        noHintCompletedCount += 1;
      }
    }
    if (record.hasBestTime) {
      bestTimeCount += 1;
    }
  }

  const completionRate =
    totalPuzzles > 0 ? completedCount / totalPuzzles : 0;

  return {
    totalPuzzles,
    completedCount,
    completionRate,
    noHintCompletedCount,
    bestTimeCount,
  };
}
