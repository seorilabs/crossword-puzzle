// 연속 도전(streak) 캘린더 히트맵의 날짜 격자 배치를 계산하는 순수 helper.
// GitHub 컨트리뷰션 그래프처럼 열=주, 행=요일(일→토)로 배치한다. 완료일 판정은
// 상위(어댑터)에서 스캔한 completedDates 집합을 그대로 받으므로 3마켓이 공유하고
// 단위 테스트로 요일/주 정렬·오늘 강조를 고정할 수 있다.

export type StreakCalendarCell = {
  // "YYYY-MM-DD" (UTC 기준 날짜 키).
  date: string;
  // 완료(completedAt 존재)한 날. 미래 칸은 항상 false.
  completed: boolean;
  // 오늘 칸(강조용).
  isToday: boolean;
  // 오늘 이후(이번 주 남은 요일 등) — 렌더에서 비활성 처리.
  isFuture: boolean;
};

// 길이 7의 한 주. index 0 = 일요일 … 6 = 토요일.
export type StreakCalendarWeek = StreakCalendarCell[];

const DAY_MS = 86_400_000;

function toUtcMs(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function toDateKey(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

// completedDates(완료일 집합)를 today가 속한 주까지 최근 `weeks`주 격자로 배치한다.
// 각 열은 한 주(일→토)이며 마지막 열이 오늘이 속한 주다. 오늘 이후 요일은 isFuture로
// 표시하고 완료로 치지 않는다.
export function buildStreakCalendarWeeks(
  completedDates: Iterable<string>,
  today: string,
  weeks: number,
): StreakCalendarWeek[] {
  const completed = new Set(completedDates);
  const todayMs = toUtcMs(today);
  const todayDow = new Date(todayMs).getUTCDay(); // 0=일 … 6=토
  const startOfThisWeek = todayMs - todayDow * DAY_MS;
  const gridStart = startOfThisWeek - (weeks - 1) * 7 * DAY_MS;

  const result: StreakCalendarWeek[] = [];
  for (let w = 0; w < weeks; w += 1) {
    const week: StreakCalendarWeek = [];
    for (let dow = 0; dow < 7; dow += 1) {
      const ms = gridStart + (w * 7 + dow) * DAY_MS;
      const date = toDateKey(ms);
      const isFuture = ms > todayMs;
      week.push({
        date,
        isToday: ms === todayMs,
        isFuture,
        completed: !isFuture && completed.has(date),
      });
    }
    result.push(week);
  }
  return result;
}

// 히트맵 각 주 열 위에 표시할 월 라벨을 계산한다(GitHub 컨트리뷰션식 상단 월 축).
// 반환 배열은 weeks와 길이·순서가 같고, 각 원소는 그 열 위에 표시할 라벨("7월") 또는
// 빈 문자열이다. 라벨은 각 주의 시작 요일(일요일 = week[0])이 속한 월을 기준으로,
// 첫 열이거나 직전 열과 월이 달라지는 열에만 채운다(월이 바뀌는 열에만 표시). 순수
// 계산이라 3마켓이 공유하고 단위 테스트로 고정한다.
export function buildStreakCalendarMonthLabels(
  weeks: StreakCalendarWeek[],
): string[] {
  let previousMonth: number | null = null;
  return weeks.map((week) => {
    const firstDate = week[0]?.date;
    if (firstDate == null) {
      return "";
    }
    const month = Number(firstDate.slice(5, 7));
    const label = previousMonth === month ? "" : `${month}월`;
    previousMonth = month;
    return label;
  });
}

// 완료일 집합(YYYY-MM-DD)에서 최장 연속 완료일 수(통산 최고 스트릭)를 반환한다.
// 하루 놓쳐 현재 스트릭이 끊겨도 통산 최고 기록은 보존해 재도전 동기를 유지하려는
// 지표다. 현재 스트릭(computeConsecutiveStreakDays)과 동일한 완료일 집합을 근거로
// 삼되, 여기서는 오늘 기준이 아닌 전체 기간에서 가장 긴 연속 구간을 찾는다. 중복
// 날짜는 한 번만 세고, 빈 집합은 0을 반환한다. React/Firebase import 없는 순수
// 계산이라 3마켓이 공유하고 단위 테스트로 고정한다.
export function computeLongestStreakDays(
  completedDates: Iterable<string>,
): number {
  const sorted = [...new Set(completedDates)].sort();
  if (sorted.length === 0) return 0;

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prevMs = toUtcMs(sorted[i - 1]);
    const currMs = toUtcMs(sorted[i]);
    if (currMs - prevMs === DAY_MS) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }
  return longest;
}
