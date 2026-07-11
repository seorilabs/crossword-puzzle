import {
  createGameAnalyticsClient,
  type GameAnalyticsClient,
} from '../../packages/crossword-core/src';
import {currentMarket, gameAnalyticsSinks} from './analyticsSinks';

// 게임 세부 지표 클라이언트(Android/iOS RN). 마켓(google-play/app-store)을 주입하고
// core의 이벤트 계약을 재사용한다. presentation(App.tsx)은 gameAnalytics.track만 쓴다.
export const gameAnalytics: GameAnalyticsClient = createGameAnalyticsClient({
  market: currentMarket,
  sinks: gameAnalyticsSinks,
});
