import { telemetry } from "./adapters/telemetry";

// 기록(history) 화면 진입 공통 로직(#300). 진입 소스를 GA4에서 나눠 볼 수 있도록
// history_open 클릭 이벤트에 source 를 싣고 navigate("history")로 화면을 전환한다.
// 홈 카드·완료 축하 다이얼로그가 같은 계측·전환을 공유하도록 화면 밖으로 추출했다.
export type HistoryOpenSource = "home_card" | "completion_dialog";

export function openHistory(
  source: HistoryOpenSource,
  navigate: (route: "history") => void,
): void {
  telemetry.click("history_open", { source });
  navigate("history");
}
