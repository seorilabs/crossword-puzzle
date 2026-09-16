// 릴리즈 버전(release_version) 계측 계약(3마켓 공통). GA4/BigQuery에서 릴리즈 경계·버전
// 회귀를 진단하려면 모든 이벤트에 앱 버전 차원이 실려야 한다. 값의 "형식 정규화"와 "모든
// 이벤트 공통 첨부"를 core 순수 함수로 고정해, 각 마켓 adapter(sink)가 같은 규칙으로
// release_version을 싣도록 한다. core에는 Firebase/AIT/RN SDK import를 넣지 않는다(#293).

import type { CompactTelemetryParams } from "./platformContracts.ts";

export type { CompactTelemetryParams } from "./platformContracts.ts";

/**
 * 모든 이벤트에 실리는 릴리즈 버전 파라미터 키. happy-farm 등 다른 Seorilabs AIT 게임의
 * 버전 표준 파라미터와 동일한 이름을 써, 백오피스가 게임 간 같은 축으로 집계할 수 있다.
 */
export const APP_MARKET_PARAM_KEY = "app_market";
export const RUNTIME_PLATFORM_PARAM_KEY = "runtime_platform";
export const RELEASE_VERSION_PARAM_KEY = "release_version";

export type AnalyticsAppMarket = "google_play" | "app_store" | "apps_in_toss";
export type AnalyticsRuntimePlatform = "android" | "ios" | "web";

export type AnalyticsDimensions = {
  appMarket: AnalyticsAppMarket;
  runtimePlatform: AnalyticsRuntimePlatform;
  releaseVersion: string;
};

/**
 * 유효한 버전을 찾지 못했을 때의 안전 기본값. GA4에서 NULL 대신 "미상" 값을 채워
 * "값이 비었는지"와 "버전 축이 아예 없는지"를 구분할 수 있게 한다.
 */
export const UNKNOWN_RELEASE_VERSION = "0.0.0";

// 원시 버전 문자열을 release_version 형식(접두사 v 없는 semver)으로 정규화한다.
// docs/release-versioning.md 의 versionName 규칙("v 를 뺀 semver", 예: 0.1.1)과 일치하며,
// prerelease/build 메타데이터(-rc.1, +build)가 붙어도 허용한다. 형식이 안 맞으면 null.
function normalizeReleaseVersion(
  value: string | undefined | null,
): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim().replace(/^v/i, "");
  return /^\d+\.\d+\.\d+([-+.].*)?$/.test(trimmed) ? trimmed : null;
}

/**
 * 빌드/패키지에서 넘어온 후보 버전들 중 첫 유효값을 release_version 형식으로 정규화해
 * 반환한다. 태그 유래 값(배포 시 주입)을 앞에, 패키지 유래 상수(빌드 fallback)를 뒤에
 * 두면 "패키지/태그 유래 상수"가 그대로 실린다. 유효 후보가 없으면 UNKNOWN_RELEASE_VERSION.
 * 접두사 v 는 제거한다(예: v0.1.1 -> 0.1.1).
 */
export function resolveReleaseVersion(
  ...candidates: Array<string | undefined | null>
): string {
  for (const candidate of candidates) {
    const normalized = normalizeReleaseVersion(candidate);
    if (normalized != null) {
      return normalized;
    }
  }
  return UNKNOWN_RELEASE_VERSION;
}

/**
 * 최소 sink 계약. 각 마켓 adapter의 AnalyticsSink(params를 가진 이벤트를 track)를 포괄하는
 * 제네릭 형태라, SDK import 없이 core에서 다룰 수 있다.
 */
export interface AnalyticsDimensionedSink<
  E extends { params: CompactTelemetryParams },
> {
  readonly id: string;
  track(event: E): void;
}

/**
 * sink를 감싸 모든 커스텀 이벤트에 표준 분석 차원을 자동 병합한다. 표준값을 마지막에
 * 덮어써 호출자가 market/release 값을 위조하거나 레거시 값을 되살릴 수 없게 한다.
 */
export function createAnalyticsDimensionedSink<
  E extends { params: CompactTelemetryParams },
>(
  sink: AnalyticsDimensionedSink<E>,
  dimensions: AnalyticsDimensions,
): AnalyticsDimensionedSink<E> {
  return {
    id: sink.id,
    track(event) {
      const withDimensions = {
        ...event,
        params: {
          ...event.params,
          [APP_MARKET_PARAM_KEY]: dimensions.appMarket,
          [RUNTIME_PLATFORM_PARAM_KEY]: dimensions.runtimePlatform,
          [RELEASE_VERSION_PARAM_KEY]: dimensions.releaseVersion,
        },
      } as E;
      sink.track(withDimensions);
    },
  };
}
