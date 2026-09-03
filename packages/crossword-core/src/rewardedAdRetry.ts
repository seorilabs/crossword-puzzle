export type RewardedAdRetryAttempt = 0 | 1;

export type RewardedAdRetryStatus =
  | "dismissed"
  | "error"
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

export function buildRewardedHintAdAttemptTelemetry(
  retry: RewardedAdRetryAttempt,
): {
  request: {
    name: typeof REWARDED_HINT_AD_REQUEST_EVENT;
    params: { retry: RewardedAdRetryAttempt };
  };
  result: {
    name: typeof REWARDED_HINT_AD_RESULT_EVENT;
    params: { retry: RewardedAdRetryAttempt };
  };
} {
  return {
    request: {
      name: REWARDED_HINT_AD_REQUEST_EVENT,
      params: { retry },
    },
    result: {
      name: REWARDED_HINT_AD_RESULT_EVENT,
      params: { retry },
    },
  };
}

export function trackRewardedHintAdRequest(
  telemetry: Pick<TelemetryClient, "click">,
  params: TelemetryParams,
  retry: RewardedAdRetryAttempt,
): void {
  const event = buildRewardedHintAdAttemptTelemetry(retry).request;
  telemetry.click(event.name, { ...params, ...event.params });
}

export function trackRewardedHintAdResult(
  telemetry: Pick<TelemetryClient, "impression">,
  params: TelemetryParams,
  retry: RewardedAdRetryAttempt,
): void {
  const event = buildRewardedHintAdAttemptTelemetry(retry).result;
  telemetry.impression(event.name, { ...params, ...event.params });
}

export type RewardedHintAdFlowOptions<T> = {
  attempt: (retry: RewardedAdRetryAttempt) => Promise<T>;
  getStatus: (result: T) => RewardedAdRetryStatus;
  // attempt()가 예외를 던지면(#381) 이 값으로 정규화해 기존 성공/실패 파이프라인
  // (onAttemptResult → getStatus → onFailure)을 그대로 태운다. 반환값의
  // getStatus 결과는 "error"처럼 기존 failed/closed 등과 구분 가능해야 한다.
  mapError: (error: unknown, retry: RewardedAdRetryAttempt) => T;
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
  mapError,
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
        // attempt()가 예외를 던져도 밖으로 전파하지 않는다(#381). 그러지 않으면
        // onAttemptResult·onFailure가 전혀 호출되지 않고 결과 이벤트도, 실패
        // 안내도 남지 않은 채 요청이 그대로 사라진다.
        let result: T;
        try {
          result = await attempt(retry);
        } catch (error) {
          result = mapError(error, retry);
        }
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
import type { TelemetryClient, TelemetryParams } from "./platformContracts.ts";
