export type RewardedAdRetryAttempt = 0 | 1;

export type RewardedAdRetryStatus =
  | "dismissed"
  | "failed"
  | "rewarded"
  | "timeout"
  | "unsupported";

export type RewardedAdRetryExecution<T> = {
  result: T;
  retry: RewardedAdRetryAttempt;
};

export const REWARDED_HINT_AD_REQUEST_EVENT = "rewarded_hint_ad_request";
export const REWARDED_HINT_AD_RESULT_EVENT = "rewarded_hint_ad_result";
export const REWARDED_HINT_AD_REWARD_EVENT = "rewarded_hint_ad_reward";

export type RewardedHintAdFlowOptions<T> = {
  attempt: (retry: RewardedAdRetryAttempt) => Promise<T>;
  getStatus: (result: T) => RewardedAdRetryStatus;
  onAttemptResult: (result: T, retry: RewardedAdRetryAttempt) => void;
  onAttemptStart: (retry: RewardedAdRetryAttempt) => void;
  onFailure: (result: T, retry: RewardedAdRetryAttempt) => void;
  onLoadingChange: (isLoading: boolean) => void;
  onRetry: (result: T) => void;
  onReward: (result: T, retry: RewardedAdRetryAttempt) => void;
};

export function shouldRetryRewardedAdStatus(
  status: RewardedAdRetryStatus,
): boolean {
  return status === "failed" || status === "timeout";
}

export async function runRewardedAdWithSingleRetry<T>(
  attempt: (retry: RewardedAdRetryAttempt) => Promise<T>,
  getStatus: (result: T) => RewardedAdRetryStatus,
  onRetry?: (result: T) => void,
): Promise<RewardedAdRetryExecution<T>> {
  const initialResult = await attempt(0);

  if (!shouldRetryRewardedAdStatus(getStatus(initialResult))) {
    return { result: initialResult, retry: 0 };
  }

  onRetry?.(initialResult);
  return {
    result: await attempt(1),
    retry: 1,
  };
}

export async function runRewardedHintAdFlow<T>({
  attempt,
  getStatus,
  onAttemptResult,
  onAttemptStart,
  onFailure,
  onLoadingChange,
  onRetry,
  onReward,
}: RewardedHintAdFlowOptions<T>): Promise<RewardedAdRetryExecution<T>> {
  onLoadingChange(true);

  try {
    const execution = await runRewardedAdWithSingleRetry(
      async (retry) => {
        onAttemptStart(retry);
        const result = await attempt(retry);
        onAttemptResult(result, retry);
        return result;
      },
      getStatus,
      onRetry,
    );

    if (getStatus(execution.result) === "rewarded") {
      onReward(execution.result, execution.retry);
    } else {
      onFailure(execution.result, execution.retry);
    }

    return execution;
  } finally {
    onLoadingChange(false);
  }
}
