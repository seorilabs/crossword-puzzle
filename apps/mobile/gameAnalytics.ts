import {
  createGameAnalyticsClient,
  type GameAnalyticsClient,
  type GameRuntimeAnalyticsPort,
} from '../../packages/crossword-core/src';
import { currentMarket, gameAnalyticsSinks } from './analyticsSinks';

// 게임 세부 지표 클라이언트(Android/iOS RN). 마켓(google-play/app-store)을 주입하고
// core의 이벤트 계약을 재사용한다. presentation(App.tsx)은 gameAnalytics.track만 쓴다.
export const gameAnalytics: GameAnalyticsClient = createGameAnalyticsClient({
  market: currentMarket,
  sinks: gameAnalyticsSinks,
});

/** Native host sink for canonical GameExperience schema-v2 events. */
export const gameRuntimeAnalyticsPort: GameRuntimeAnalyticsPort = Object.freeze(
  {
    log(event) {
      for (const sink of gameAnalyticsSinks) {
        try {
          sink.logGameEvent(event.name, event.params);
        } catch {
          // Analytics never blocks native gameplay.
        }
      }
    },
  },
);
