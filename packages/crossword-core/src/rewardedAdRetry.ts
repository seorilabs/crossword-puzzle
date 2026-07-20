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
