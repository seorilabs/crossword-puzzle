export type LanguageProfileReference = {
  id: string;
  version: number;
};

export type LanguageProfile = LanguageProfileReference & {
  contentLocale: string;
  normalizeSource(value: string): string;
  segmentAnswer(value: string): string[];
  normalizeCommittedCell(value: string): string;
  validateCell(value: string): boolean;
  cellsEqual(left: string, right: string): boolean;
};

const HANGUL_SYLLABLE_PATTERN = /^[\uac00-\ud7a3]$/u;
const HANGUL_COMPATIBILITY_JAMO_PATTERN = /^[\u3131-\u318e]$/u;

function normalizeKoreanSource(value: string): string {
  return value.normalize("NFC").replace(/\s/gu, "");
}

/**
 * 출시 콘텐츠가 사용하는 유일한 언어 프로필이다.
 *
 * IME 조합 상태는 React/RN 입력 controller가 소유한다. 이 프로필은 조합이 끝난
 * 문자열만 정규화하고, 한 셀에 커밋 가능한 완성형 한글 음절인지 판정한다.
 */
export const koKrLanguageProfile: LanguageProfile = Object.freeze({
  id: "ko-KR",
  version: 1,
  contentLocale: "ko-KR",
  normalizeSource: normalizeKoreanSource,
  segmentAnswer(value) {
    return Array.from(normalizeKoreanSource(value));
  },
  normalizeCommittedCell(value) {
    return value.normalize("NFC").trim();
  },
  validateCell(value) {
    return HANGUL_SYLLABLE_PATTERN.test(value);
  },
  cellsEqual(left, right) {
    return left.normalize("NFC").trim() === right.normalize("NFC").trim();
  },
});

const builtInProfiles = new Map<string, LanguageProfile>([
  [getLanguageProfileKey(koKrLanguageProfile), koKrLanguageProfile],
]);

export function getLanguageProfileKey(
  reference: LanguageProfileReference,
): string {
  return `${reference.id}/v${reference.version}`;
}

export function resolveLanguageProfile(
  reference: LanguageProfileReference,
  contentLocale: string,
): LanguageProfile | null {
  const profile = builtInProfiles.get(getLanguageProfileKey(reference)) ?? null;

  return profile?.contentLocale === contentLocale ? profile : null;
}

export function projectAnswerCells(answerCells: readonly string[]): string {
  return answerCells.join("");
}

export function normalizeAndValidateAnswerCells(
  profile: LanguageProfile,
  answerCells: readonly string[],
): { cells: string[]; valid: boolean } {
  const cells = answerCells.map((cell) =>
    profile.normalizeCommittedCell(cell),
  );

  return {
    cells,
    valid: cells.length > 0 && cells.every((cell) => profile.validateCell(cell)),
  };
}

export function isKoreanCompatibilityJamo(value: string): boolean {
  return HANGUL_COMPATIBILITY_JAMO_PATTERN.test(value);
}
