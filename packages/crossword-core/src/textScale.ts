// 글자 크기(접근성) 설정의 공유 계약(3마켓 공통). 타입·기본값·정규화·배율은 core
// 순수 로직으로 두고, 실제 렌더(CSS 변수 주입)는 각 앱이 담당한다.
// core에는 React / React Native / AppsInToss / Firebase SDK import를 넣지 않는다.

/** 보드 셀/단서 글자 크기 배율 프리셋. "large"에서 가독성을 위해 확대한다. */
export type TextScale = "normal" | "large";

/** 기본 글자 크기(보통). */
export const DEFAULT_TEXT_SCALE: TextScale = "normal";

/** 각 글자 크기의 폰트 배율. 앱은 이 값을 CSS 변수(예: --cell-font-scale)로 쓴다. */
export const TEXT_SCALE_FONT_MULTIPLIER: Record<TextScale, number> = {
  normal: 1,
  large: 1.25,
};

/**
 * 저장소/원격에서 온 값을 안전한 TextScale로 정규화한다. 알 수 없는 값(구버전/
 * 오염/undefined)은 기본값(normal)으로 폴백한다.
 */
export function normalizeTextScale(value: unknown): TextScale {
  return value === "large" ? "large" : DEFAULT_TEXT_SCALE;
}

/** 글자 크기에 해당하는 폰트 배율을 돌려준다(정규화 후 조회). */
export function getTextScaleFontMultiplier(value: unknown): number {
  return TEXT_SCALE_FONT_MULTIPLIER[normalizeTextScale(value)];
}
