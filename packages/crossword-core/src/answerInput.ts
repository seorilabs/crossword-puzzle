import {
  isKoreanCompatibilityJamo,
  koKrLanguageProfile,
  type LanguageProfile,
} from "./languageProfile.ts";

// 플랫폼 무관 정답 입력 규칙. AIT WebView(src)와 RN(apps/mobile)이 동일하게
// 사용해야 하므로 core에 단일 정의한다. React/RN/SDK 의존을 넣지 않는다.

// profile이 정의한 원자 셀 수(maxLength)만큼 자른 입력 배열.
export function getAnswerInputLetters(
  value: string,
  maxLength: number,
  profile: LanguageProfile = koKrLanguageProfile,
): string[] {
  return profile.segmentAnswer(value).slice(0, maxLength);
}

// 완성되지 않은 한글 자모(ㄱ, ㅏ 등) 한 글자인지.
export function isHangulJamoLetter(letter: string): boolean {
  return isKoreanCompatibilityJamo(letter);
}

// 실제 셀에 커밋할 값만 profile 규칙으로 정규화·검증해 추린다.
export function getAnswerCommitLetters(
  value: string,
  maxLength: number,
  profile: LanguageProfile = koKrLanguageProfile,
): string[] {
  return getAnswerInputLetters(value, maxLength, profile)
    .map((cell) => profile.normalizeCommittedCell(cell))
    .filter((cell) => profile.validateCell(cell));
}

// 입력값이 전부 미완성 자모로만 이뤄졌는지(=아직 커밋할 게 없음).
export function isHangulJamoInput(value: string): boolean {
  const letters = getAnswerInputLetters(value, value.length);

  return (
    letters.length > 0 && letters.every((letter) => isHangulJamoLetter(letter))
  );
}
