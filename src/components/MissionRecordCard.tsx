import type { MissionRecordSummary } from "../../packages/crossword-core/src";

// 홈 "미션 기록" 진입 카드(#300). 스트릭·최고 기록 요약이 있으면 값을 미리
// 노출하고, 없으면 기존 "N번 도전" 문구로 폴백한다. 클릭 시 onOpen을 호출한다
// (호출부가 history_open 계측 + navigate("history")를 담당).
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
      <button type="button" onClick={onOpen}>
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
