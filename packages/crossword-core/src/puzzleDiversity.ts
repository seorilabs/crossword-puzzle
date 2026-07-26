export const DEFAULT_DIVERSITY_HISTORY_LIMIT = 7;
export const DEFAULT_MAX_SHARED_ANSWER_RATIO = 0.5;
export const DEFAULT_MAX_SCAFFOLD_SIMILARITY = 0.75;

export type PuzzleDiversitySnapshot = {
  answers: readonly string[];
  occupiedCellKeys: readonly string[];
  puzzleId?: string;
  slotId?: string;
};

export type PuzzleDiversityThresholds = {
  maxSharedAnswerRatio: number;
  maxScaffoldSimilarity: number;
};

export type PuzzleDiversityComparison = {
  puzzleId?: string;
  sharedAnswerRatio: number;
  scaffoldSimilarity: number;
};

export type PuzzleDiversityResult = {
  comparisons: PuzzleDiversityComparison[];
  maxSharedAnswerRatio: number;
  maxScaffoldSimilarity: number;
  pass: boolean;
};

export function excludePreviouslyUsedAnswers<T extends { answer: string }>(
  words: readonly T[],
  usedAnswers: Iterable<string>,
) {
  const normalizedUsedAnswers = new Set(
    [...usedAnswers].map((answer) => answer.trim()).filter(Boolean),
  );

  return words.filter((word) => !normalizedUsedAnswers.has(word.answer.trim()));
}

export function selectComparableDiversityHistory(
  recentPuzzles: readonly PuzzleDiversitySnapshot[],
  currentSlotId: string,
  limit = DEFAULT_DIVERSITY_HISTORY_LIMIT,
) {
  const safeLimit = Math.max(0, Math.floor(limit));

  return recentPuzzles
    .filter((snapshot) => snapshot.slotId !== currentSlotId)
    .slice(0, safeLimit);
}

function uniqueNonEmpty(values: readonly string[]) {
  return new Set(values.map((value) => value.trim()).filter(Boolean));
}

function getSharedRatio(
  candidateValues: ReadonlySet<string>,
  existingValues: ReadonlySet<string>,
) {
  if (candidateValues.size === 0) {
    return 0;
  }

  let sharedCount = 0;
  for (const value of candidateValues) {
    if (existingValues.has(value)) {
      sharedCount += 1;
    }
  }

  return sharedCount / candidateValues.size;
}

function getJaccardSimilarity(
  candidateValues: ReadonlySet<string>,
  existingValues: ReadonlySet<string>,
) {
  const union = new Set([...candidateValues, ...existingValues]);
  if (union.size === 0) {
    return 0;
  }

  let sharedCount = 0;
  for (const value of candidateValues) {
    if (existingValues.has(value)) {
      sharedCount += 1;
    }
  }

  return sharedCount / union.size;
}

export function evaluatePuzzleDiversity(
  candidate: PuzzleDiversitySnapshot,
  recentPuzzles: readonly PuzzleDiversitySnapshot[],
  thresholds: PuzzleDiversityThresholds = {
    maxSharedAnswerRatio: DEFAULT_MAX_SHARED_ANSWER_RATIO,
    maxScaffoldSimilarity: DEFAULT_MAX_SCAFFOLD_SIMILARITY,
  },
): PuzzleDiversityResult {
  const candidateAnswers = uniqueNonEmpty(candidate.answers);
  const candidateCells = uniqueNonEmpty(candidate.occupiedCellKeys);
  const comparisons = recentPuzzles.map((recentPuzzle) => ({
    puzzleId: recentPuzzle.puzzleId,
    sharedAnswerRatio: getSharedRatio(
      candidateAnswers,
      uniqueNonEmpty(recentPuzzle.answers),
    ),
    scaffoldSimilarity: getJaccardSimilarity(
      candidateCells,
      uniqueNonEmpty(recentPuzzle.occupiedCellKeys),
    ),
  }));
  const maxSharedAnswerRatio = Math.max(
    0,
    ...comparisons.map((comparison) => comparison.sharedAnswerRatio),
  );
  const maxScaffoldSimilarity = Math.max(
    0,
    ...comparisons.map((comparison) => comparison.scaffoldSimilarity),
  );

  return {
    comparisons,
    maxSharedAnswerRatio,
    maxScaffoldSimilarity,
    pass:
      maxSharedAnswerRatio <= thresholds.maxSharedAnswerRatio &&
      maxScaffoldSimilarity <= thresholds.maxScaffoldSimilarity,
  };
}
