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
  // 보유한 최고 기록 수(유효한 best-time 값의 개수)
  bestTimeCount: number;
  // 보유 최고 기록 중 가장 빠른 기록(ms). 보유 0건이면 null.
  fastestBestTimeMs: number | null;
  // 보유 최고 기록의 평균(ms, 반올림). 보유 0건이면 null.
  averageBestTimeMs: number | null;
};

// ms 값이 유효한 풀이 시간(유한·양수)인지 판정. best-time 저장소가 넘길 수 있는
// 0/음수/NaN 을 집계·표시 전에 걸러 낸다.
function isValidBestTimeMs(ms: number): boolean {
  return Number.isFinite(ms) && ms > 0;
}

// 새 완료 기록이 보유 최고 기록을 갱신하는지 판정한다. 유효한(유한·양수) 소요 시간이고
// 기존 기록이 없거나 더 빠를 때만 true 다. 웹·RN 완료 효과가 같은 규칙을 쓴다.
export function shouldRecordBestTime(
  currentBestMs: number | null | undefined,
  elapsedMs: number,
): boolean {
  if (!isValidBestTimeMs(elapsedMs)) {
    return false;
  }
  return currentBestMs == null || elapsedMs < currentBestMs;
}

/** 풀이 시간 분포의 한 구간(막대 1개). */
export type SolveTimeBucket = {
  // 구간 라벨(예: "1분 미만")
  label: string;
  // 이 구간에 속한 최고 기록 수
  count: number;
};

/** 보유 최고 기록의 풀이 시간 분포. HistoryScreen 분포 차트가 표시한다. */
export type SolveTimeDistribution = {
  // 구간별 빈도(항상 고정 길이·고정 순서)
  buckets: SolveTimeBucket[];
  // 유효 기록 총수(= 모든 구간 count 합). 0이면 표시할 데이터가 없다.
  total: number;
  // 막대 스케일 기준이 되는 최대 빈도. 0이면 빈 분포.
  maxCount: number;
};

// 분포 구간 정의(초 단위 상한, 미만 기준). 마지막 구간은 상한 Infinity 라 항상
// 매칭된다. 경계값(예: 정확히 60초)은 "미만" 규칙에 따라 다음 구간에 들어간다.
const SOLVE_TIME_BUCKET_DEFS: readonly { label: string; maxSeconds: number }[] =
  [
    { label: "1분 미만", maxSeconds: 60 },
    { label: "1–2분", maxSeconds: 120 },
    { label: "2–3분", maxSeconds: 180 },
    { label: "3–5분", maxSeconds: 300 },
    { label: "5분+", maxSeconds: Number.POSITIVE_INFINITY },
  ];

/**
 * 보유 최고 기록(ms) 배열을 고정 구간으로 버킷팅해 풀이 시간 분포를 만든다.
 * computePersonalStats 와 동일한 유효성 규칙(유한·양수)으로 오염 값을 걸러 내므로
 * total 은 bestTimeCount 와 일치한다. 입력이 비면(완료/보유 0건) 모든 count 가 0,
 * total·maxCount 가 0 이라 호출부가 차트 대신 빈 상태를 유지할 수 있다.
 */
export function computeSolveTimeDistribution(
  bestTimeValuesMs: readonly number[] = [],
): SolveTimeDistribution {
  const counts = SOLVE_TIME_BUCKET_DEFS.map(() => 0);
  let total = 0;

  for (const ms of bestTimeValuesMs) {
    if (!isValidBestTimeMs(ms)) {
      continue;
    }
    const seconds = ms / 1000;
    const index = SOLVE_TIME_BUCKET_DEFS.findIndex(
      (bucket) => seconds < bucket.maxSeconds,
    );
    // 마지막 구간이 Infinity 라 findIndex 는 항상 유효 인덱스를 반환한다.
    counts[index] += 1;
    total += 1;
  }

  const maxCount = counts.reduce((max, count) => Math.max(max, count), 0);
  const buckets = SOLVE_TIME_BUCKET_DEFS.map((bucket, index) => ({
    label: bucket.label,
    count: counts[index],
  }));

  return { buckets, total, maxCount };
}

