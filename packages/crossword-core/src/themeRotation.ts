// 일일 발행 로테이션에 주제(테마) 다양성을 부여하는 순수 규칙(#249).
// 스케줄 잡(run-puzzle-pack-job)이 생성할 슬롯의 요일·시각으로 이 함수를 호출해
// 해당 슬롯에 배정할 주제 태그를 결정하고 생성기에 `--theme` 로 주입한다.
// core 에는 fs/네트워크 import 를 넣지 않는다(순수 함수만, 단위 테스트로 경계 고정).

// 주제 카테고리 화이트리스트. 워드뱅크 필터 데이터
// (data/lexicon/puzzle-word-filter.json 의 `themeCategories[].id`)가 단일 출처이며,
// core 는 fs 를 쓰지 못하므로(순수 모듈) 그 id 목록을 여기서 상수로 미러링한다.
// 데이터와 이 목록이 어긋나면(카테고리 추가/이름 변경 등) themeRotation.test 가
// JSON 과 대조해 실패하도록 가드한다(#257). 로테이션 표와 함수 반환 타입은 이
// 목록으로 좁혀 컴파일 타임에도 오타/미등록 태그를 막는다.
export const THEME_CATEGORY_IDS = [
  "food",
  "animal",
  "nature",
  "body",
  "table-kitchen",
  "living-world",
  "home-family",
  "road-places",
  "learning-culture",
  "work-community",
] as const;

export type ThemeCategoryId = (typeof THEME_CATEGORY_IDS)[number];

// 주어진 태그가 알려진 주제 카테고리 id 인지 판별하는 순수 가드.
export function isKnownThemeCategory(
  tag: string | null | undefined,
): tag is ThemeCategoryId {
  return tag != null && (THEME_CATEGORY_IDS as readonly string[]).includes(tag);
}

// 요일(0=일 ~ 6=토, Date.getUTCDay 관례)별 주제 태그. null 이면 그 요일에는
// 로테이션 주제를 배정하지 않는다. 4개 카테고리(food/animal/nature/body)를 주간에
// 고르게 배분해 매일 최소 1개의 주제 슬롯이 발행되도록 한다. 타입을
// ThemeCategoryId 로 좁혀 화이트리스트 밖 태그는 컴파일이 거부한다.
export const WEEKDAY_THEME_ROTATION: readonly (ThemeCategoryId | null)[] = [
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
 * 반환 태그는 항상 THEME_CATEGORY_IDS 화이트리스트 안의 값이다.
 */
export function resolveScheduledTheme(
  params: ScheduledThemeParams,
): ThemeCategoryId | null {
  if (params.slotHour !== THEMED_SLOT_HOUR) {
    return null;
  }
  const weekdayIndex = ((Math.trunc(params.weekday) % 7) + 7) % 7;
  return WEEKDAY_THEME_ROTATION[weekdayIndex] ?? null;
}
