import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("#340 RN 첫 입력 가이드와 막힘 프롬프트 인수조건", () => {
  const mobileApp = read("apps/mobile/App.tsx");
  const mobileHook = read("apps/mobile/useStuckHintPrompt.ts");
  const mobileHookTests = read(
    "apps/mobile/__tests__/useStuckHintPrompt.test.tsx",
  );
  const guideRepositoryTests = read(
    "apps/mobile/__tests__/firstInputGuideRepository.test.ts",
  );
  const mobileFirebase = read("apps/mobile/firebaseClient.ts");
  const webApp = read("src/App.tsx");

  it("AC-1: RN 첫 입력 가이드는 공용 노출 정책과 영속 재진입 가드를 사용한다", () => {
    assert.match(mobileApp, /shouldShowFirstInputGuide\(\{/);
    assert.match(mobileApp, /firstInputGuideShownRef/);
    assert.match(mobileApp, /loadFirstInputGuideSeen\(\)/);
    assert.match(mobileApp, /markFirstInputGuideSeen\(\)/);
    assert.match(
      guideRepositoryTests,
      /첫 입력 가이드 열람 상태를 저장해 재진입 시 복원한다/,
    );
  });

  it("AC-2: RN 가이드 이벤트와 Web 파라미터 키 계약이 같다", () => {
    for (const eventName of [
      "onboarding_guide_shown",
      "onboarding_guide_complete",
      "onboarding_guide_dismiss",
    ]) {
      assert.ok(mobileApp.includes(eventName));
      assert.ok(webApp.includes(eventName));
    }
    assert.match(mobileApp, /attempt_number: mission\.attemptsUsed/);
    assert.match(
      mobileApp,
      /elapsed_seconds: getElapsedSeconds\(mission\.lastStartedAt\)/,
    );
  });

  it("AC-3: RN 막힘 타이머는 코어 지연 쿨다운 상한 정책만 사용한다", () => {
    for (const policy of [
      "getStuckHintBackoffDelayMs",
      "getStuckHintDelayMs",
      "isNearFinishNudge",
      "shouldScheduleStuckHintPrompt",
    ]) {
      assert.ok(mobileHook.includes(policy));
    }
    assert.match(mobileHookTests, /공용 최소 쿨다운/);
    assert.match(mobileHookTests, /dismiss 상한/);
    assert.match(mobileHookTests, /입력 활동이 생기면 기존 타이머를 취소/);
  });

  it("AC-4: RN 막힘 노출 수락 닫기 이벤트와 Web 파라미터 키 계약이 같다", () => {
    for (const eventName of [
      "STUCK_HINT_PROMPT_EVENT",
      "STUCK_HINT_PROMPT_ACCEPT_EVENT",
      "STUCK_HINT_PROMPT_DISMISS_EVENT",
    ]) {
      assert.ok(mobileApp.includes(eventName));
      assert.ok(webApp.includes(eventName));
    }
    for (const param of [
      "attempt_number",
      "progress_percent",
      "remaining_hint_credits",
      "trigger",
      "near_finish",
      "words_remaining",
    ]) {
      assert.ok(mobileApp.includes(param));
      assert.ok(webApp.includes(param));
    }
  });

  it("AC-5: 두 장치의 공용 킬스위치를 RN Firebase가 읽는다", () => {
    assert.match(mobileApp, /launchConfig\.firstInputGuideEnabled/);
    assert.match(mobileApp, /launchConfig\.stuckHintPromptEnabled/);
    assert.match(mobileFirebase, /launchConfigKeys\.firstInputGuideEnabled/);
    assert.match(mobileFirebase, /launchConfigKeys\.stuckHintPromptEnabled/);
  });
});
