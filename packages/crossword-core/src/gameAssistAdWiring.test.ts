// game_assist_ad dismiss/error 배선(#321)의 인수조건 중 웹·모바일 emit 배선은 App
// 컴포넌트 렌더 없이 헤드리스로 검증하기 어려우므로, App 소스가 onFailure 분기에서
// game_assist_ad를 core 매핑(mapRewardedAdFailureToAssistResult)으로 발화하는지
// 소스 assertion으로 자동 검증한다(ciStaticChecks 패턴). 분기 자체(dismiss/error)는
// gameAnalytics.test.mts의 mapRewardedAdFailureToAssistResult 단위 테스트가 고정한다.
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

const repoRoot = new URL("../../../", import.meta.url);
const webApp = readFileSync(new URL("src/App.tsx", repoRoot), "utf8");
const mobileApp = readFileSync(
  new URL("apps/mobile/App.tsx", repoRoot),
  "utf8",
);

describe("game_assist_ad dismiss/error 배선 (#321)", () => {
  it("AC-1: src/App.tsx requestRewardedHint의 onFailure에서 실패는 error, 유저 취소는 dismiss로 game_assist_ad를 발화한다", () => {
    // onFailure 분기 안에서 game_assist_ad를 core 매핑 결과(result.status→dismiss/error)로 발화한다.
    assert.match(
      webApp,
      /onFailure:[\s\S]*?gameAnalytics\.track\(\s*"game_assist_ad"[\s\S]*?result:\s*mapRewardedAdFailureToAssistResult\(result\.status\)/,
    );
    // 매핑은 core 계약을 import해 쓴다(번역·재구현 금지).
    assert.match(
      webApp,
      /mapRewardedAdFailureToAssistResult/,
    );
  });

  it("AC-2: apps/mobile/App.tsx의 대응 onFailure 지점에도 동일하게 game_assist_ad를 배선한다", () => {
    assert.match(
      mobileApp,
      /onFailure:[\s\S]*?gameAnalytics\.track\(\s*'game_assist_ad'[\s\S]*?result:\s*mapRewardedAdFailureToAssistResult\(result\.status\)/,
    );
    assert.match(mobileApp, /mapRewardedAdFailureToAssistResult/);
  });
});
