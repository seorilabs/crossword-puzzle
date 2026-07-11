import {
  createGameAnalyticsClient,
  type GameAnalyticsClient,
} from "../../packages/crossword-core/src";
import { currentMarket, gameAnalyticsSinks } from "./analyticsSinks";

// 게임 세부 지표 클라이언트(AIT WebView). 마켓(apps-in-toss)을 주입하고, core의 이벤트
// 계약 + 팬아웃 + throw 차단을 재사용한다. presentation(App.tsx)은 gameAnalytics.track만 쓴다.
export const gameAnalytics: GameAnalyticsClient = createGameAnalyticsClient({
  market: currentMarket,
  sinks: gameAnalyticsSinks,
});
