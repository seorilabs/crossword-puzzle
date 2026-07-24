import { formatBestTime } from "./personalStats.ts";

// 홈 "미션 기록" 카드 요약(#300). 현재 스트릭(연속 완료일)과 최고 기록 시간을
// 카드에 미리 노출해 기록 화면 진입 동기를 만든다. 표기할 데이터가 하나도 없으면
// null을 반환해 호출부가 기존 "N번 도전" 문구로 폴백하도록 한다.
export type MissionRecordSummary = {
  // 연속 완료일(1 이상). 0이면 null로 두어 스트릭 문구를 감춘다.
  streakDays: number | null;
  // 기기 보유 최고 기록 중 최단 시간의 표시 문자열(mm:ss / h:mm:ss). 없으면 null.
  bestTimeLabel: string | null;
};

// consecutiveStreak: 연속 완료일. fastestBestTimeMs: computePersonalStats가
// 유효 값만으로 집계한 최단 최고 기록(ms) 또는 null(보유 0건).
export function buildMissionRecordSummary(input: {
  consecutiveStreak: number;
  fastestBestTimeMs: number | null;
}): MissionRecordSummary | null {
  const streakDays =
    input.consecutiveStreak > 0 ? input.consecutiveStreak : null;
  const bestTimeLabel =
    input.fastestBestTimeMs != null
      ? formatBestTime(input.fastestBestTimeMs)
      : null;

  // 스트릭·최고 기록 둘 다 없으면 요약을 만들지 않는다(기존 문구 유지).
  if (streakDays == null && bestTimeLabel == null) {
    return null;
  }

  return { streakDays, bestTimeLabel };
}
