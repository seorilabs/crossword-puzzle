import type { Puzzle } from "./types";

// 퍼즐 난이도 티어(easy/normal/hard)의 공통 정책. 3마켓(AIT/Android/iOS)이 같은
// 티어 정의를 공유하도록 생성 튜닝 파라미터를 한곳에 둔다. 생성기(server/batch)는
// 이 프로파일로 보드 크기·단어 수·최소 단어 길이와 워드뱅크 difficulty 필터를 정한다.

export type Difficulty = Puzzle["difficulty"];

export type DifficultyProfile = {
  difficulty: Difficulty;
  // 생성 보드 한 변 크기
  boardSize: number;
  // 한 퍼즐에 배치할 최대 단어 수
  maxWords: number;
  // 후보 단어의 최소 글자 수
  minWordLength: number;
  // 합격 보드의 최소 단어(run) 수. 티어별 평균 단어 수를 가르는 하한.
  minWordCount: number;
  // 이 티어에서 허용하는 워드뱅크 difficulty 값(단어 선택 편향)
  wordDifficulties: readonly Difficulty[];
};

export const DIFFICULTY_ORDER: readonly Difficulty[] = ["easy", "normal", "hard"];

// easy < normal < hard 로 boardSize/maxWords 가 단조 증가하도록 유지한다.
// "사이즈와 난이도를 동시에 올리지 말 것" 원칙에 따라 easy 는 작은 보드+적은 단어+
// 초급 어휘로, hard 는 큰 보드+많은 단어+고급 어휘로 구성한다. normal 은 기존
// 기본 생성값과 동일하게 유지해 회귀가 없도록 한다.
export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: {
    difficulty: "easy",
    boardSize: 7,
    maxWords: 9,
    minWordLength: 2,
    minWordCount: 8,
    wordDifficulties: ["easy"],
  },
  normal: {
    difficulty: "normal",
    boardSize: 8,
    maxWords: 12,
    minWordLength: 2,
    minWordCount: 12,
    wordDifficulties: ["easy", "normal", "hard"],
  },
  hard: {
    difficulty: "hard",
    boardSize: 9,
    maxWords: 16,
    minWordLength: 2,
    minWordCount: 18,
    wordDifficulties: ["normal", "hard"],
  },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return value === "easy" || value === "normal" || value === "hard";
}

// 입력 difficulty 가 유효하지 않으면 normal 프로파일로 폴백한다.
export function resolveDifficultyProfile(
  difficulty: string | undefined | null,
): DifficultyProfile {
  if (isDifficulty(difficulty)) {
    return DIFFICULTY_PROFILES[difficulty];
  }

  return DIFFICULTY_PROFILES.normal;
}

// 워드뱅크 단어의 difficulty 값을 표준화한다(없거나 비정상이면 normal 취급).
export function getWordDifficulty(word: {
  difficulty?: string | null;
}): Difficulty {
  return isDifficulty(word.difficulty) ? word.difficulty : "normal";
}

// 프로파일이 허용하는 difficulty 단어만 남긴다.
export function filterWordsByDifficulty<
  T extends { difficulty?: string | null },
>(words: readonly T[], profile: DifficultyProfile): T[] {
  const allowed = new Set<Difficulty>(profile.wordDifficulties);

  return words.filter((word) => allowed.has(getWordDifficulty(word)));
}

// 단어 목록의 difficulty 분포를 집계한다(생성 리포트에서 편향 확인용).
export function summarizeWordDifficulties<
  T extends { difficulty?: string | null },
>(words: readonly T[]): Record<Difficulty, number> {
  const counts: Record<Difficulty, number> = { easy: 0, normal: 0, hard: 0 };

  for (const word of words) {
    counts[getWordDifficulty(word)] += 1;
  }

  return counts;
}
