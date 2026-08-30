import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("#344 RN screen_view 인수조건", () => {
  const firebaseClient = read("apps/mobile/firebaseClient.ts");
  const mobileSinks = read("apps/mobile/analyticsSinks.ts");
  const mobileTests = read("apps/mobile/__tests__/firebaseClient.test.ts");
  const webSinks = read("src/adapters/analyticsSinks.ts");

  it("AC-1·2: RN screen 분기는 logScreenView 전용 함수와 예약 필드를 사용한다", () => {
    assert.match(firebaseClient, /analytics\(\)\.logScreenView\(\{/);
    assert.match(firebaseClient, /screen_name: screenName/);
    assert.match(firebaseClient, /screen_class: screenName/);
    assert.match(
      mobileSinks,
      /logFirebaseScreenView\(event\.name, event\.params\)/,
    );
    assert.doesNotMatch(mobileSinks, /firebase_screen: event\.name/);
  });

  it("AC-3: 화면 부가 파라미터에서 firebase_ 예약 접두사를 제거한다", () => {
    assert.match(firebaseClient, /!key\.startsWith\('firebase_'\)/);
    assert.match(mobileTests, /firebase_screen: 'rejected'/);
    assert.match(mobileTests, /firebase_test: 'rejected'/);
    assert.match(mobileTests, /screen_name: 'today'/);
  });

  it("AC-4: Web AIT sink는 기존 screen_view firebase_screen 경로를 유지한다", () => {
    assert.match(webSinks, /logFirebaseAnalyticsEvent\("screen_view", \{/);
    assert.match(webSinks, /firebase_screen: event\.name/);
  });

  it("AC-5: RN 전용 함수 호출과 logEvent 미호출을 단위 테스트로 고정한다", () => {
    const sinkTests = read("apps/mobile/__tests__/analyticsSinks.test.ts");

    assert.match(sinkTests, /mockLogFirebaseScreenView/);
    assert.match(
      sinkTests,
      /mockLogFirebaseAnalyticsEvent\)\.not\.toHaveBeenCalled/,
    );
    assert.match(mobileTests, /mockLogScreenView\.mockRejectedValue/);
  });
});
