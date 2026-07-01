// 스트릭 캘린더 히트맵 격자 배치 순수 helper 단위 테스트
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { buildStreakCalendarWeeks } from "./streakCalendar.ts";

describe("buildStreakCalendarWeeks", () => {
  // 2026-07-01은 수요일(UTC dow=3).
  const today = "2026-07-01";

  it("weeks개 열 × 7행(일→토)로 배치하고 마지막 열이 오늘 주다", () => {
    const weeks = buildStreakCalendarWeeks([], today, 4);
    assert.equal(weeks.length, 4);
    for (const week of weeks) {
      assert.equal(week.length, 7);
    }
    // 마지막 열의 수요일(index 3)이 오늘.
    const lastWeek = weeks[weeks.length - 1];
    assert.equal(lastWeek[3].date, today);
    assert.equal(lastWeek[3].isToday, true);
    // 일요일(index 0)은 오늘이 속한 주의 시작(2026-06-28).
    assert.equal(lastWeek[0].date, "2026-06-28");
  });

  it("완료일은 completed=true, 그 외는 false로 매핑한다", () => {
    const weeks = buildStreakCalendarWeeks(["2026-06-30", "2026-06-28"], today, 4);
    const lastWeek = weeks[weeks.length - 1];
    // 6-28(일)=완료, 6-29(월)=미완료, 6-30(화)=완료, 7-01(수)=오늘·미완료
    assert.equal(lastWeek[0].completed, true);
    assert.equal(lastWeek[1].completed, false);
    assert.equal(lastWeek[2].completed, true);
    assert.equal(lastWeek[3].completed, false);
  });

  it("오늘 이후(이번 주 남은 요일)는 isFuture=true이고 완료로 치지 않는다", () => {
    // 미래 날짜를 완료 집합에 넣어도 completed로 표시되면 안 된다.
    const weeks = buildStreakCalendarWeeks(["2026-07-02"], today, 4);
    const lastWeek = weeks[weeks.length - 1];
    // 목(index 4)=7-02: 미래
    assert.equal(lastWeek[4].date, "2026-07-02");
    assert.equal(lastWeek[4].isFuture, true);
    assert.equal(lastWeek[4].completed, false);
    // 오늘까지는 미래가 아니다.
    assert.equal(lastWeek[3].isFuture, false);
  });

  it("정확히 하나의 오늘 칸만 존재한다", () => {
    const weeks = buildStreakCalendarWeeks([], today, 12);
    const todayCells = weeks.flat().filter((cell) => cell.isToday);
    assert.equal(todayCells.length, 1);
    assert.equal(todayCells[0].date, today);
  });
});
