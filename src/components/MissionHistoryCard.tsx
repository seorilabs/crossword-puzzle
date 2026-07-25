import { formatMissionHistoryCardSummary } from "../../packages/crossword-core/src";
import { telemetry } from "../adapters/telemetry";

export type MissionHistoryCardProps = {
  attemptsUsed: number;
  consecutiveStreak: number;
  fastestBestTimeMs: number | null;
  onOpen: () => void;
};

// 홈 "미션 기록" 카드. 현재 스트릭·통산 최고 기록을 미리 보여줘 기록 화면 도달
// 전에 잔존 가치를 노출한다(#300). 표시할 데이터가 없으면 기존 "N번 도전"
// 문구를 유지한다. 진입 클릭은 source=home_card 로 계측한 뒤 이동을 호출부에
// 위임한다.
export function MissionHistoryCard({
  attemptsUsed,
  consecutiveStreak,
  fastestBestTimeMs,
  onOpen,
}: MissionHistoryCardProps) {
  const summary =
    formatMissionHistoryCardSummary({ consecutiveStreak, fastestBestTimeMs }) ??
    `${attemptsUsed}번 도전`;

  function open() {
    telemetry.click("history_open", { source: "home_card" });
    onOpen();
  }

  return (
    <button type="button" onClick={open}>
      <div>
        <strong>미션 기록</strong>
        <span>{summary}</span>
      </div>
      <em>보기</em>
    </button>
  );
}
