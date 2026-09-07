import type { WeeklyStreakStripDay } from "../../packages/crossword-core/src";

export type WeeklyStreakStripProps = {
  days: WeeklyStreakStripDay[];
  headline: string;
  nudge: string | null;
};

// 홈 상단 7일 스트릭 스트립. 오늘로 끝나는 최근 7일의 완료 여부를 한 줄로 보여
// "오늘 풀면 이어진다"는 복귀 동기를 사다리 CTA 바로 위에 둔다. 날짜·요일·완료
// 판정은 core(buildWeeklyStreakStrip)가 만들고 여기서는 렌더만 한다.
export function WeeklyStreakStrip({
  days,
  headline,
  nudge,
}: WeeklyStreakStripProps) {
  if (days.length === 0) {
    return null;
  }

  return (
    <section className="weeklyStreakStrip" aria-label="최근 7일 연속 기록">
      <p className="weeklyStreakHeadline">{headline}</p>
      <ol className="weeklyStreakDays">
        {days.map((day) => (
          <li
            key={day.date}
            className={[
              "weeklyStreakDay",
              day.completed ? "weeklyStreakDayDone" : "",
              day.isToday ? "weeklyStreakDayToday" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={day.isToday ? "date" : undefined}
            aria-label={`${day.date} ${day.completed ? "완료" : "미완료"}${
              day.isToday ? " · 오늘" : ""
            }`}
          >
            <span className="weeklyStreakDayLabel" aria-hidden="true">
              {day.weekdayLabel}
            </span>
            <span className="weeklyStreakDayDot" aria-hidden="true">
              {day.completed ? "✓" : ""}
            </span>
          </li>
        ))}
      </ol>
      {nudge != null && <p className="streakNudge">{nudge}</p>}
    </section>
  );
}
