// 스트릭 캘린더 히트맵 격자 배치 순수 helper 단위 테스트
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  buildStreakCalendarMonthLabels,
  buildStreakCalendarWeeks,
  buildWeeklyStreakStrip,
  collectCompletedDates,
  computeConsecutiveStreakDays,
  computeLongestStreakDays,
  formatStreakStripHeadline,
} from "./streakCalendar.ts";

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

describe("buildStreakCalendarMonthLabels", () => {
  it("weeks와 같은 길이의 라벨 배열을 반환한다", () => {
    const weeks = buildStreakCalendarWeeks([], "2026-07-01", 4);
    const labels = buildStreakCalendarMonthLabels(weeks);
    assert.equal(labels.length, 4);
  });

  it("월이 바뀌는 열에만 '월' 라벨을 채우고 나머지는 빈 문자열이다", () => {
    // 2026-07-01(수) 기준 8주: 각 주 시작(일)이 05-10,05-17,05-24,05-31,06-07,
    // 06-14,06-21,06-28 → 5월 4주 뒤 6월 4주. 첫 열과 6월 시작 열에만 라벨.
    const weeks = buildStreakCalendarWeeks([], "2026-07-01", 8);
    const labels = buildStreakCalendarMonthLabels(weeks);
    assert.deepEqual(labels, ["5월", "", "", "", "6월", "", "", ""]);
  });

  it("모든 열이 같은 달이면 첫 열에만 라벨이 붙는다", () => {
    // 06-07,06-14,06-21,06-28 모두 6월.
    const weeks = buildStreakCalendarWeeks([], "2026-07-01", 4);
    const labels = buildStreakCalendarMonthLabels(weeks);
    assert.deepEqual(labels, ["6월", "", "", ""]);
  });

  it("빈 weeks는 빈 배열을 반환한다", () => {
    assert.deepEqual(buildStreakCalendarMonthLabels([]), []);
  });
});

describe("computeLongestStreakDays", () => {
  it("빈 완료일 집합은 0을 반환한다", () => {
    assert.equal(computeLongestStreakDays([]), 0);
  });

  it("단일 완료일은 1을 반환한다", () => {
    assert.equal(computeLongestStreakDays(["2026-06-30"]), 1);
  });

  it("연속 구간이 하나면 그 길이를 반환한다", () => {
    assert.equal(
      computeLongestStreakDays([
        "2026-06-28",
        "2026-06-29",
        "2026-06-30",
      ]),
      3,
    );
  });

  it("끊긴 다중 구간에서 가장 긴 구간의 길이를 반환한다", () => {
    // [6-01] (1) / [6-10,6-11,6-12,6-13] (4) / [6-20,6-21] (2) → 최댓값 4
    const dates = [
      "2026-06-01",
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-20",
      "2026-06-21",
    ];
    assert.equal(computeLongestStreakDays(dates), 4);
  });

  it("입력 순서가 뒤섞여도 정렬 후 최장 구간을 찾는다", () => {
    const dates = [
      "2026-06-13",
      "2026-06-11",
      "2026-06-20",
      "2026-06-12",
      "2026-06-10",
      "2026-06-21",
      "2026-06-01",
    ];
    assert.equal(computeLongestStreakDays(dates), 4);
  });

  it("중복 날짜는 한 번만 세어 연속 판정을 왜곡하지 않는다", () => {
    const dates = [
      "2026-06-10",
      "2026-06-10",
      "2026-06-11",
      "2026-06-11",
      "2026-06-12",
    ];
    assert.equal(computeLongestStreakDays(dates), 3);
  });

  it("월 경계를 넘는 연속(6-30→7-01)도 하나의 구간으로 잇는다", () => {
    assert.equal(
      computeLongestStreakDays(["2026-06-30", "2026-07-01"]),
      2,
    );
  });
});

