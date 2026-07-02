// mission 완료 성취/최고 기록 판정 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  canGrantExtraAttempt,
  computeElapsedMs,
  computeElapsedSeconds,
  createDailyMissionState,
  getCompletionAchievements,
  getRemainingAttempts,
  grantExtraAttempt,
  startMissionAttempt,
  togglePauseState,
} from "./mission.ts";

describe("getCompletionAchievements", () => {
  it("힌트 0·첫 도전·정답 미공개면 노힌트·첫 도전·최고기록 모두 인정", () => {
    const result = getCompletionAchievements({
      hintCount: 0,
      attemptsUsed: 1,
      revealUsed: false,
    });
    assert.equal(result.noHint, true);
    assert.equal(result.firstTry, true);
    assert.equal(result.bestTimeEligible, true);
  });

  it("힌트를 쓰면 노힌트 배지만 무효(첫 도전·최고기록은 유지)", () => {
    const result = getCompletionAchievements({
      hintCount: 2,
      attemptsUsed: 1,
      revealUsed: false,
    });
    assert.equal(result.noHint, false);
    assert.equal(result.firstTry, true);
    assert.equal(result.bestTimeEligible, true);
  });

  it("두 번째 이상 도전이면 첫 도전 배지만 무효", () => {
    const result = getCompletionAchievements({
      hintCount: 0,
      attemptsUsed: 2,
      revealUsed: false,
    });
    assert.equal(result.noHint, true);
    assert.equal(result.firstTry, false);
    assert.equal(result.bestTimeEligible, true);
  });

  it("정답 보기로 단어를 공개하면 노힌트·첫 도전·최고기록 판정이 모두 무효", () => {
    const result = getCompletionAchievements({
      hintCount: 0,
      attemptsUsed: 1,
      revealUsed: true,
    });
    assert.equal(result.noHint, false);
    assert.equal(result.firstTry, false);
    assert.equal(result.bestTimeEligible, false);
  });

  it("정답 공개는 힌트·도전 수와 무관하게 항상 best-time 후보에서 제외", () => {
    const result = getCompletionAchievements({
      hintCount: 5,
      attemptsUsed: 3,
      revealUsed: true,
    });
    assert.equal(result.noHint, false);
    assert.equal(result.firstTry, false);
    assert.equal(result.bestTimeEligible, false);
  });
});

describe("computeElapsedMs / computeElapsedSeconds (일시정지 반영)", () => {
  const startedAt = "2026-06-29T00:00:00.000Z";

  it("일시정지가 없으면 단순 경과(now - start)를 반환한다", () => {
    const now = new Date("2026-06-29T00:01:40.000Z").getTime(); // +100s
    assert.equal(computeElapsedMs({ startedAt, now }), 100_000);
    assert.equal(computeElapsedSeconds({ startedAt, now }), 100);
  });

  it("누적 일시정지(pausedMs)를 경과에서 제외한다", () => {
    const now = new Date("2026-06-29T00:01:40.000Z").getTime(); // +100s
    assert.equal(
      computeElapsedMs({ startedAt, pausedMs: 30_000, now }),
      70_000,
    );
    assert.equal(
      computeElapsedSeconds({ startedAt, pausedMs: 30_000, now }),
      70,
    );
  });

  it("진행 중 일시정지(pausedAt)면 멈춘 순간 이후 시간은 늘지 않는다", () => {
    const pausedAt = "2026-06-29T00:01:00.000Z"; // +60s에 정지
    // 정지 후 시간이 흘러도(now=+100s) 경과는 60s로 고정된다.
    const now = new Date("2026-06-29T00:01:40.000Z").getTime();
    assert.equal(computeElapsedSeconds({ startedAt, pausedAt, now }), 60);
    const later = new Date("2026-06-29T00:05:00.000Z").getTime();
    assert.equal(
      computeElapsedSeconds({ startedAt, pausedAt, now: later }),
      60,
    );
  });

  it("누적 + 진행 중 정지를 함께 제외한다", () => {
    const now = new Date("2026-06-29T00:03:00.000Z").getTime(); // +180s
    const pausedAt = "2026-06-29T00:02:00.000Z"; // +120s부터 정지
    // 180 - 20(누적) - 60(진행 중 정지: 180-120) = 100
    assert.equal(
      computeElapsedSeconds({ startedAt, pausedMs: 20_000, pausedAt, now }),
      100,
    );
  });

  it("종료(endedAt)가 있으면 진행 중 정지는 더하지 않고 누적만 제외한다", () => {
    const endedAt = "2026-06-29T00:02:00.000Z"; // 완료 +120s
    // 완료 시점에는 진행 중 정지가 없다고 보고 누적(40s)만 제외 → 80s
    assert.equal(
      computeElapsedSeconds({ startedAt, endedAt, pausedMs: 40_000 }),
      80,
    );
  });

  it("정지 시간이 경과를 초과해도 0 미만으로 내려가지 않는다", () => {
    const now = new Date("2026-06-29T00:00:10.000Z").getTime(); // +10s
    assert.equal(computeElapsedMs({ startedAt, pausedMs: 99_000, now }), 0);
  });

  it("시작 시각이 없으면 undefined", () => {
    assert.equal(computeElapsedMs({ now: 1 }), undefined);
    assert.equal(computeElapsedSeconds({}), undefined);
  });
});

