// game_assist_ad dismiss/error 배선(#321) 인수조건 자동 검증.
// - AC-1/AC-2: 웹·모바일 emit 배선은 App 렌더 없이 헤드리스로 검증하기 어려우므로,
//   App 소스가 onFailure 분기에서 game_assist_ad를 core 매핑으로 발화하는지 소스
//   assertion으로 검증한다(ciStaticChecks 패턴).
// - AC-3: 발화 분기(취소→dismiss, 실패→error)를 core 매핑 단위 테스트로 고정한다.
// - AC-4: docs/ad-funnel.md·ad-funnel.sql이 신규 result 값을 반영하는지 검증한다.
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { mapRewardedAdFailureToAssistResult } from "./gameAnalytics.ts";

const repoRoot = new URL("../../../", import.meta.url);
const webApp = readFileSync(new URL("src/App.tsx", repoRoot), "utf8");
const mobileApp = readFileSync(
  new URL("apps/mobile/App.tsx", repoRoot),
  "utf8",
);

// onFailure 콜백 블록(`onFailure:` ~ 다음 콜백 `onLoadingChange:`)만 잘라, emit이
// 실제로 실패/취소 경로(onFailure) 안에 있는지 구조로 확인한다.
function sliceOnFailureBlock(source: string): string {
  const start = source.indexOf("onFailure:");
  if (start < 0) {
    return "";
  }
  const end = source.indexOf("onLoadingChange:", start);
  return end > start ? source.slice(start, end) : "";
}

const webOnFailure = sliceOnFailureBlock(webApp);
const mobileOnFailure = sliceOnFailureBlock(mobileApp);
const adFunnelDoc = readFileSync(
  new URL("docs/ad-funnel.md", repoRoot),
  "utf8",
);
const adFunnelSql = readFileSync(
  new URL("scripts/analytics/ad-funnel.sql", repoRoot),
  "utf8",
);

describe("game_assist_ad dismiss/error 배선 (#321)", () => {
  it("AC-1: src/App.tsx requestRewardedHint의 onFailure에서 실패는 error, 유저 취소는 dismiss로 game_assist_ad를 발화한다", () => {
    // onFailure 블록이 실재하고(가드), 그 안에서 game_assist_ad를 core 매핑 결과로
    // 발화한다(정확 문자열 근거).
    assert.ok(webOnFailure.length > 0, "src/App.tsx에 onFailure 블록이 있어야 한다");
    assert.ok(
      webOnFailure.includes('gameAnalytics.track("game_assist_ad"'),
      "onFailure 안에서 game_assist_ad를 발화해야 한다",
    );
    assert.ok(
      webOnFailure.includes(
        "result: mapRewardedAdFailureToAssistResult(result.status)",
      ),
      "result를 core 매핑(mapRewardedAdFailureToAssistResult) 결과로 실어야 한다",
    );
  });

  it("AC-2: apps/mobile/App.tsx의 대응 onFailure 지점에도 동일하게 game_assist_ad를 배선한다", () => {
    assert.ok(
      mobileOnFailure.length > 0,
      "apps/mobile/App.tsx에 onFailure 블록이 있어야 한다",
    );
    assert.ok(
      mobileOnFailure.includes("gameAnalytics.track('game_assist_ad'"),
      "모바일 onFailure 안에서 game_assist_ad를 발화해야 한다",
    );
    assert.ok(
      mobileOnFailure.includes(
        "result: mapRewardedAdFailureToAssistResult(result.status)",
      ),
      "모바일도 result를 core 매핑 결과로 실어야 한다",
    );
  });

  it("AC-3: 발화 분기(성공은 reward 경로, 취소→dismiss, 실패→error)를 mapRewardedAdFailureToAssistResult 단위 테스트로 고정한다", () => {
    // 취소: 웹 dismissed / 모바일 closed → dismiss.
    assert.equal(mapRewardedAdFailureToAssistResult("dismissed"), "dismiss");
    assert.equal(mapRewardedAdFailureToAssistResult("closed"), "dismiss");
    // 실패: failed / timeout / unsupported → error.
    for (const status of ["failed", "timeout", "unsupported"]) {
      assert.equal(mapRewardedAdFailureToAssistResult(status), "error");
    }
    // 성공(rewarded)은 onFailure로 오지 않고 별도 reward 경로에서 result="reward"로
    // 발화하며, 웹 App은 onFailure에서 rewarded를 좁혀 낸다(소스 근거).
    assert.match(webApp, /result:\s*"reward"/);
    assert.match(webApp, /if\s*\(result\.status\s*===\s*"rewarded"\)\s*\{[\s\S]*?return;/);
  });

  it("AC-4: docs/ad-funnel.md와 scripts/analytics/ad-funnel.sql에 game_assist_ad 신규 result 값(dismiss/error)을 반영한다", () => {
    for (const source of [adFunnelDoc, adFunnelSql]) {
      assert.match(source, /game_assist_ad/);
      assert.match(source, /dismiss/);
      assert.match(source, /error/);
    }
  });
});
