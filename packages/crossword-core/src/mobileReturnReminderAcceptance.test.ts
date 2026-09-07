import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("#352 RN 복귀 알림 인수조건", () => {
  const mobileApp = read("apps/mobile/App.tsx");
  const mobileIndex = read("apps/mobile/index.js");
  const notificationAdapter = read(
    "apps/mobile/returnReminderNotifications.ts",
  );
  const notificationTests = read(
    "apps/mobile/__tests__/returnReminderNotifications.test.ts",
  );
  const orchestrationTests = read(
    "apps/mobile/__tests__/mobileReturnReminder.test.ts",
  );
  const androidManifest = read(
    "apps/mobile/android/app/src/main/AndroidManifest.xml",
  );
  const iosInfoPlist = read("apps/mobile/ios/CrosswordPuzzleMobile/Info.plist");

  it("AC-1: 완료 뒤 사전 안내 수락 시 권한을 요청하고 익일 09:00 KST 한 건을 예약해 today로 연다", () => {
    assert.match(mobileApp, /viewModel\.isComplete/);
    assert.match(mobileApp, /prepareMobileReturnReminderPreprompt\(\{/);
    assert.match(mobileApp, /confirmMobileReturnReminder\(prompted, \{/);
    assert.match(notificationAdapter, /client\.requestPermission\(\{/);
    assert.match(notificationAdapter, /client\.createTriggerNotification\(/);
    assert.match(notificationAdapter, /route: 'today'/);
    assert.match(mobileApp, /navigateTo\('today'\)/);
    assert.match(notificationTests, /timestamp: Date\.UTC\(2026, 8, 1, 0\)/);
    assert.match(
      notificationTests,
      /createTriggerNotification\)\.toHaveBeenCalledWith/,
    );
  });

  it("AC-2: 비활성 게이트는 권한 요청 예약 계측을 모두 0회로 유지한다", () => {
    assert.match(orchestrationTests, /enabled: false/);
    assert.match(orchestrationTests, /schedule\)\.not\.toHaveBeenCalled\(\)/);
    assert.match(
      orchestrationTests,
      /telemetry\.impression\)\.not\.toHaveBeenCalled\(\)/,
    );
  });

  it("AC-3: RN prompt와 result는 local 채널로 계측한다", () => {
    assert.match(
      orchestrationTests,
      /'return_reminder_prompt',[\s\S]*channel: 'local'/,
    );
    assert.match(
      orchestrationTests,
      /'return_reminder_result',[\s\S]*channel: 'local'/,
    );
  });

  it("AC-4: 알림 탭은 중복 소비 없이 notification_opened 뒤 today로 진입한다", () => {
    assert.match(mobileIndex, /registerReturnReminderBackgroundHandler\(\)/);
    assert.match(mobileApp, /RETURN_REMINDER_OPENED_EVENT/);
    assert.match(mobileApp, /channel: 'local'/);
    assert.match(mobileApp, /notification_kind: 'daily_puzzle'/);
    assert.match(mobileApp, /navigateTo\('today'\)/);
    assert.match(
      notificationTests,
      /background 탭을 pending marker로 저장하고 한 번만 소비한다/,
    );
    assert.match(
      notificationTests,
      /foreground 탭도 오늘의 퍼즐 진입 callback을 한 번 전달한다/,
    );
  });

  it("AC-5: 권한 거부와 SDK 오류는 플레이 흐름에 예외를 전파하지 않는다", () => {
    assert.match(notificationAdapter, /return \{ outcome: 'rejected' \}/);
    assert.match(notificationAdapter, /catch \(error\)/);
    assert.match(notificationAdapter, /outcome: 'error'/);
    assert.match(
      orchestrationTests,
      /권한 거부는 rejected로 종결하고 플레이 흐름에는 예외를 던지지 않는다/,
    );
  });

  it("AC-6: Android 권한 선언과 런타임 요청 경로를 함께 유지한다", () => {
    assert.match(androidManifest, /android\.permission\.POST_NOTIFICATIONS/);
    assert.match(notificationAdapter, /client\.requestPermission\(\{/);
    assert.match(
      notificationTests,
      /requestPermission\)\.toHaveBeenCalledWith\(\{/,
    );
  });

  it("AC-7: iOS도 완료 맥락에서 OS 권한을 요청하고 가짜 purpose-string 키를 만들지 않는다", () => {
    assert.match(mobileApp, /viewModel\.isComplete/);
    assert.match(mobileApp, /confirmMobileReturnReminder\(prompted, \{/);
    assert.match(notificationAdapter, /client\.requestPermission\(\{/);
    assert.doesNotMatch(iosInfoPlist, /NotificationUsageDescription/);
  });

  it("AC-8: 사전 안내 카드 뒤에만 시스템 요청을 하고, 동의 상태는 매 완료마다 재예약하며, 복귀 시 오늘자 예약을 취소한다", () => {
    const orchestration = read("apps/mobile/mobileReturnReminder.ts");
    const webApp = read("src/App.tsx");
    const webDialog = read("src/components/CompletionCelebrationDialog.tsx");
    const core = read("packages/crossword-core/src/returnReminder.ts");

    // core: declined 는 종결이 아니라 익일 재안내, 재예약·취소 판정은 순수 함수.
    assert.match(core, /"declined"/);
    assert.match(core, /export function shouldRefreshLocalReturnReminder/);
    assert.match(core, /export function shouldCancelLocalReturnReminder/);
    assert.match(core, /RETURN_REMINDER_PREPROMPT_EVENT = "return_reminder_preprompt"/);

    // RN: prepare(shown) → confirm(accept → prompt → schedule → result) / decline.
    assert.match(orchestration, /export async function prepareMobileReturnReminderPreprompt/);
    assert.match(orchestration, /export async function confirmMobileReturnReminder/);
    assert.match(orchestration, /export async function declineMobileReturnReminder/);
    assert.match(orchestration, /export async function refreshMobileReturnReminderSchedule/);
    assert.match(orchestration, /export async function cancelStaleMobileReturnReminder/);
    assert.doesNotMatch(orchestration, /maybeRequestMobileReturnReminder/);
    assert.match(mobileApp, /refreshMobileReturnReminderSchedule\(promptDate, \{ telemetry \}\)/);
    assert.match(mobileApp, /cancelStaleMobileReturnReminder\(getTodayDateKey\(\)\)/);
    assert.match(mobileApp, /RETURN_REMINDER_PREPROMPT_COPY\.accept/);
    assert.match(mobileApp, /declineMobileReturnReminder\(prompted, \{/);
    assert.match(
      orchestrationTests,
      /사전 안내는 유도 1회로 기록하고 shown 을 계측하며 시스템 요청은 하지 않는다/,
    );
    assert.match(
      orchestrationTests,
      /동의 상태면 매 완료마다 D\+1 알림을 다시 예약하고 schedule 을 계측한다/,
    );
    assert.match(
      notificationTests,
      /예약 날짜가 오늘 이전·오늘인 복귀 알림만 취소한다/,
    );

    // Web: 같은 사전 안내 카드와 accept/decline 계측, 미응답 닫기는 보류.
    assert.match(webApp, /RETURN_REMINDER_PREPROMPT_EVENT/);
    assert.match(webApp, /buildReturnReminderPrepromptParams\(\s*"shown"/);
    assert.match(webApp, /buildReturnReminderPrepromptParams\(\s*"accept"/);
    assert.match(webApp, /buildReturnReminderPrepromptParams\(\s*"decline"/);
    assert.match(webApp, /applyReturnReminderOutcome\(prompted, "declined"\)/);
    assert.match(webDialog, /<ReturnReminderPrepromptCard/);
    assert.match(webDialog, /function settleReturnReminderPreprompt/);
  });
});