describe("togglePauseState", () => {
  it("진행 중이면 now에 정지를 시작한다(pausedAt 설정, pausedMs 유지)", () => {
    const now = new Date("2026-07-01T00:01:00.000Z");
    const next = togglePauseState({ pausedMs: 5_000, pausedAt: null }, now);
    assert.equal(next.pausedAt, now.toISOString());
    assert.equal(next.pausedMs, 5_000);
  });

  it("정지 중이면 멈춘 구간을 pausedMs에 누적하고 재개한다(pausedAt=null)", () => {
    const pausedAt = "2026-07-01T00:00:00.000Z";
    const now = new Date("2026-07-01T00:00:30.000Z"); // 30초 정지
    const next = togglePauseState({ pausedMs: 5_000, pausedAt }, now);
    assert.equal(next.pausedAt, null);
    assert.equal(next.pausedMs, 35_000);
  });

  it("시계 역전 등으로 정지 구간이 음수면 0으로 보정한다", () => {
    const pausedAt = "2026-07-01T00:01:00.000Z";
    const now = new Date("2026-07-01T00:00:00.000Z"); // now < pausedAt
    const next = togglePauseState({ pausedMs: 5_000, pausedAt }, now);
    assert.equal(next.pausedAt, null);
    assert.equal(next.pausedMs, 5_000);
  });

  it("정지→재개 왕복 후 pausedAt은 다시 null이다", () => {
    const start = togglePauseState(
      { pausedMs: 0, pausedAt: null },
      new Date("2026-07-01T00:00:00.000Z"),
    );
    assert.notEqual(start.pausedAt, null);
    const resumed = togglePauseState(
      start,
      new Date("2026-07-01T00:00:10.000Z"),
    );
    assert.equal(resumed.pausedAt, null);
    assert.equal(resumed.pausedMs, 10_000);
  });
});

