import { formatBestTime } from "./personalStats.ts";

// 홈 "미션 기록" 카드 요약(#300). 기록(history) 화면 도달률이 매우 낮아, 홈 카드에
// 잔존 동기(현재 스트릭·최고 기록 시간)를 미리 보여줘 진입을 유도한다. 표기할
// 데이터가 없으면(스트릭 0 + 유효 최고기록 없음) null 을 돌려주고, 호출부는 기존
// "N번 도전" 문구로 폴백한다.
export type MissionRecordSummary = {
  // 현재 연속 완료일 요약. 스트릭 0이면 null.
  streakLabel: string | null;
  // 보유 최고 기록 중 가장 빠른 풀이 시간 요약. 유효 기록이 없으면 null.
  bestTimeLabel: string | null;
};

export type MissionRecordSummaryInput = {
  // 현재 연속 완료일(연속 스트릭). 0이면 스트릭 요약을 만들지 않는다.
  consecutiveStreak: number;
  // 보유 최고 기록 중 가장 빠른 값(ms). 없으면 null.
  bestTimeMs: number | null;
};

// best-time 요약에 쓸 유효 값 판정. 0/음수/비정상 값은 요약에서 제외한다.
function isValidBestTimeMs(ms: number | null): ms is number {
  return ms != null && Number.isFinite(ms) && ms > 0;
}

/**
 * 홈 미션 기록 카드용 요약을 만든다. 스트릭·최고 기록 중 하나라도 있으면 요약을
 * 돌려주고, 둘 다 없으면 null(호출부가 "N번 도전"으로 폴백)을 돌려준다.
 */
export function buildMissionRecordSummary(
  input: MissionRecordSummaryInput,
): MissionRecordSummary | null {
  const streakLabel =
    input.consecutiveStreak > 0 ? `연속 ${input.consecutiveStreak}일` : null;
  const bestTimeLabel = isValidBestTimeMs(input.bestTimeMs)
    ? `최고 ${formatBestTime(input.bestTimeMs)}`
    : null;
  if (streakLabel == null && bestTimeLabel == null) {
    return null;
  }
  return { streakLabel, bestTimeLabel };
}
