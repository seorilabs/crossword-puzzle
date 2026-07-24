import type { MissionRecordSummary } from "../../packages/crossword-core/src";

// 홈 "미션 기록" 카드(#300). 기록(history) 화면 진입 동선이 하나뿐이라 도달률이
// 매우 낮아, 카드에 잔존 동기(현재 스트릭·최고 기록)를 미리 보여줘 진입을 유도한다.
// 요약 데이터가 없으면 기존 "N번 도전" 문구로 폴백한다. 진입 계측·전환은 onOpen
// (호출부의 openHistory 배선)이 담당하고, 이 컴포넌트는 표시만 책임진다.
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
  const summaryParts =
    summary == null
      ? []
      : [summary.streakLabel, summary.bestTimeLabel].filter(
          (part): part is string => part != null,
        );
  const subtitle =
    summaryParts.length > 0
      ? summaryParts.join(" · ")
      : `${attemptsUsed}번 도전`;

  return (
    <button type="button" onClick={onOpen}>
      <div>
        <strong>미션 기록</strong>
        <span>{subtitle}</span>
      </div>
      <em>보기</em>
    </button>
  );
}
