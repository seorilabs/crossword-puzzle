import type { MissionRecordSummary } from "../../packages/crossword-core/src";
import { telemetry } from "../adapters/telemetry";

// 홈 "미션 기록" 진입 카드(#300). 스트릭·최고 기록 요약이 있으면 값을 미리
// 노출하고, 없으면 기존 "N번 도전" 문구로 폴백한다. 클릭 시 홈 카드 진입원으로
// history_open을 계측(source=home_card)한 뒤 onOpen(navigate("history"))을 호출한다.
export type MissionRecordCardProps = {
  summary: MissionRecordSummary | null;
  attemptsUsed: number;
  onOpen: () => void;
};

export function MissionRecordCard({
  summary,
  attemptsUsed,
  onOpen,
}: MissionRecordCardProps) {
  return (
    <section className="homeList" aria-label="진행 정보">
      <button
        type="button"
        onClick={() => {
          telemetry.click("history_open", { source: "home_card" });
          onOpen();
        }}
      >
        <div>
          <strong>미션 기록</strong>
          {summary == null ? (
            <span>{attemptsUsed}번 도전</span>
          ) : (
            <span>
              {summary.streakDays != null && `🔥 ${summary.streakDays}일 연속`}
              {summary.streakDays != null &&
                summary.bestTimeLabel != null &&
                " · "}
              {summary.bestTimeLabel != null &&
                `⏱ 최고 ${summary.bestTimeLabel}`}
            </span>
          )}
        </div>
        <em>보기</em>
      </button>
    </section>
  );
}
