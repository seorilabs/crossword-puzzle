/**
 * 출시 inventory 전체에서 사용하는 단일 단서 유사도 정책이다.
 * 플랫폼·생성기·최종 validator가 같은 정규화와 임계치를 공유한다.
 */
export const LAUNCH_CLUE_SIMILARITY_POLICY_ID = "ko-kr-launch-bigram-dice-v2";

// 0.882...인 사실상 같은 단서 계열은 차단하되, 0.875인 수컷/암컷,
// 우측/좌측처럼 문장 틀은 같아도 답의 구별이 분명한 대조 단서는 허용한다.
export const LAUNCH_CLUE_SIMILARITY_THRESHOLD = 0.88;

export function normalizeClueForSimilarity(clue: string): string {
  return String(clue ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function makeBigrams(normalizedClue: string): Set<string> {
  const characters = [...normalizedClue];
  if (characters.length < 2) return new Set(characters);
  return new Set(
    characters
      .slice(0, -1)
      .map((character, index) => `${character}${characters[index + 1]}`),
  );
}

export function clueSimilarityScore(
  leftClue: string,
  rightClue: string,
): number {
  const left = normalizeClueForSimilarity(leftClue);
  const right = normalizeClueForSimilarity(rightClue);
  if (left === "" || right === "") return 0;
  if (left === right) return 1;

  const leftBigrams = makeBigrams(left);
  const rightBigrams = makeBigrams(right);
  if (leftBigrams.size === 0 || rightBigrams.size === 0) return 0;
  let intersection = 0;
  for (const bigram of leftBigrams) {
    if (rightBigrams.has(bigram)) intersection += 1;
  }
  return (2 * intersection) / (leftBigrams.size + rightBigrams.size);
}

export function areCluesSimilar(leftClue: string, rightClue: string): boolean {
  return (
    clueSimilarityScore(leftClue, rightClue) >= LAUNCH_CLUE_SIMILARITY_THRESHOLD
  );
}
