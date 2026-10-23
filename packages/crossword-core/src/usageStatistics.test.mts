import assert from "node:assert/strict";
import { test } from "node:test";
import { createUsageStatisticsPreference } from "./usageStatistics.ts";

function setup(initial: string | null = null) {
  let stored = initial;
  const applied: boolean[] = [];
  const preference = createUsageStatisticsPreference({
    read: async () => stored,
    write: async (value) => {
      stored = value;
    },
    apply: async (enabled) => {
      applied.push(enabled);
    },
  });
  return { preference, applied, stored: () => stored };
}

test("복원 전에는 보내지 않고 선택이 없을 때만 기본 켬을 적용한다", async () => {
  const { preference, applied } = setup();
  assert.equal(preference.canTrack(), false);
  await preference.initialize();
  assert.equal(preference.canTrack(), true);
  assert.deepEqual(applied, [true]);
});

test("끄기는 즉시 전송을 막고 저장 후 새 실행에서도 유지된다", async () => {
  const first = setup();
  await first.preference.initialize();
  const pending = first.preference.setEnabled(false);
  assert.equal(first.preference.canTrack(), false);
  await pending;
  assert.equal(first.stored(), "0");
  const next = setup(first.stored());
  await next.preference.initialize();
  assert.equal(next.preference.getSnapshot().enabled, false);
  assert.equal(next.preference.canTrack(), false);
  await next.preference.setEnabled(true);
  assert.equal(next.preference.canTrack(), true);
});

test("저장 실패를 알리면서 이번 실행의 끄기는 유지한다", async () => {
  const preference = createUsageStatisticsPreference({
    read: async () => null,
    write: async () => {
      throw new Error("storage blocked");
    },
    apply: async () => {},
  });
  await preference.initialize();
  await preference.setEnabled(false);
  assert.equal(preference.canTrack(), false);
  assert.equal(preference.getSnapshot().error, "storage");
  assert.equal(preference.getSnapshot().enabled, false);
});

test("읽기 또는 SDK 적용 실패는 통계를 보내지 않으며 다시 선택할 수 있다", async () => {
  let failing = true;
  const preference = createUsageStatisticsPreference({
    read: async () => {
      throw new Error("unreadable");
    },
    write: async () => {},
    apply: async () => {
      if (failing) throw new Error("SDK failure");
    },
  });
  await preference.initialize();
  assert.equal(preference.canTrack(), false);
  assert.equal(preference.getSnapshot().ready, true);
  failing = false;
  await preference.setEnabled(true);
  assert.equal(preference.getSnapshot().error, null);
  assert.equal(preference.canTrack(), true);
});

test("중복 초기화와 저장 중 재입력은 이전 선택을 덮어쓰지 않는다", async () => {
  let release: (() => void) | undefined;
  const preference = createUsageStatisticsPreference({
    read: async () => null,
    write: async () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    apply: async () => {},
  });
  await Promise.all([preference.initialize(), preference.initialize()]);
  const first = preference.setEnabled(false);
  await preference.setEnabled(true);
  release!();
  await first;
  assert.equal(preference.getSnapshot().enabled, false);
});
