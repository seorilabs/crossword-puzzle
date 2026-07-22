// #292 인수조건(AC-1~AC-5)을 이슈 원문 그대로의 테스트명으로 직접 검증한다.
// 스트릭/개인 통계 진척 이벤트(streak_view·streak_milestone·personal_stats_view)의
// 스키마·발화 배선·숫자형 파라미터·노출당 1회 가드·발화 조건을 core 실행 경로로 고정한다.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import {
  buildGameProgressionEvent,
  createGameAnalyticsClient,
  emitProgressionScreenView,
  emitStreakMilestoneIfReached,
  GAME_ANALYTICS_SCHEMA_VERSION,
  type GameAnalyticsClient,
} from "./gameAnalytics.ts";

type Emitted = { name: string; params: Record<string, unknown> };

// 발화 이벤트를 그대로 수집하는 테스트용 클라이언트. core의 실제 팬아웃 경로
// (createGameAnalyticsClient → sink.logGameEvent)를 그대로 태운다.
function createRecordingClient(market = "apps-in-toss" as const): {
  client: GameAnalyticsClient;
  emitted: Emitted[];
} {
  const emitted: Emitted[] = [];
  const client = createGameAnalyticsClient({
    market,
    sinks: [
      {
        id: "recorder",
        logGameEvent: (name, params) => emitted.push({ name, params }),
      },
    ],
  });
  return { client, emitted };
}

function readWebApp(): string {
  return readFileSync(new URL("../../../src/App.tsx", import.meta.url), "utf8");
}

