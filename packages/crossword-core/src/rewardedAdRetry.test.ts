import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  buildRewardedHintAdAttemptTelemetry,
  REWARDED_HINT_AD_REQUEST_EVENT,
  REWARDED_HINT_AD_RESULT_EVENT,
  REWARDED_HINT_AD_REWARD_EVENT,
  runRewardedAdWithSingleRetry,
  runRewardedHintAdFlow,
  type RewardedAdRetryAttempt,
  type RewardedAdRetryStatus,
} from "./rewardedAdRetry.ts";

type Result = { status: RewardedAdRetryStatus };

function createAttempt(statuses: RewardedAdRetryStatus[]) {
  const retries: number[] = [];

  return {
    attempt: async (retry: 0 | 1): Promise<Result> => {
      retries.push(retry);
      return { status: statuses[retry] ?? statuses.at(-1) ?? "failed" };
    },
    retries,
  };
}

describe("runRewardedAdWithSingleRetry (#277)", () => {
  it("timeout 후 정확히 한 번 재시도해 rewarded 결과를 반환한다", async () => {
    const runner = createAttempt(["timeout", "rewarded"]);
    const retryNotices: string[] = [];

    const execution = await runRewardedAdWithSingleRetry(
      runner.attempt,
      (result) => result.status,
      (result) => retryNotices.push(result.status),
    );

    assert.deepEqual(runner.retries, [0, 1]);
    assert.deepEqual(retryNotices, ["timeout"]);
    assert.deepEqual(execution, {
      result: { status: "rewarded" },
      retry: 1,
    });
  });

  it("timeout 재시도도 timeout이면 더 재시도하지 않는다", async () => {
    const runner = createAttempt(["timeout", "timeout"]);

    const execution = await runRewardedAdWithSingleRetry(
      runner.attempt,
      (result) => result.status,
    );

    assert.deepEqual(runner.retries, [0, 1]);
    assert.deepEqual(execution, {
      result: { status: "timeout" },
      retry: 1,
    });
  });

  it("dismissed는 사용자 종료이므로 재시도하지 않는다", async () => {
    const runner = createAttempt(["dismissed", "rewarded"]);

    const execution = await runRewardedAdWithSingleRetry(
      runner.attempt,
      (result) => result.status,
    );

    assert.deepEqual(runner.retries, [0]);
    assert.deepEqual(execution, {
      result: { status: "dismissed" },
      retry: 0,
    });
  });

  it("unsupported는 재시도하지 않는다", async () => {
    const runner = createAttempt(["unsupported", "rewarded"]);

    await runRewardedAdWithSingleRetry(
      runner.attempt,
      (result) => result.status,
    );

    assert.deepEqual(runner.retries, [0]);
  });
});

type FlowEvent = {
  name: string;
  retry?: RewardedAdRetryAttempt;
  status?: RewardedAdRetryStatus;
};

async function runFlow(statuses: RewardedAdRetryStatus[]) {
  const events: FlowEvent[] = [];
  const attempt = createAttempt(statuses);

  const execution = await runRewardedHintAdFlow({
    attempt: attempt.attempt,
    getStatus: (result) => result.status,
    onAttemptResult: (result, retry) =>
      events.push({
        name: REWARDED_HINT_AD_RESULT_EVENT,
        retry,
        status: result.status,
      }),
    onAttemptStart: (retry) =>
      events.push({ name: REWARDED_HINT_AD_REQUEST_EVENT, retry }),
    onFailure: (result, retry) =>
      events.push({ name: "failure_notice", retry, status: result.status }),
    onLoadingChange: (isLoading) =>
      events.push({ name: isLoading ? "loading" : "idle" }),
    onRetry: (result) =>
      events.push({ name: "retry_notice", status: result.status }),
    onReward: (result, retry) =>
      events.push({
        name: REWARDED_HINT_AD_REWARD_EVENT,
        retry,
        status: result.status,
      }),
  });

  return { events, execution };
}

describe("runRewardedHintAdFlow lifecycle (#277)", () => {
  it("AC-3: request·result 이벤트에 최초 0과 재시도 1을 같은 계약으로 기록한다", () => {
    assert.deepEqual(buildRewardedHintAdAttemptTelemetry(0), {
      request: {
        name: "rewarded_hint_ad_request",
        params: { retry: 0 },
      },
      result: {
        name: "rewarded_hint_ad_result",
        params: { retry: 0 },
      },
    });
    assert.deepEqual(buildRewardedHintAdAttemptTelemetry(1), {
      request: {
        name: "rewarded_hint_ad_request",
        params: { retry: 1 },
      },
      result: {
        name: "rewarded_hint_ad_result",
        params: { retry: 1 },
      },
    });
  });

  it("timeout 후 재시도 성공까지 loading·retry telemetry·보상 순서를 유지한다", async () => {
    const { events } = await runFlow(["timeout", "rewarded"]);

    assert.deepEqual(events, [
      { name: "loading" },
      { name: "rewarded_hint_ad_request", retry: 0 },
      { name: "rewarded_hint_ad_result", retry: 0, status: "timeout" },
      { name: "retry_notice", status: "timeout" },
      { name: "rewarded_hint_ad_request", retry: 1 },
      { name: "rewarded_hint_ad_result", retry: 1, status: "rewarded" },
      { name: "rewarded_hint_ad_reward", retry: 1, status: "rewarded" },
      { name: "idle" },
    ]);
  });

  it("재시도도 timeout이면 기존 실패 안내 뒤 idle로 복귀한다", async () => {
    const { events } = await runFlow(["timeout", "timeout"]);

    assert.deepEqual(events.at(-2), {
      name: "failure_notice",
      retry: 1,
      status: "timeout",
    });
    assert.deepEqual(events.at(-1), { name: "idle" });
    assert.equal(
      events.filter((event) => event.name === "rewarded_hint_ad_request")
        .length,
      2,
    );
  });

  it("dismissed는 재시도 안내 없이 실패 안내 뒤 idle로 복귀한다", async () => {
    const { events } = await runFlow(["dismissed", "rewarded"]);

    assert.deepEqual(events, [
      { name: "loading" },
      { name: "rewarded_hint_ad_request", retry: 0 },
      { name: "rewarded_hint_ad_result", retry: 0, status: "dismissed" },
      { name: "failure_notice", retry: 0, status: "dismissed" },
      { name: "idle" },
    ]);
  });
});
