// 개인 누적 통계의 공유 계약(3마켓 공통). 기기에 남은 퍼즐 기록 배열에서
// 사용자 단위 집계 지표(총 완료·완료율·노힌트 완료·보유 최고기록)를 계산한다.
// 진척 가시성(progression visibility)으로 코어 사용자의 재방문 동기를 높인다.
// core에는 React / React Native / AppsInToss / Firebase SDK import를 넣지 않는다.

import { getCompletionAchievements } from "./mission.ts";

/** 집계 입력 1건(기기에 기록이 남은 퍼즐 1개). 플랫폼 어댑터가 채워서 넘긴다. */
export type PersonalStatsRecord = {
  // 이 퍼즐을 정답으로 끝까지 완료했는지
  completed: boolean;
  // 이 퍼즐에서 사용한 힌트 수(노힌트 판정 입력)
  hintCount: number;
  // 정답 보기로 단어를 공개했는지(노힌트 판정 입력)
  revealUsed: boolean;
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

function toNonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

/**
 * 기기에 남은 퍼즐 기록 배열에서 개인 누적 통계를 집계한다.
 *
 * - 완료율은 `completedCount / totalPuzzles`이며, 대상이 0건이면 0이다.
 * - 노힌트 완료 수는 완료한 기록 중 `getCompletionAchievements`가 노힌트로 판정한
 *   것만 센다. 결과 화면 배지와 동일한 단일 규칙을 공유해, 같은 퍼즐에서
 *   '히스토리 노힌트 수'와 '결과 노힌트 배지'가 어긋나지 않도록 한다.
 * - `bestTimeCount`는 기기에 보유한 전체 최고 기록 수를 호출자가 직접 넘긴다.
 *   archive 기록 집합과 무관하게 실제 보유 수를 반영하도록 분리한 입력이다.
 */
export function computePersonalStats(
  records: readonly PersonalStatsRecord[],
  bestTimeCount = 0,
): PersonalStats {
  const totalPuzzles = records.length;

  let completedCount = 0;
  let noHintCompletedCount = 0;

  for (const record of records) {
    if (record.completed) {
      completedCount += 1;
      // 노힌트/정답 보기 판정은 결과 화면과 동일한 core 규칙을 재사용한다.
      // attemptsUsed는 firstTry 전용이라 노힌트 집계에는 영향이 없다.
      const { noHint } = getCompletionAchievements({
        hintCount: record.hintCount,
        attemptsUsed: 0,
        revealUsed: record.revealUsed,
      });
      if (noHint) {
        noHintCompletedCount += 1;
      }
    }
  }

  const completionRate =
    totalPuzzles > 0 ? completedCount / totalPuzzles : 0;

  return {
    totalPuzzles,
    completedCount,
    completionRate,
    noHintCompletedCount,
    bestTimeCount: toNonNegativeInt(bestTimeCount),
  };
}