// 리워드 광고 도전 충전(#204) 정책 테스트. 일일 추가 상한 강제와 성취 공정성
// (추가 기회 완료 시 '첫 도전 성공' 제외)을 고정한다.
describe("grantExtraAttempt / canGrantExtraAttempt", () => {
  it("소진 상태에서 충전하면 maxAttempts +1, 부여 횟수 1이 기록된다", () => {
    const mission = {
      ...createDailyMissionState("2026-07-02", "p1", 3),
      attemptsUsed: 3,
    };
    const granted = grantExtraAttempt(mission, 1);
    assert.equal(granted.maxAttempts, 4);
    assert.equal(granted.extraAttemptsGranted, 1);
    assert.equal(getRemainingAttempts(granted), 1);
  });

  it("일일 추가 상한(기본 1회)에 도달하면 더 충전되지 않는다", () => {
    const mission = {
      ...createDailyMissionState("2026-07-02", "p1", 3),
      attemptsUsed: 4,
      maxAttempts: 4,
      extraAttemptsGranted: 1,
    };
    assert.equal(canGrantExtraAttempt(mission), false);
    const unchanged = grantExtraAttempt(mission);
    assert.equal(unchanged, mission);
    assert.equal(unchanged.maxAttempts, 4);
  });

  it("상한을 2로 올리면 두 번째 충전까지 허용된다", () => {
    const first = grantExtraAttempt(
      { ...createDailyMissionState("2026-07-02", "p1", 3), attemptsUsed: 3 },
      2,
    );
    assert.equal(canGrantExtraAttempt(first, 2), true);
    const second = grantExtraAttempt(first, 2);
    assert.equal(second.maxAttempts, 5);
    assert.equal(second.extraAttemptsGranted, 2);
    assert.equal(canGrantExtraAttempt(second, 2), false);
  });

  it("이미 완료한 미션에는 충전하지 않는다", () => {
    const mission = {
      ...createDailyMissionState("2026-07-02", "p1", 3),
      attemptsUsed: 3,
      completedAt: "2026-07-02T01:00:00.000Z",
    };
    assert.equal(canGrantExtraAttempt(mission), false);
    assert.equal(grantExtraAttempt(mission), mission);
  });

  it("충전 후 startMissionAttempt로 즉시 재도전할 수 있다", () => {
    const exhausted = {
      ...createDailyMissionState("2026-07-02", "p1", 3),
      attemptsUsed: 3,
    };
    assert.equal(startMissionAttempt(exhausted), exhausted); // 소진 시 그대로
    const granted = grantExtraAttempt(exhausted);
    const restarted = startMissionAttempt(
      granted,
      new Date("2026-07-02T02:00:00.000Z"),
    );
    assert.equal(restarted.attemptsUsed, 4);
    assert.equal(getRemainingAttempts(restarted), 0);
  });

  it("추가 기회로 완료하면 attemptsUsed>1이므로 '첫 도전 성공' 배지가 제외된다", () => {
    const granted = grantExtraAttempt({
      ...createDailyMissionState("2026-07-02", "p1", 3),
      attemptsUsed: 3,
    });
    const restarted = startMissionAttempt(granted);
    const achievements = getCompletionAchievements({
      hintCount: 0,
      attemptsUsed: restarted.attemptsUsed,
      revealUsed: false,
    });
    assert.equal(achievements.firstTry, false);
    // 노힌트·최고 기록 후보 판정은 도전 횟수와 무관하게 유지된다.
    assert.equal(achievements.noHint, true);
    assert.equal(achievements.bestTimeEligible, true);
  });
});

// [High 리뷰 대응] 일일 상한은 달력일 누계(grantedToday) 기준으로 강제한다.
// mission.date는 퍼즐 발행일이라, 미션별 부여 횟수만 보면 같은 날 다른 퍼즐의
// '첫 충전'이 상한 검사를 우회할 수 있었다. 누계 전달 시 차단됨을 고정한다.
describe("grantExtraAttempt: 달력일 누계(grantedToday) 상한 강제", () => {
  it("다른 퍼즐에서 이미 충전한 날이면 새 미션의 첫 충전도 차단된다", () => {
    // 미션 B는 아직 충전 이력이 없지만(oB.extraAttemptsGranted 없음),
    // 오늘 누계 1회(grantedToday=1)가 상한(1)에 도달했으므로 차단.
    const missionB = {
      ...createDailyMissionState("2026-07-01", "p-b", 3),
      attemptsUsed: 3,
    };
    assert.equal(canGrantExtraAttempt(missionB, 1, 1), false);
    assert.equal(grantExtraAttempt(missionB, 1, 1), missionB);
  });

  it("누계가 상한 미만이면 충전을 허용하고, 상한을 올리면 추가 충전이 열린다", () => {
    const missionB = {
      ...createDailyMissionState("2026-07-01", "p-b", 3),
      attemptsUsed: 3,
    };
    assert.equal(canGrantExtraAttempt(missionB, 2, 1), true);
    const granted = grantExtraAttempt(missionB, 2, 1);
    assert.equal(granted.maxAttempts, 4);
    assert.equal(granted.extraAttemptsGranted, 1);
  });

  it("누계가 미션 자체 부여 횟수보다 작아도 미션 부여 횟수가 상한이면 차단(방어적 max)", () => {
    const mission = {
      ...createDailyMissionState("2026-07-01", "p-a", 3),
      attemptsUsed: 4,
      maxAttempts: 4,
      extraAttemptsGranted: 1,
    };
    // 잘못된 누계(0)가 들어와도 미션에 기록된 부여 횟수로 상한을 지킨다.
    assert.equal(canGrantExtraAttempt(mission, 1, 0), false);
    assert.equal(grantExtraAttempt(mission, 1, 0), mission);
  });

  it("grantedToday를 생략하면 기존처럼 미션 부여 횟수 기준으로 동작한다(하위호환)", () => {
    const mission = {
      ...createDailyMissionState("2026-07-01", "p-a", 3),
      attemptsUsed: 3,
    };
    assert.equal(canGrantExtraAttempt(mission, 1), true);
  });
});
