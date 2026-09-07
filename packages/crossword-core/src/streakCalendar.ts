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

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// "YYYY-MM-DD"이면서 실제 달력에 존재하는 날짜만 통과시킨다(2026-13-40 등 제외).
export function isValidDateKey(dateKey: string): boolean {
  if (!DATE_KEY_PATTERN.test(dateKey)) return false;
  const ms = toUtcMs(dateKey);
  return Number.isFinite(ms) && toDateKey(ms) === dateKey;
}

// 완료 기록(날짜 + completedAt)에서 완료일 집합을 만든다. completedAt이 파싱되는
// 문자열이고 날짜 키가 유효한 항목만 센다. 웹은 localStorage 미션 레코드, RN은
// 아카이브 레코드를 같은 모양으로 넘겨 3마켓이 같은 완료 판정을 쓴다.
export function collectCompletedDates(
  entries: Iterable<{ date: string; completedAt?: string | null }>,
): Set<string> {
  const completed = new Set<string>();
  for (const entry of entries) {
    if (
      typeof entry.completedAt === "string" &&
      Number.isFinite(Date.parse(entry.completedAt)) &&
      isValidDateKey(entry.date)
    ) {
      completed.add(entry.date);
    }
  }
  return completed;
}

// 현재 연속 완료일 수.
//
// countTodayPending(기본 true): 오늘은 아직 안 풀었지만 어제까지 이어져 있으면 오늘
// 몫을 +1로 센다. 홈 스트립·넛지는 오늘 완료 "전"에 보이므로, 자정에 0으로 떨어지는
// 비관적 계산은 "기록이 끊겼다"로 읽혀 오늘 풀 동기를 꺾는다. 반대로 마일스톤 달성
// 판정(이전 < 임계 ≤ 현재)의 "이전 값"은 countTodayPending=false로 계산해야 한다 —
// 낙관 +1을 이전 값에도 적용하면 완료 전후가 같은 수가 되어 7/30/100일 달성 이벤트가
// 발화하지 않는다. 웹이 오래 안고 있던 잠재 결함이라 여기서 규칙을 하나로 고정한다.
export function computeConsecutiveStreakDays(
  completedDates: Iterable<string>,
  today: string,
  options: { countTodayPending?: boolean } = {},
): number {
  const countTodayPending = options.countTodayPending ?? true;
  if (!isValidDateKey(today)) return 0;

  const completed = new Set(completedDates);
  if (completed.size === 0) return 0;

  const todayMs = toUtcMs(today);
  const yesterday = toDateKey(todayMs - DAY_MS);
  const startsToday = completed.has(today);
  if (!startsToday && !completed.has(yesterday)) {
    return 0;
  }

  // 오늘 미완료면 어제까지 이어진 구간을 세고, 낙관 모드에서만 오늘 몫을 더한다.
  let streak = 0;
  let cursorMs = startsToday ? todayMs : todayMs - DAY_MS;
  while (completed.has(toDateKey(cursorMs))) {
    streak += 1;
    cursorMs -= DAY_MS;
  }
  if (startsToday) return streak;
  return countTodayPending ? streak + 1 : streak;
}

export type WeeklyStreakStripDay = {
  date: string;
  // 요일 한 글자(일~토).
  weekdayLabel: string;
  completed: boolean;
  isToday: boolean;
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// 오늘로 끝나는 최근 7일 스트립(오래된 날부터). 히트맵과 달리 주 단위로 자르지
// 않아 미래 칸이 없고 오늘이 항상 오른쪽 끝에 온다.
export function buildWeeklyStreakStrip(
  completedDates: Iterable<string>,
  today: string,
): WeeklyStreakStripDay[] {
  if (!isValidDateKey(today)) return [];
  const completed = new Set(completedDates);
  const todayMs = toUtcMs(today);
  const days: WeeklyStreakStripDay[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const ms = todayMs - offset * DAY_MS;
    const date = toDateKey(ms);
    days.push({
      date,
      weekdayLabel: WEEKDAY_LABELS[new Date(ms).getUTCDay()],
      completed: completed.has(date),
      isToday: offset === 0,
    });
  }
  return days;
}

// 스트립 위에 놓는 한 줄 헤드라인. 오늘 완료 여부에 따라 "이어졌다"와 "오늘 풀면
// 이어진다"를 구분해, 낙관 +1 스트릭이 실제 완료로 오해되지 않게 한다.
export function formatStreakStripHeadline(
  streak: number,
  todayCompleted: boolean,
): string {
  const safeStreak = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
  if (safeStreak <= 0) {
    return "오늘부터 연속 기록을 시작해요";
  }
  if (todayCompleted) {
    return `🔥 ${safeStreak}일 연속`;
  }
  return `🔥 ${safeStreak}일째 도전 중 · 오늘 풀면 이어져요`;
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
