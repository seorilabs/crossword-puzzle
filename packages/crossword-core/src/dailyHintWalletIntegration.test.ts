import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readSource(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("일일 공용 힌트 3마켓 통합 계약", () => {
  it("AC-6: Web·AIT·Android·iOS가 같은 코어 정책과 Remote Config 키를 사용한다", () => {
    const webApp = readSource("../../../src/App.tsx");
    const mobileApp = readSource("../../../apps/mobile/App.tsx");
    const webFirebase = readSource("../../../src/adapters/firebaseClient.ts");
    const mobileFirebase = readSource("../../../apps/mobile/firebaseClient.ts");

    for (const appSource of [webApp, mobileApp]) {
      assert.match(appSource, /getDailyHintBalance\(/);
      assert.match(appSource, /consumeDailyHintCredit\(/);
      assert.match(appSource, /grantDailyHintCredits\(/);
      assert.match(appSource, /launchConfig\.dailyFreeHintCredits/);
    }
    assert.match(webFirebase, /launchConfigKeys\.dailyFreeHintCredits/);
    assert.match(mobileFirebase, /launchConfigKeys\.dailyFreeHintCredits/);
  });
});
