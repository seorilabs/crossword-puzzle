import type { StreakCalendarWeek } from "../../packages/crossword-core/src";

type StreakHeatmapProps = {
  weeks: StreakCalendarWeek[];
};

// 최근 N주 완료 여부를 GitHub 컨트리뷰션 그래프처럼 열=주, 행=요일(일→토)로 보여주는
// 히트맵. 격자 배치·완료 판정은 상위(core buildStreakCalendarWeeks)에서 끝낸 순수
// 데이터만 받아 렌더만 담당하므로 헤드리스 컴포넌트 테스트로 고정할 수 있다.
export function StreakHeatmap({ weeks }: StreakHeatmapProps) {
  return (
    <section className="streakHeatmap" aria-label="최근 완료 달력 히트맵">
      <h3 className="streakHeatmapTitle">완료 달력</h3>
      <div className="streakHeatmapGrid">
        {weeks.map((week, weekIndex) => (
          <div className="streakHeatmapWeek" key={week[0]?.date ?? weekIndex}>
            {week.map((cell) => {
              // 오늘 이후(이번 주 남은 요일) 칸은 완료 여부가 없는 격자 정렬용
              // 자리표시자이므로 스크린리더에서 숨긴다(모순 라벨 방지).
              if (cell.isFuture) {
                return (
                  <div
                    key={cell.date}
                    className="streakHeatmapCell streakHeatmapCellFuture"
                    aria-hidden="true"
                  />
                );
              }
              // isFuture와 상호배타이므로 오늘 칸은 항상 완료/미완료 상태를 가진다.
              const status = cell.completed ? "완료" : "미완료";
              return (
                <div
                  key={cell.date}
                  className={[
                    "streakHeatmapCell",
                    cell.completed ? "streakHeatmapCellDone" : "",
                    cell.isToday ? "streakHeatmapCellToday" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-label={`${cell.date} ${status}${
                    cell.isToday ? " · 오늘" : ""
                  }`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
