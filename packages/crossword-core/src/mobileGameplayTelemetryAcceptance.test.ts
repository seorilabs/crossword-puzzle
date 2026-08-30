import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("#338 RN 이탈·진행 계측 인수조건", () => {
  const mobileApp = read("apps/mobile/App.tsx");
  const tracker = read("apps/mobile/gameplayTelemetry.ts");
  const trackerTests = read("apps/mobile/__tests__/gameplayTelemetry.test.ts");
  const parity = read("scripts/check-release-parity.mjs");

  it("AC-1: 화면 이탈·백그라운드·다른 퍼즐 선택에서 abandon을 시도당 1회 발화한다", () => {
    assert.match(mobileApp, /previousRoute === 'today'/);
    assert.match(mobileApp, /state === 'background'/);
    assert.match(mobileApp, /puzzleId !== puzzleId/);
    assert.match(tracker, /abandonedAttemptKeys/);
    assert.match(tracker, /game_puzzle_abandon/);
  });

  it("AC-2: Web과 동일한 이탈 파라미터 키·타입을 사용한다", () => {
    for (const key of [
      "attempt_number",
      "elapsed_seconds",
      "had_first_input",
      "hint_count",
      "last_screen",
      "progress_percent",
      "remaining_attempts",
      "total_words",
      "words_filled",
    ]) {
      assert.match(tracker, new RegExp(key));
    }
  });

  it("AC-3: 25·50·75% 진행 시 puzzle_progress와 game_progress를 함께 발화한다", () => {
    assert.match(mobileApp, /puzzle_progress/);
    assert.match(mobileApp, /game_progress/);
    assert.match(tracker, /getNewlyReachedProgressMilestones/);
  });

  it("AC-4: 완료 퍼즐에는 abandon을 발화하지 않는 테스트가 있다", () => {
    assert.match(tracker, /snapshot\.isCompleted/);
    assert.match(trackerTests, /완료된 퍼즐에는 abandon을 발화하지 않는다/);
  });

  it("AC-5: 첫 입력 상태를 puzzleId:attempt별로 분리하는 직접 테스트가 있다", () => {
    assert.match(tracker, /firstInputAttemptKeys/);
    assert.match(trackerTests, /재시도를 오염시키지 않는다/);
    assert.match(trackerTests, /hasFirstInput\('26083000:2'\)\)\.toBe\(false\)/);
  });

  it("AC-6: release parity와 RN 테스트가 양 표면 이벤트 및 중복 방지를 고정한다", () => {
    for (const eventName of [
      "game_progress",
      "game_puzzle_abandon",
      "puzzle_abandon",
      "puzzle_progress",
    ]) {
      assert.match(parity, new RegExp(eventName));
    }
    assert.match(trackerTests, /시도당 1회/);
    assert.match(trackerTests, /25·50·75%/);
  });
});