describe("#292 진척 이벤트 계측 인수조건", () => {
  it("AC-1: gameAnalytics.ts(코어)에 위 이벤트 스키마 정의 (이벤트명·파라미터 타입)", () => {
    // 코어 gameAnalytics 계약이 세 진척 이벤트를 이벤트명 + 파라미터 키·타입으로
    // 정의함을 빌더 실행 경로로 확인한다. 각 이벤트의 파라미터는 숫자형(타입) 유지.
    const streakView = buildGameProgressionEvent("streak_view", {
      market: "apps-in-toss",
      payload: { currentStreak: 6, longestStreak: 12 },
    });
    assert.equal(streakView.name, "streak_view");
    assert.equal(streakView.params.current_streak, 6);
    assert.equal(streakView.params.longest_streak, 12);
    assert.equal(typeof streakView.params.current_streak, "number");
    assert.equal(typeof streakView.params.longest_streak, "number");
    assert.equal(streakView.params.schema_version, GAME_ANALYTICS_SCHEMA_VERSION);

    const milestone = buildGameProgressionEvent("streak_milestone", {
      market: "google-play",
      payload: { streakLength: 7 },
    });
    assert.equal(milestone.name, "streak_milestone");
    assert.equal(milestone.params.streak_length, 7);
    assert.equal(typeof milestone.params.streak_length, "number");

    const statsView = buildGameProgressionEvent("personal_stats_view", {
      market: "app-store",
      payload: { totalPuzzles: 20, completedCount: 13 },
    });
    assert.equal(statsView.name, "personal_stats_view");
    assert.equal(statsView.params.total_puzzles, 20);
    assert.equal(statsView.params.completed_count, 13);
    assert.equal(typeof statsView.params.total_puzzles, "number");
    assert.equal(typeof statsView.params.completed_count, "number");

    // 세 진척 이벤트명이 계약에 정의되어 있다(스키마 커버리지).
    assert.deepEqual(
      [streakView.name, milestone.name, statsView.name],
      ["streak_view", "streak_milestone", "personal_stats_view"],
    );

    // 진척 이벤트는 퍼즐(콘텐츠) 컨텍스트를 싣지 않는다(화면·계정 단위 신호).
    assert.ok(!("puzzle_id" in streakView.params));
  });

  it("AC-2: 스트릭 캘린더/통계 화면 노출 시점과 스트릭 갱신 시점에 실제 발화 배선", () => {
    // 실행 경로 1 — 화면 노출: 노출 헬퍼가 노출 이벤트 2종을 발화한다.
    const view = createRecordingClient();
    emitProgressionScreenView(view.client, {
      totalPuzzles: 4,
      completedCount: 2,
      currentStreak: 3,
      longestStreak: 9,
    });
    assert.deepEqual(
      view.emitted.map((e) => e.name),
      ["personal_stats_view", "streak_view"],
    );

    // 실행 경로 2 — 스트릭 갱신: 완료로 마일스톤 도달 시 갱신 이벤트를 발화한다.
    const update = createRecordingClient();
    const reached = emitStreakMilestoneIfReached(update.client, 6, 7);
    assert.equal(reached, 7);
    assert.deepEqual(
      update.emitted.map((e) => e.name),
      ["streak_milestone"],
    );

    // 웹 배선: HistoryScreen 노출 effect와 완료(스트릭 갱신) 경로가 각 헬퍼를 호출한다.
    const webApp = readWebApp();
    assert.match(webApp, /emitProgressionScreenView\(\s*gameAnalytics/);
    assert.match(webApp, /emitStreakMilestoneIfReached\(\s*gameAnalytics/);
  });

  it("AC-3: 파라미터는 숫자형 유지 (string 적재 금지)", () => {
    const { client, emitted } = createRecordingClient();
    emitProgressionScreenView(client, {
      totalPuzzles: 4,
      completedCount: 2,
      currentStreak: 3,
      longestStreak: 9,
    });
    emitStreakMilestoneIfReached(client, 6, 7);

    // 모든 진척 이벤트의 수치 파라미터는 number로 적재된다(string 금지).
    const numericKeys = [
      "total_puzzles",
      "completed_count",
      "current_streak",
      "longest_streak",
      "streak_length",
    ];
    for (const event of emitted) {
      for (const key of numericKeys) {
        if (key in event.params) {
          assert.equal(
            typeof event.params[key],
            "number",
            `${event.name}.${key} 는 숫자형이어야 한다`,
          );
        }
      }
    }
  });

  it("AC-4: 발화 가드: 화면 노출당 1회 (렌더 반복 재발화 금지)", () => {
    // 노출 헬퍼 1회 호출 = 각 노출 이벤트 정확히 1회(중복 발화 없음).
    const { client, emitted } = createRecordingClient();
    emitProgressionScreenView(client, {
      totalPuzzles: 4,
      completedCount: 2,
      currentStreak: 3,
      longestStreak: 9,
    });
    assert.equal(
      emitted.filter((e) => e.name === "streak_view").length,
      1,
    );
    assert.equal(
      emitted.filter((e) => e.name === "personal_stats_view").length,
      1,
    );

    // 웹 가드: 노출 헬퍼 호출이 빈 의존성 useEffect(마운트당 1회) 안에 있어
    // 렌더 반복으로 재발화하지 않는다. HistoryScreen은 route가 history일 때만
    // 조건부 마운트되므로 마운트당 1회 = 화면 노출당 1회다.
    const webApp = readWebApp();
    assert.match(
      webApp,
      /emitProgressionScreenView\(\s*gameAnalytics[\s\S]*?\}\s*,\s*\[\]\s*\)/,
    );
  });

  it("AC-5: 단위 테스트: 이벤트 발화 조건·파라미터 검증", () => {
    // 발화 조건 — 마일스톤을 넘긴 완료에서만 발화한다(경계·미도달·재도달 방지).
    const crossing = createRecordingClient();
    assert.equal(emitStreakMilestoneIfReached(crossing.client, 6, 7), 7);
    assert.equal(emitStreakMilestoneIfReached(crossing.client, 29, 30), 30);
    assert.equal(crossing.emitted.length, 2);

    const noCrossing = createRecordingClient();
    // 마일스톤 미도달 증가는 발화하지 않는다.
    assert.equal(emitStreakMilestoneIfReached(noCrossing.client, 7, 8), null);
    // 이미 넘긴 마일스톤(이전 ≥ 임계)은 재발화하지 않는다.
    assert.equal(emitStreakMilestoneIfReached(noCrossing.client, 7, 7), null);
    assert.equal(noCrossing.emitted.length, 0);

    // 파라미터 — 발화 시 streak_length는 도달 시점의 실제 스트릭이고, 노출 이벤트는
    // 입력 집계를 그대로 싣는다.
    const params = createRecordingClient();
    emitStreakMilestoneIfReached(params.client, 99, 100);
    emitProgressionScreenView(params.client, {
      totalPuzzles: 20,
      completedCount: 13,
      currentStreak: 5,
      longestStreak: 11,
    });
    const byName = Object.fromEntries(
      params.emitted.map((e) => [e.name, e.params]),
    );
    assert.equal(byName.streak_milestone.streak_length, 100);
    assert.equal(byName.personal_stats_view.total_puzzles, 20);
    assert.equal(byName.personal_stats_view.completed_count, 13);
    assert.equal(byName.streak_view.current_streak, 5);
    assert.equal(byName.streak_view.longest_streak, 11);
  });
});
