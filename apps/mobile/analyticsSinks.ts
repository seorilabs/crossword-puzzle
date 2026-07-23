import {Platform} from 'react-native';
import {
  createReleaseVersionedSink,
  resolveReleaseVersion,
  type CompactTelemetryParams,
  type GameAnalyticsSink,
  type GameMarket,
} from '../../packages/crossword-core/src';
import {version as packageVersion} from './package.json';
import {logFirebaseAnalyticsEvent} from './firebaseClient';

// 분석 이벤트 팬아웃 seam(Android/iOS RN). 웹(src/adapters/analyticsSinks.ts)과 같은 구조를
// RN용으로 둔다: sink 레지스트리로 두어 자체 지표 서버 도입이 "sink 하나 추가"로 끝나게 한다.
// 모바일에는 AppsInToss Analytics가 없으므로 Firebase가 기본 sink다.

/**
 * 이 앱 빌드가 도는 마켓. Android=Google Play, iOS=App Store. 마켓개별/마켓통합 지표를
 * 뽑기 위해 모든 게임 이벤트에 실린다.
 */
export const currentMarket: GameMarket =
  Platform.OS === 'ios' ? 'app-store' : 'google-play';

// 이 빌드의 릴리즈 버전(release_version 계측 값). RN JS 레이어에는 태그 유래 빌드 env
// 브리지가 없으므로 패키지 유래 상수(apps/mobile/package.json version)를 쓴다. 값 형식은
// core가 정규화한다. 태그 유래 주입(네이티브 버전 브리지)은 후속 과제다(#293).
export const RELEASE_VERSION = resolveReleaseVersion(packageVersion);

export type AnalyticsEvent =
  | {kind: 'screen'; name: string; params: CompactTelemetryParams}
  | {kind: 'impression'; name: string; params: CompactTelemetryParams}
  | {kind: 'click'; name: string; params: CompactTelemetryParams}
  | {kind: 'game'; name: string; params: CompactTelemetryParams};

export interface AnalyticsSink {
  readonly id: string;
  track(event: AnalyticsEvent): void;
}

const firebaseSink: AnalyticsSink = {
  id: 'firebase',
  track(event) {
    if (event.kind === 'screen') {
      void logFirebaseAnalyticsEvent('screen_view', {
        firebase_screen: event.name,
        ...event.params,
      });
      return;
    }
    void logFirebaseAnalyticsEvent(event.name, event.params);
  },
};

// 자체 지표 서버 sink(드롭인). 서버가 준비되면 endpoint를 채운다. 지금은 미설정으로 no-op.
// RN에는 import.meta.env가 없으므로 endpoint는 Remote Config나 react-native-config로
// 주입하는 것을 권장한다(서버 도입 시 이 상수만 그 소스로 바꾸면 된다).
const SELF_HOSTED_METRICS_ENDPOINT: string | undefined = undefined;

export function createHttpMetricsSink(endpoint: string): AnalyticsSink {
  return {
    id: 'self-hosted',
    track(event) {
      const body = JSON.stringify({
        kind: event.kind,
        name: event.name,
        params: event.params,
      });
      try {
        void fetch(endpoint, {
          method: 'POST',
          body,
          headers: {'content-type': 'application/json'},
        }).catch(() => {
          // 분석은 절대 플레이를 끊지 않는다.
        });
      } catch {
        // 분석은 절대 플레이를 끊지 않는다.
      }
    },
  };
}

function buildSinks(): AnalyticsSink[] {
  const sinks: AnalyticsSink[] = [firebaseSink];
  if (SELF_HOSTED_METRICS_ENDPOINT != null) {
    sinks.push(createHttpMetricsSink(SELF_HOSTED_METRICS_ENDPOINT));
  }
  return sinks;
}

// 모든 sink를 release_version 첨부 데코레이터로 감싼다. dispatchAnalytics와
// gameAnalyticsSinks가 모두 이 배열에서 파생되므로, 여기 한 곳에서 감싸면 전 이벤트에
// 개별 호출 수정 없이 release_version이 실린다(웹 adapter와 동일 구조, #293).
export const analyticsSinks: readonly AnalyticsSink[] = buildSinks().map(sink =>
  createReleaseVersionedSink(sink, RELEASE_VERSION),
);

export function dispatchAnalytics(event: AnalyticsEvent): void {
  for (const sink of analyticsSinks) {
    try {
      sink.track(event);
    } catch {
      // 개별 sink 격리. 분석은 절대 플레이를 끊지 않는다.
    }
  }
}

export const gameAnalyticsSinks: readonly GameAnalyticsSink[] =
  analyticsSinks.map(sink => ({
    id: sink.id,
    logGameEvent(name, params) {
      sink.track({kind: 'game', name, params});
    },
  }));
