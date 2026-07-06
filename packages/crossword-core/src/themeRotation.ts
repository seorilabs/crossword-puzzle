// 일일 발행 로테이션에 주제(테마) 다양성을 부여하는 순수 규칙(#249).
// 스케줄 잡(run-puzzle-pack-job)이 생성할 슬롯의 요일·시각으로 이 함수를 호출해
// 해당 슬롯에 배정할 주제 태그를 결정하고 생성기에 `--theme` 로 주입한다.
// core 에는 fs/네트워크 import 를 넣지 않는다(순수 함수만, 단위 테스트로 경계 고정).

// 요일(0=일 ~ 6=토, Date.getUTCDay 관례)별 주제 태그. null 이면 그 요일에는
// 로테이션 주제를 배정하지 않는다. 기본 4개 카테고리(food/animal/nature/body,
// data/lexicon/puzzle-word-filter.json 의 themeCategories)를 주간에 고르게 배분해
// 매일 최소 1개의 주제 슬롯이 발행되도록 한다.
export const WEEKDAY_THEME_ROTATION: readonly (string | null)[] = [
  "nature", // 일요일 · 자연
  "food", // 월요일 · 음식
  "animal", // 화요일 · 동물
  "nature", // 수요일 · 자연
  "body", // 목요일 · 신체
  "food", // 금요일 · 음식
  "animal", // 토요일 · 동물
];

// 하루 12슬롯(2h 간격) 중 이 슬롯 시작시(정오)에만 주제를 배정한다. 나머지 슬롯은
// 일반 퍼즐로 두어 "일부 슬롯"에만 주제가 들어가게 한다. 슬롯 경계(intervalHours)와
// 정렬되는 값을 쓴다.
export const THEMED_SLOT_HOUR = 12;

export type ScheduledThemeParams = {
  // 슬롯이 속한 날짜의 요일(0=일 ~ 6=토).
  weekday: number;
  // 슬롯 시작 시각(0-23). 잡이 intervalHours 로 내림한 값을 넘긴다.
  slotHour: number;
};

/**
 * 슬롯의 요일·시각으로 배정할 주제 태그를 반환한다. 배정이 없으면 null.
 * 정오 슬롯이 아니면 항상 null 이고, 정오 슬롯이면 요일 로테이션 표를 따른다.
 */
export function resolveScheduledTheme(
  params: ScheduledThemeParams,
): string | null {
  if (params.slotHour !== THEMED_SLOT_HOUR) {
    return null;
  }
  const weekdayIndex = ((Math.trunc(params.weekday) % 7) + 7) % 7;
  return WEEKDAY_THEME_ROTATION[weekdayIndex] ?? null;
}
