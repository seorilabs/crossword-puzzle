import type { StreakCalendarWeek } from "../../packages/crossword-core/src";

type StreakHeatmapProps = {
  weeks: StreakCalendarWeek[];
};

function cellLabel(
  date: string,
  completed: boolean,
  isToday: boolean,
  isFuture: boolean,
): string {
  const status = isFuture ? "예정" : completed ? "완료" : "미완료";
  return `${date} ${status}${isToday ? " · 오늘" : ""}`;
}

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
            {week.map((cell) => (
              <div
                key={cell.date}
                className={[
                  "streakHeatmapCell",
                  cell.completed ? "streakHeatmapCellDone" : "",
                  cell.isToday ? "streakHeatmapCellToday" : "",
                  cell.isFuture ? "streakHeatmapCellFuture" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={cellLabel(
                  cell.date,
                  cell.completed,
                  cell.isToday,
                  cell.isFuture,
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
