import { Analytics as AppsInTossAnalytics } from "@apps-in-toss/web-framework";
import type {
  CompactTelemetryParams,
  GameAnalyticsSink,
  GameMarket,
} from "../../packages/crossword-core/src";
import { logFirebaseAnalyticsEvent } from "./firebaseClient";

// 분석 이벤트 팬아웃 seam(AIT WebView).
//
// 왜 seam인가: 지금은 AppsInToss Analytics + Firebase Analytics 두 곳으로 보내지만,
// 자체 지표 서버로 전환/병행하는 것을 고려 중이다. sink를 레지스트리로 두면 자체 서버
// 도입이 "sink 하나 추가"로 끝나고, 호출부(telemetry / gameAnalytics)는 바뀌지 않는다.
// 이벤트 계약(무엇을 보낼지)은 core의 gameAnalytics.ts에 있고, 여기서는 "어디로 보낼지"만 정한다.

/** 이 앱 빌드가 도는 마켓. AIT WebView 빌드는 항상 apps-in-toss다. */
export const currentMarket: GameMarket = "apps-in-toss";

/** 팬아웃되는 분석 이벤트 1건. game은 게임 세부 지표(core gameAnalytics)에서 온다. */
export type AnalyticsEvent =
  | { kind: "screen"; name: string; params: CompactTelemetryParams }
  | { kind: "impression"; name: string; params: CompactTelemetryParams }
  | { kind: "click"; name: string; params: CompactTelemetryParams }
  | { kind: "game"; name: string; params: CompactTelemetryParams };

/** 분석 백엔드 1개. 새 백엔드(자체 서버 등)는 이 인터페이스만 구현하면 된다. */
export interface AnalyticsSink {
  readonly id: string;
  track(event: AnalyticsEvent): void;
}

function getOptionalEnvValue(value?: string) {
  const trimmed = value?.trim();
  return trimmed == null || trimmed === "" ? undefined : trimmed;
}

// AppsInToss Analytics sink. screen/impression/click 3채널만 있으므로 game 이벤트는
// impression 채널로 싣는다. 로컬 브라우저/QR 샌드박스에서는 SDK가 없어 조용히 무시한다.
const appsInTossSink: AnalyticsSink = {
  id: "apps-in-toss",
  track(event) {
    const method = event.kind === "game" ? "impression" : event.kind;
    try {
      void AppsInTossAnalytics[method]({
        log_name: event.name,
        ...event.params,
      });
    } catch {
      // AppsInToss analytics is unavailable in local browsers and QR sandbox.
    }
  },
};

// Firebase Analytics sink. screen은 screen_view(firebase_screen)로, 나머지는 이벤트
// 이름 그대로 logEvent한다. 이 스트림이 GA4→BigQuery로 흘러 백오피스 집계의 소스가 된다.
const firebaseSink: AnalyticsSink = {
  id: "firebase",
  track(event) {
    if (event.kind === "screen") {
      void logFirebaseAnalyticsEvent("screen_view", {
        firebase_screen: event.name,
        ...event.params,
      });
      return;
    }
    void logFirebaseAnalyticsEvent(event.name, event.params);
  },
};

/**
 * 자체 지표 서버 sink(드롭인). VITE_METRICS_ENDPOINT가 설정되면 자동으로 레지스트리에
 * 추가된다. 페이지 종료 시 유실을 줄이려 sendBeacon을 우선 쓰고, 없으면 keepalive fetch로
 * 폴백한다. 서버가 준비되기 전까지는 endpoint 미설정으로 비활성(no-op)이다.
 */
export function createHttpMetricsSink(endpoint: string): AnalyticsSink {
  return {
    id: "self-hosted",
    track(event) {
      const body = JSON.stringify({
        kind: event.kind,
        name: event.name,
        params: event.params,
      });
      try {
        if (
          typeof navigator !== "undefined" &&
          typeof navigator.sendBeacon === "function"
        ) {
          navigator.sendBeacon(
            endpoint,
            new Blob([body], { type: "application/json" }),
          );
          return;
        }
        if (typeof fetch === "function") {
          void fetch(endpoint, {
            method: "POST",
            body,
            headers: { "content-type": "application/json" },
            keepalive: true,
          }).catch(() => {
            // 분석은 절대 플레이를 끊지 않는다.
          });
        }
      } catch {
        // 분석은 절대 플레이를 끊지 않는다.
      }
    },
  };
}

function buildSinks(): AnalyticsSink[] {
  const sinks: AnalyticsSink[] = [appsInTossSink, firebaseSink];
  const endpoint = getOptionalEnvValue(import.meta.env.VITE_METRICS_ENDPOINT);
  if (endpoint != null) {
    sinks.push(createHttpMetricsSink(endpoint));
  }
  return sinks;
}

export const analyticsSinks: readonly AnalyticsSink[] = buildSinks();

/** 등록된 모든 sink로 이벤트를 팬아웃한다. 한 sink 실패가 나머지를 막지 않는다. */
export function dispatchAnalytics(event: AnalyticsEvent): void {
  for (const sink of analyticsSinks) {
    try {
      sink.track(event);
    } catch {
      // 개별 sink 격리. 분석은 절대 플레이를 끊지 않는다.
    }
  }
}

/** core gameAnalytics가 쓰는 GameAnalyticsSink 형태로 어댑팅한 sink 목록. */
export const gameAnalyticsSinks: readonly GameAnalyticsSink[] =
  analyticsSinks.map((sink) => ({
    id: sink.id,
    logGameEvent(name, params) {
      sink.track({ kind: "game", name, params });
    },
  }));
