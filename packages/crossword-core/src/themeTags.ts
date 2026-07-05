// 주제(테마) 태깅의 공유 순수 로직(#236). 단어장 생성/후처리 스크립트와 퍼즐
// 생성기가 함께 쓰는 결정적 규칙을 core에 두어, Node/브라우저 어느 쪽에서도 같은
// 결과가 나오도록 하고 단위 테스트로 경계를 고정한다. core에는 fs/네트워크 import를
// 넣지 않는다(순수 함수만).

/** 주제 카테고리 정의. keywords 중 하나라도 단어 텍스트에 포함되면 해당 주제로 태깅한다. */
export type ThemeCategory = {
  // 태그 식별자(예: "food"). themeTags 배열·매니페스트 themeTag 에 그대로 쓴다.
  id: string;
  // 사용자 노출용 라벨(예: "음식").
  label: string;
  // 매칭 키워드. 오탐을 줄이기 위해 다의성 낮은(2자 이상) 키워드를 권장한다.
  keywords: string[];
};

/** 태깅 대상 단어에서 매칭에 쓰는 최소 필드. */
export type ThemeTaggableWord = {
  answer: string;
  definition?: string;
  clue?: string;
};

/**
 * 단어의 뜻풀이(definition)·힌트(clue) 텍스트에 카테고리 키워드가 포함되면 그
 * 카테고리로 태깅한다. answer 자체는 짧은 글자 우연 일치(부분 문자열 오탐)를 피하기
 * 위해 매칭 대상에서 제외하고, 의미를 담은 뜻풀이/힌트만 본다. 반환 순서는 입력
 * categories 순서를 따르며, 매칭이 없으면 빈 배열이다(결정적).
 */
export function assignThemeTags(
  word: ThemeTaggableWord,
  categories: readonly ThemeCategory[],
): string[] {
  const haystack = `${word.definition ?? ""} ${word.clue ?? ""}`;
  const tags: string[] = [];
  for (const category of categories) {
    const matched = category.keywords.some(
      (keyword) => keyword.length > 0 && haystack.includes(keyword),
    );
    if (matched) {
      tags.push(category.id);
    }
  }
  return tags;
}

/** 단어의 themeTags 에 특정 주제 id 가 포함되는지. 생성기의 주제 제약 필터에 쓴다. */
export function wordHasTheme(
  themeTags: readonly string[] | undefined,
  themeId: string,
): boolean {
  return Array.isArray(themeTags) && themeTags.includes(themeId);
}
