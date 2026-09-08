import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

// RN 기록·통계·공유 패리티 인수조건. RN 화면이 core 계약(personalStats·streakCalendar·
// shareText/shareGrid/shareResult·gameAnalytics)을 쓰고, 표면 전용 로직이 남지 않았는지
// 소스 grep 으로 고정한다(mobileGameplayTelemetryAcceptance 패턴).
describe("RN 기록·통계·공유 패리티 인수조건", () => {
  const mobileApp = read("apps/mobile/App.tsx");
  const mobileShare = read("apps/mobile/shareResult.ts");
  const mobileArchive = read("apps/mobile/puzzleArchive.ts");
  const mobileCompletionDates = read("apps/mobile/completionDatesRepository.ts");
  const mobileBestTimes = read("apps/mobile/bestTimeRepository.ts");
  const mobileRecords = read("apps/mobile/recordsComponents.tsx");
  const webShareHook = read("src/useShareResult.ts");
  const webApp = read("src/App.tsx");
  const releaseParity = read("scripts/check-release-parity.mjs");
  const completionDatesTests = read(
    "apps/mobile/__tests__/completionDatesRepository.test.ts",
  );
  const bestTimeTests = read("apps/mobile/__tests__/bestTimeRepository.test.ts");

  it("AC-1: RN 기록 화면은 core 통계·히트맵 계약을 그대로 쓴다", () => {
    for (const name of [
      "computePersonalStats(",
      "computeSolveTimeDistribution(",
      "buildStreakCalendarWeeks(",
      "computeLongestStreakDays(",
      "<PersonalStatsCard",
      "<StreakHeatmap",
    ]) {
      assert.ok(mobileApp.includes(name), `apps/mobile/App.tsx 에 ${name} 이 있어야 한다`);
    }
    assert.match(mobileRecords, /buildStreakCalendarMonthLabels\(/);
    assert.match(mobileRecords, /formatBestTime\(/);
  });

  it("AC-2: 기록 화면 진입마다 진척 화면 노출을 1회 계측하고 스트릭 마일스톤을 발화한다", () => {
    assert.match(
      mobileApp,
      /route !== 'history'\)\s*\{\s*return;\s*\}\s*emitProgressionScreenView\(\s*gameAnalytics/,
    );
    assert.match(mobileApp, /\}, \[isLoading, route\]\);/);
    assert.match(mobileApp, /emitStreakMilestoneIfReached\(\s*gameAnalytics/);
    // 이전 값은 비관 계산(오늘 몫 제외)으로 읽어 완료 전후가 갈린다.
    assert.match(mobileApp, /\{ countTodayPending: false \},?\s*\)/);
  });

  it("AC-3: 완료 모달·결과 화면 배지는 core getCompletionAchievements 를 쓰고 최고 기록 갱신을 보여 준다", () => {
    assert.match(mobileApp, /getCompletionAchievements\(\{/);
    assert.doesNotMatch(mobileApp, /hintCount === 0 &&/);
    assert.doesNotMatch(mobileApp, /mission\.attemptsUsed === 1 &&/);
    assert.ok((mobileApp.match(/최고 기록 갱신/g) ?? []).length >= 2);
    assert.match(mobileApp, /mobileBestTimeRepository\s*\.recordBestTime\(/);
    assert.match(mobileBestTimes, /shouldRecordBestTime\(/);
    assert.match(webApp, /shouldRecordBestTime\(/);
    assert.match(bestTimeTests, /같은 기록·느린 기록은 갱신하지 않는다/);
  });

  it("AC-4: 공유는 core 문구·이모지 격자·이벤트 계약을 쓰고 로컬 문구 빌더가 없다", () => {
    assert.doesNotMatch(mobileApp, /buildResultShareText/);
    assert.ok((mobileApp.match(/결과 공유하기/g) ?? []).length >= 2);
    assert.match(mobileApp, /surface: 'completion_dialog'/);
    assert.match(mobileApp, /surface: 'result_screen'/);
    assert.match(mobileApp, /<ShareGridPreview shareGrid=\{shareGrid\}/);
    for (const name of [
      "buildShareText",
      "buildShareGrid",
      "SHARE_RESULT_CLICK_EVENT",
      "SHARE_RESULT_OUTCOME_EVENT",
    ]) {
      assert.ok(mobileShare.includes(name), `shareResult.ts 에 ${name}`);
      assert.ok(
        webShareHook.includes(name) || name === "buildShareText" || name === "buildShareGrid",
        `useShareResult.ts 에 ${name}`,
      );
    }
  });

  it("AC-5: 완료일·최고 기록 저장소가 있고 구버전 기기는 1회 백필한다", () => {
    assert.match(mobileArchive, /hintCount\?: number/);
    assert.match(mobileArchive, /revealUsed\?: boolean/);
    assert.match(mobileCompletionDates, /getAllKeys/);
    assert.match(mobileCompletionDates, /COMPLETION_DATES_MIGRATED_KEY/);
    assert.match(mobileApp, /migrateCompletionDatesIfNeeded\(\{/);
    assert.match(mobileApp, /\.addCompletionDate\(nextMission\.date\)/);
    assert.match(
      completionDatesTests,
      /구버전 archive와 mission 키에서 완료일을 1회 백필한다/,
    );
    // 스트릭·히트맵은 누적 완료일 저장소에서 파생한다(아카이브 30건 상한 무관).
    assert.match(mobileApp, /const completedDates = useMemo\(\s*\(\) => new Set\(completionDates\)/);
  });

  it("AC-6: 진행 마일스톤 보상 토스트와 기록 진입 계측이 웹과 같다", () => {
    assert.match(mobileApp, /getProgressMilestoneRewardMessage\(/);
    assert.match(mobileApp, /styles\.progressToast\b/);
    assert.match(mobileApp, /telemetry\.click\('history_open', \{ source: 'completion_dialog' \}\)/);
    assert.match(mobileApp, /telemetry\.click\('history_open', \{ source: 'home_card' \}\)/);
  });

  it("AC-7: release parity 가 기록·공유 마커를 두 표면에 고정한다", () => {
    for (const marker of [
      '"computePersonalStats"',
      '"buildStreakCalendarWeeks"',
      '"emitProgressionScreenView"',
      '"emitStreakMilestoneIfReached"',
      '"getCompletionAchievements"',
      '"getProgressMilestoneRewardMessage"',
      '"isNewBestTime"',
      '"history_open"',
    ]) {
      assert.ok(releaseParity.includes(marker), `parity 마커 ${marker}`);
    }
    assert.match(releaseParity, /buildResultShareText/);
  });
});
