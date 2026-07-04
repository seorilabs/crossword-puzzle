import { buildStreakCalendarMonthLabels } from "../../packages/crossword-core/src";
import type { StreakCalendarWeek } from "../../packages/crossword-core/src";

type StreakHeatmapProps = {
  weeks: StreakCalendarWeek[];
};

// 좌측 요일 축 라벨. 격자가 촘촘해 7개를 모두 적으면 붐비므로 GitHub 컨트리뷰션
// 그래프처럼 격행(일/수/금)만 표기한다. index 0=일 … 6=토.
const WEEKDAY_AXIS_LABELS = ["일", "", "", "수", "", "금", ""];

// 최근 N주 완료 여부를 GitHub 컨트리뷰션 그래프처럼 열=주, 행=요일(일→토)로 보여주는
// 히트맵. 격자 배치·완료 판정·월 라벨 파생은 상위(core buildStreakCalendarWeeks·
// buildStreakCalendarMonthLabels)에서 끝낸 순수 데이터만 받아 렌더만 담당하므로
// 헤드리스 컴포넌트 테스트로 고정할 수 있다. 상단에 월 축, 좌측에 요일 축, 하단에
// 색 의미(미완료·완료) 범례를 붙여 가독성을 높인다(#226). 축·범례는 장식이므로
// aria-hidden으로 두어 셀 aria-label과 스크린리더 중복 낭독을 피한다.
export function StreakHeatmap({ weeks }: StreakHeatmapProps) {
  const monthLabels = buildStreakCalendarMonthLabels(weeks);

  return (
    <section className="streakHeatmap" aria-label="최근 완료 달력 히트맵">
      <h3 className="streakHeatmapTitle">완료 달력</h3>
      <div className="streakHeatmapScroll">
        <div className="streakHeatmapMonths" aria-hidden="true">
          <div className="streakHeatmapDaysSpacer" />
          <div className="streakHeatmapMonthRow">
            {monthLabels.map((label, weekIndex) => (
              <div
                className="streakHeatmapMonth"
                key={weeks[weekIndex]?.[0]?.date ?? weekIndex}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="streakHeatmapBody">
          <div className="streakHeatmapDays" aria-hidden="true">
            {WEEKDAY_AXIS_LABELS.map((label, dayIndex) => (
              <div className="streakHeatmapDay" key={dayIndex}>
                {label}
              </div>
            ))}
          </div>
          <div className="streakHeatmapGrid">
            {weeks.map((week, weekIndex) => (
              <div
                className="streakHeatmapWeek"
                key={week[0]?.date ?? weekIndex}
              >
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
        </div>
      </div>
      <div className="streakHeatmapLegend" aria-hidden="true">
        <span className="streakHeatmapLegendSwatch" />
        <span className="streakHeatmapLegendLabel">미완료</span>
        <span className="streakHeatmapLegendSwatch streakHeatmapLegendSwatchDone" />
        <span className="streakHeatmapLegendLabel">완료</span>
      </div>
    </section>
  );
}
