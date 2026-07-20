// 플랫폼 무관 정답 입력 규칙. AIT WebView(src)와 RN(apps/mobile)이 동일하게
// 사용해야 하므로 core에 단일 정의한다. React/RN/SDK 의존을 넣지 않는다.

// 공백을 제거하고 셀 수(maxLength)만큼 자른 입력 글자 배열.
export function getAnswerInputLetters(value: string, maxLength: number): string[] {
  return [...value.replace(/\s/g, "")].slice(0, maxLength);
}

// 완성되지 않은 한글 자모(ㄱ, ㅏ 등) 한 글자인지.
export function isHangulJamoLetter(letter: string): boolean {
  return /^[ㄱ-ㅎㅏ-ㅣ]$/.test(letter);
}

// 실제 셀에 커밋할 글자만(완성되지 않은 자모 제외) 추린 배열.
export function getAnswerCommitLetters(value: string, maxLength: number): string[] {
  return getAnswerInputLetters(value, maxLength).filter(
    (letter) => !isHangulJamoLetter(letter),
  );
}

// 입력값이 전부 미완성 자모로만 이뤄졌는지(=아직 커밋할 게 없음).
export function isHangulJamoInput(value: string): boolean {
  const letters = getAnswerInputLetters(value, value.length);

  return (
    letters.length > 0 && letters.every((letter) => isHangulJamoLetter(letter))
  );
}
