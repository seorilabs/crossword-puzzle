export const VOCABULARY_POLICY_VERSION = "familiar-v1";
export const VOCABULARY_WEIGHTS = {
  초급: 128,
  중급: 32,
  고급: 1,
  unknown: 1,
} as const;
type VocabularyWord = { level?: string };
export function sampleVocabulary<T extends VocabularyWord>(
  words: readonly T[],
  limit: number,
  random: () => number,
): T[] {
  if (words.length <= limit) return [...words];
  return words
    .map((word, index) => {
      const weight =
        word.level === "초급"
          ? VOCABULARY_WEIGHTS.초급
          : word.level === "중급"
            ? VOCABULARY_WEIGHTS.중급
            : word.level === "고급"
              ? VOCABULARY_WEIGHTS.고급
              : VOCABULARY_WEIGHTS.unknown;
      return { word, index, key: -Math.log(1 - random()) / weight };
    })
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .slice(0, Math.max(0, Math.floor(limit)))
    .map((row) => row.word);
}
export function getVocabularyMix(words: readonly VocabularyWord[]) {
  const familiar = words.filter(
    (word) => word.level === "초급" || word.level === "중급",
  ).length;
  return {
    familiar,
    total: words.length,
    ratio: words.length ? familiar / words.length : 0,
  };
}

// Search preference only; eligibility, repeat windows and quality gates stay unchanged.
export function familiarVocabularyBonus(
  words: readonly VocabularyWord[],
): number {
  return getVocabularyMix(words).familiar * 1800;
}
