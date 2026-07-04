import { getCompletionAchievements } from "./mission.ts";

// 결과 공유 텍스트를 만든다(Wordle식). 제목·이모지 격자·풀이 통계·성취 배지·연속
// 도전·완성 개수에 더해, 앱으로 유입시킬 진입 링크(#227)를 말미에 한 줄 덧붙인다.
// 링크 값(shareLandingUrl)은 코드 하드코딩이 아니라 환경변수/Remote Config로 주입하며,
// 값이 비어 있으면 링크 줄을 붙이지 않아 기존 공유 텍스트와 바이트 단위로 동일하다
// (하위호환). 정답 글자는 노출하지 않고(격자는 buildShareGrid가 담당) React import
// 없는 순수 함수라 3마켓(웹/모바일)이 공유하고 단위 테스트로 고정할 수 있다.
export function buildShareText({
  puzzleLabel,
  elapsedLabel,
  hintCount,
  attemptsUsed,
  completedCount,
  totalCount,
  consecutiveStreak,
  isComplete,
  revealUsed,
  shareGrid,
  shareLandingUrl,
}: {
  puzzleLabel: string;
  elapsedLabel: string | null;
  hintCount: number;
  attemptsUsed: number;
  completedCount: number;
  totalCount: number;
  consecutiveStreak: number;
  isComplete: boolean;
  revealUsed: boolean;
  shareGrid: string;
  // 앱 진입 링크(선택). 환경변수/Remote Config 주입값. 비어 있으면 링크 줄을 생략한다.
  shareLandingUrl?: string;
}): string {
  const lines: string[] = [`가로세로 낱말 퍼즐 ${puzzleLabel}`];
  // 제목 바로 아래에 완성 상태를 표현하는 이모지 격자를 덧붙인다(정답 글자 노출 없음).
  if (shareGrid.length > 0) lines.push(shareGrid);
  lines.push("");

  const stats: string[] = [];
  if (elapsedLabel != null) stats.push(`⏱ ${elapsedLabel}`);
  stats.push(`도전 ${attemptsUsed}회`);
  if (hintCount > 0) stats.push(`힌트 ${hintCount}회`);
  lines.push(stats.join(" · "));

  const achievements = getCompletionAchievements({
    hintCount,
    attemptsUsed,
    revealUsed,
  });
  const badges: string[] = [];
  if (isComplete && achievements.noHint) badges.push("🎯 노힌트 클리어");
  if (isComplete && achievements.firstTry) badges.push("💎 첫 도전 성공");
  if (badges.length > 0) lines.push(badges.join(" · "));

  if (consecutiveStreak >= 100) {
    lines.push(`🏆 ${consecutiveStreak}일 연속 달성!`);
  } else if (consecutiveStreak >= 30) {
    lines.push(`🏆 ${consecutiveStreak}일째 — 한 달 연속 도전 중!`);
  } else if (consecutiveStreak >= 7) {
    lines.push(`🔥 ${consecutiveStreak}일째 — 일주일 연속 도전 중!`);
  } else if (consecutiveStreak > 0) {
    lines.push(`🔥 ${consecutiveStreak}일째 도전 중`);
  }

  lines.push(
    isComplete
      ? `낱말 ${completedCount}/${totalCount}개 완성 🎉`
      : `낱말 ${completedCount}/${totalCount}개 도전`,
  );

  // 앱 진입 링크(#227). 자랑 텍스트 뒤에 "따라 할 링크"를 붙여 공유 → 재유입/설치로
  // 이어지는 바이럴 루프를 만든다. 주입값이 없으면(하위호환) 아무 줄도 추가하지 않는다.
  const landingUrl = shareLandingUrl?.trim() ?? "";
  if (landingUrl.length > 0) {
    lines.push("");
    lines.push(`앱에서 풀어보기 👉 ${landingUrl}`);
  }

  return lines.join("\n");
}