/**
 * best-time(ms)을 시:분:초 문자열로 포맷한다. 1시간 미만은 두 자리 `mm:ss`,
 * 1시간 이상은 분 자리 폭 붕괴(예: `75:30`)를 막기 위해 `h:mm:ss` 로 표기한다.
 * 유효하지 않은 값(0/음수/NaN/Infinity)은 `"00:00"` 으로 안전 처리한다. 호출부는
 * 값이 있을 때만(예: fastestBestTimeMs 가 null 이 아닐 때) 렌더하므로 빈 상태에서
 * `00:00` 이 노출되지는 않는다.
 */
export function formatBestTime(ms: number): string {
  const safeMs = isValidBestTimeMs(ms) ? ms : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}

/** 홈 "미션 기록" 카드 요약 입력. 재방문 레버(스트릭·통산 최고 기록) 미리보기용. */
export type MissionHistoryCardSummaryInput = {
  // 현재 연속 완료일(스트릭). 0 이하/비유한이면 표시하지 않는다.
  consecutiveStreak: number;
  // 통산 보유 최고 기록 중 가장 빠른 값(ms). 없으면 null.
  fastestBestTimeMs: number | null;
};

/**
 * 홈 "미션 기록" 카드에 노출할 값 문구를 만든다. 현재 스트릭·통산 최고 기록을
 * 요약해, 기록 화면에 도달하기 전에 잔존 가치를 미리 보여준다(#300). 표시할
 * 데이터가 하나도 없으면 null 을 반환해, 호출부가 기존 "N번 도전" 문구를
 * 그대로 유지하도록 한다.
 */
export function formatMissionHistoryCardSummary({
  consecutiveStreak,
  fastestBestTimeMs,
}: MissionHistoryCardSummaryInput): string | null {
  const parts: string[] = [];
  if (Number.isFinite(consecutiveStreak) && consecutiveStreak > 0) {
    parts.push(`🔥 ${Math.floor(consecutiveStreak)}일 연속`);
  }
  if (fastestBestTimeMs != null && isValidBestTimeMs(fastestBestTimeMs)) {
    parts.push(`⏱ 최고 ${formatBestTime(fastestBestTimeMs)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * 기기에 남은 퍼즐 기록 배열에서 개인 누적 통계를 집계한다.
 *
 * - 완료율은 `completedCount / totalPuzzles`이며, 대상이 0건이면 0이다.
 * - 노힌트 완료 수는 완료한 기록 중 `getCompletionAchievements`가 노힌트로 판정한
 *   것만 센다. 결과 화면 배지와 동일한 단일 규칙을 공유해, 같은 퍼즐에서
 *   '히스토리 노힌트 수'와 '결과 노힌트 배지'가 어긋나지 않도록 한다.
 * - best-time 값은 기기에 보유한 전체 최고 기록(ms) 배열을 호출자가 직접 넘긴다.
 *   archive 기록 집합과 무관하게 실제 보유분을 반영하도록 분리한 입력이며,
 *   유효한(유한·양수) 값만으로 개수·최소·평균을 집계한다. 보유 0건이면
 *   fastest/average 는 null(빈 상태에서 NaN·00:00 노출 방지)이다.
 */
export function computePersonalStats(
  records: readonly PersonalStatsRecord[],
  bestTimeValuesMs: readonly number[] = [],
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

  // 유효한 best-time 값만으로 개수·최소·평균을 집계한다. 오염 값(0/음수/NaN)은
  // 개수에도 포함하지 않아 '최고 기록 수'와 실제 표시 시간이 어긋나지 않는다.
  const validBestTimes = bestTimeValuesMs.filter(isValidBestTimeMs);
  const bestTimeCount = validBestTimes.length;
  const fastestBestTimeMs =
    bestTimeCount > 0 ? Math.min(...validBestTimes) : null;
  const averageBestTimeMs =
    bestTimeCount > 0
      ? Math.round(
          validBestTimes.reduce((sum, ms) => sum + ms, 0) / bestTimeCount,
        )
      : null;

  return {
    totalPuzzles,
    completedCount,
    completionRate,
    noHintCompletedCount,
    bestTimeCount,
    fastestBestTimeMs,
    averageBestTimeMs,
  };
}
