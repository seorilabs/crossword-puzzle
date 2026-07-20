import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  runRewardedAdWithSingleRetry,
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