describe("computeConsecutiveStreakDays (공용 스트릭 규칙)", () => {
  const today = "2026-06-10";

  it("오늘 완료면 오늘부터 거슬러 센다", () => {
    assert.equal(computeConsecutiveStreakDays([today], today), 1);
    assert.equal(
      computeConsecutiveStreakDays(
        ["2026-06-08", "2026-06-09", today],
        today,
      ),
      3,
    );
  });

  it("오늘 미완료·어제 완료면 기본(낙관)으로 오늘 몫을 더하고, 비관 옵션은 더하지 않는다", () => {
    const dates = ["2026-06-08", "2026-06-09"];
    assert.equal(computeConsecutiveStreakDays(dates, today), 3);
    assert.equal(
      computeConsecutiveStreakDays(dates, today, { countTodayPending: false }),
      2,
    );
  });

  it("하루 비면 0이고 유효하지 않은 today 도 0이다", () => {
    assert.equal(computeConsecutiveStreakDays(["2026-06-08"], today), 0);
    assert.equal(computeConsecutiveStreakDays([today], "not-a-date"), 0);
    assert.equal(computeConsecutiveStreakDays([today], "2026-13-40"), 0);
    assert.equal(computeConsecutiveStreakDays([], today), 0);
  });

  it("마일스톤 판정용 이전 값(비관)과 완료 후 값(낙관)이 갈려 7일 달성이 감지된다", () => {
    const sixDays = [
      "2026-06-04",
      "2026-06-05",
      "2026-06-06",
      "2026-06-07",
      "2026-06-08",
      "2026-06-09",
    ];
    const before = computeConsecutiveStreakDays(sixDays, today, {
      countTodayPending: false,
    });
    const after = computeConsecutiveStreakDays([...sixDays, today], today);
    assert.equal(before, 6);
    assert.equal(after, 7);
  });
});

describe("collectCompletedDates", () => {
  it("completedAt 이 파싱되고 날짜 키가 유효한 항목만 모은다", () => {
    const dates = collectCompletedDates([
      { date: "2026-06-10", completedAt: "2026-06-10T10:00:00Z" },
      { date: "2026-06-09", completedAt: "invalid" },
      { date: "2026-06-08", completedAt: null },
      { date: "2026-6-7", completedAt: "2026-06-07T10:00:00Z" },
      { date: "2026-06-10", completedAt: "2026-06-10T11:00:00Z" },
    ]);
    assert.deepEqual([...dates], ["2026-06-10"]);
  });
});

describe("buildWeeklyStreakStrip", () => {
  it("오늘로 끝나는 7일을 오래된 날부터 배치하고 월 경계를 넘긴다", () => {
    const strip = buildWeeklyStreakStrip(["2026-06-30", "2026-07-02"], "2026-07-02");
    assert.equal(strip.length, 7);
    assert.equal(strip[0].date, "2026-06-26");
    assert.equal(strip[6].date, "2026-07-02");
    assert.equal(strip[6].isToday, true);
    assert.equal(strip[5].isToday, false);
    assert.deepEqual(
      strip.map((day) => day.completed),
      [false, false, false, false, true, false, true],
    );
    // 2026-07-02 는 목요일.
    assert.deepEqual(
      strip.map((day) => day.weekdayLabel),
      ["금", "토", "일", "월", "화", "수", "목"],
    );
  });

  it("유효하지 않은 today 면 빈 배열이다", () => {
    assert.deepEqual(buildWeeklyStreakStrip([], "nope"), []);
  });
});

describe("formatStreakStripHeadline", () => {
  it("완료 여부에 따라 이어짐/도전 중 문구를 가른다", () => {
    assert.equal(formatStreakStripHeadline(0, false), "오늘부터 연속 기록을 시작해요");
    assert.equal(formatStreakStripHeadline(3, true), "🔥 3일 연속");
    assert.equal(
      formatStreakStripHeadline(3, false),
      "🔥 3일째 도전 중 · 오늘 풀면 이어져요",
    );
    assert.equal(formatStreakStripHeadline(Number.NaN, false), "오늘부터 연속 기록을 시작해요");
  });
});
