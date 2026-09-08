import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

// 홈 사다리(워밍업 → 오늘의 퍼즐) + 주간 스트릭 스트립 인수조건. 두 표면이 같은 core
// 정책(buildDailyLadder / buildWeeklyStreakStrip / computeConsecutiveStreakDays)을
// 쓰고, 병렬 난이도 선택·죽은 원탭 CTA·표면별 스트릭 계산이 남지 않았는지 고정한다.
describe("홈 사다리·주간 스트릭 인수조건", () => {
  const webApp = read("src/App.tsx");
  const mobileApp = read("apps/mobile/App.tsx");
  const webStreakAdapter = read("src/adapters/localMissionRepository.ts");
  const mobileCompletionDates = read("apps/mobile/completionDatesRepository.ts");
  const webLadderCard = read("src/components/DailyLadderCard.tsx");
  const webStrip = read("src/components/WeeklyStreakStrip.tsx");
  const recommendation = read("packages/crossword-core/src/recommendation.ts");
  const releaseParity = read("scripts/check-release-parity.mjs");

  it("AC-1: 두 표면이 core 사다리로 오늘의 두 난이도를 단계로 만들고 단계 탭이 곧 시작이다", () => {
    for (const source of [webApp, mobileApp]) {
      assert.match(source, /buildDailyLadder\(/);
      assert.match(source, /buildDailyLadderCtaParams\(/);
      assert.match(source, /async function startLadderStep\(/);
      assert.match(source, /formatDailyLadderNextLabel\(/);
    }
    assert.match(webApp, /<DailyLadderCard/);
    assert.match(webLadderCard, /dailyLadderStepNext/);
    assert.match(mobileApp, /function renderDailyLadder\(\)/);
    // 완료·도전 소진 판은 풀이(읽기 전용) 대신 결과 화면으로 보낸다(이전 홈 CTA 동일).
    for (const source of [webApp, mobileApp]) {
      assert.match(
        source,
        /const isExhausted =\s*nextMission\.completedAt == null &&\s*alreadyStarted &&\s*getRemainingAttempts\(nextMission\) === 0;/,
      );
    }
  });

  it("AC-2: 주간 스트릭 스트립과 마일스톤 넛지가 두 표면 홈에 있다", () => {
    for (const source of [webApp, mobileApp]) {
      assert.match(source, /buildWeeklyStreakStrip\(/);
      assert.match(source, /formatStreakStripHeadline\(/);
      assert.match(source, /getStreakMilestoneProgress\(/);
    }
    assert.match(webApp, /<WeeklyStreakStrip/);
    assert.match(webStrip, /weeklyStreakDayToday/);
    assert.match(mobileApp, /function renderWeeklyStreakStrip\(\)/);
  });

  it("AC-3: 스트릭 규칙은 core 하나만 쓰고 마일스톤 이전 값은 비관 계산이다", () => {
    assert.match(webStreakAdapter, /computeConsecutiveStreakDays\(completedDates, today, \{/);
    assert.match(webApp, /readConsecutiveStreakDays\(\{\s*countTodayPending: false,?\s*\}\)/);
    // RN 스트릭은 완료일 집합에서 파생해 초기 hydrate 직후에도 0 으로 남지 않는다.
    // 완료일 집합은 아카이브(30건 상한)가 아니라 누적 완료일 저장소에서 읽고, 저장소가
    // 구버전 아카이브·미션 키를 core collectCompletedDates 로 백필한다.
    assert.match(
      mobileApp,
      /const consecutiveStreak = useMemo\(\s*\(\) => computeConsecutiveStreakDays\(completedDates, todayKey\)/,
    );
    assert.match(mobileApp, /const completedDates = useMemo\(\s*\(\) => new Set\(completionDates\)/);
    assert.match(mobileCompletionDates, /collectCompletedDates\(/);
    assert.doesNotMatch(mobileApp, /setConsecutiveStreak/);
    assert.doesNotMatch(mobileApp, /computeMobileStreakDays/);
  });

  it("AC-4: 완료 후 추천은 같은 날짜 사다리 단계를 먼저 잇고 램프는 온보딩 퍼즐에만 개입한다", () => {
    assert.match(recommendation, /DAILY_PUZZLE_TIERS/);
    assert.match(recommendation, /onboardingPuzzleId/);
    assert.match(webApp, /onboardingPuzzleId: onboardingPuzzle\.puzzleId/);
    for (const source of [webApp, mobileApp]) {
      assert.match(source, /date: puzzle\.date,/);
    }
  });

  it("AC-5: 병렬 난이도 선택·죽은 원탭 CTA·표면별 정렬 상수가 남아 있지 않다", () => {
    for (const source of [webApp, mobileApp]) {
      assert.doesNotMatch(source, /DIFFICULTY_RANK/);
    }
    assert.doesNotMatch(webApp, /homeQuickStart/);
    assert.doesNotMatch(webApp, /shouldQuickStartActivePuzzle/);
    assert.doesNotMatch(webApp, /startTodayPuzzle/);
    assert.doesNotMatch(webApp, /todayStartButton/);
    assert.doesNotMatch(mobileApp, /renderDifficultyPicker/);
    assert.doesNotMatch(mobileApp, /difficultyChip/);
  });

  it("AC-6: release parity가 사다리·스트립 마커를 두 표면에 고정한다", () => {
    assert.match(releaseParity, /"buildDailyLadder"/);
    assert.match(releaseParity, /"buildWeeklyStreakStrip"/);
    assert.match(releaseParity, /"startLadderStep"/);
  });
});
