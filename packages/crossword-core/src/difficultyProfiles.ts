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
  // 합격 보드의 최소 교차율(interlock). 교차에 참여하는 셀 비율의 하한으로,
  // 높을수록 단어가 촘촘히 얽혀 단서 연결이 쉬워진다(체감 난도↓).
  minCrossRatio: number;
  // 합격 보드의 최소 bbox 밀도. 보드 사용 영역 대비 채워진 셀 비율의 하한.
  minBboxDensity: number;
  // 이 티어에서 허용하는 워드뱅크 difficulty 값(단어 선택 편향)
  wordDifficulties: readonly Difficulty[];
  // 후보 풀이 부족할 때 자동 보강으로 넘어갈 수 있는 최대 단어 난이도.
  // wordDifficulties보다 높은 티어가 필요해도 이 상한을 넘으면 보강하지 않는다.
  wordDifficultyCeiling: Difficulty;
};

export const DIFFICULTY_ORDER: readonly Difficulty[] = [
  "easy",
  "normal",
  "hard",
];

// easy < normal < hard 로 boardSize/maxWords 가 단조 증가하도록 유지한다.
// "사이즈와 난이도를 동시에 올리지 말 것" 원칙에 따라 easy 는 작은 보드+적은 단어+
// 초급 어휘로, hard 는 큰 보드+많은 단어+고급 어휘로 구성한다. normal 은 easy와
// normal 어휘만 허용해 희귀 어휘 수로 체감 난도를 올리지 않는다.
export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: {
    difficulty: "easy",
    boardSize: 7,
    maxWords: 9,
    minWordLength: 2,
    minWordCount: 8,
    // easy 는 더 촘촘한 교차(쉬운 단서 연결)가 유리해 교차율을 normal 보다 약간
    // 상향한다. 작은 보드라 밀도는 normal 과 동일하게 둔다(생성 리포트로 보정).
    minCrossRatio: 0.6,
    minBboxDensity: 0.5,
    wordDifficulties: ["easy"],
    // 기존 생성 안정성 보강 동작은 유지한다.
    wordDifficultyCeiling: "hard",
  },
  normal: {
    difficulty: "normal",
    boardSize: 8,
    // 첫 완료 소요(중앙값 ~10분)를 줄이기 위해 normal 단어 수를 낮춘다. 보드 크기는
    // easy(7)와의 단조성(easy<normal<hard)을 지켜야 하므로 8로 유지하고, 대신 단어
    // 수 상한(maxWords)을 낮춰 한 판당 채울 단어를 줄인다. 같은 8x8에서 maxWords 12→10
    // 은 생성 단어 수를 ~22→~18로 낮추면서도 교차율·밀도 게이트는 그대로 통과한다.
    maxWords: 10,
    minWordLength: 2,
    minWordCount: 10,
    minCrossRatio: 0.55,
    minBboxDensity: 0.5,
    wordDifficulties: ["easy", "normal"],
    // normal 후보가 부족해도 hard 어휘로 자동 보강하지 않는다.
    wordDifficultyCeiling: "normal",
  },
  hard: {
    difficulty: "hard",
    boardSize: 9,
    // normal→hard 난도 점프를 완화한다(#154). 기존 maxWords 16/minWordCount 18 은
    // normal(10/10) 대비 +60%/+80% 로 점프가 커 normal 직후 hard 진입 시 난도 벽이
    // 컸다. 13/14 로 낮춰 +30%/+40% 로 줄이면서 단조성(easy<normal<hard)과 hard
    // 품질 게이트(minCrossRatio 0.5, minBboxDensity 0.45)는 그대로 통과한다.
    maxWords: 13,
    minWordLength: 2,
    minWordCount: 14,
    // hard 는 큰 보드에 더 성긴 배치를 허용해도 되므로 교차율·밀도를 완화한다.
    minCrossRatio: 0.5,
    minBboxDensity: 0.45,
    wordDifficulties: ["normal", "hard"],
    // 기존 hard 프로파일의 easy 하향 보강 가능성은 유지한다.
    wordDifficultyCeiling: "hard",
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

export function isWordDifficultyWithinProfile(
  difficulty: Difficulty,
  profile: DifficultyProfile,
): boolean {
  const difficultyIndex = DIFFICULTY_ORDER.indexOf(difficulty);
  const ceilingIndex = DIFFICULTY_ORDER.indexOf(profile.wordDifficultyCeiling);
  return (
    difficultyIndex >= 0 && ceilingIndex >= 0 && difficultyIndex <= ceilingIndex
  );
}

// 보드를 안정적으로 생성하기 위한 최소 후보 단어 수. 프로파일 difficulty 필터가
// 워드뱅크 대부분을 잘라낸 결과 이 수치를 밑돌면(예: easy 풀이 비정상적으로 작아진
// 경우) 생성이 막힐 수 있으므로, 인접 티어 단어로 풀을 보강한다.
export const MIN_GENERATION_WORD_POOL = 150;

export type WordSelection<T> = {
  // 생성에 사용할 최종 단어 목록
  words: T[];
  // 최종 풀에 포함된 difficulty 집합(프로파일 + 보강분)
  difficulties: Difficulty[];
  // 보강이 발생했는지 여부와 추가된 difficulty 목록
  broadened: boolean;
  broadenedWith: Difficulty[];
};

// 프로파일 difficulty 로 단어를 거른다. 1차 풀이 minPool 미만이면 생성 실패를
// 막기 위해 인접(난이도 순) 티어 단어를 wordDifficultyCeiling 안에서만 차례로
// 더한다. 상한 안에서 minPool을 채울 수 없으면 작은 풀을 그대로 반환해 호출자가
// fail closed하도록 한다. 1차 풀이 충분하면 보강 없이 순수 티어 풀을 쓴다.
export function selectWordsForProfile<T extends { difficulty?: string | null }>(
  words: readonly T[],
  profile: DifficultyProfile,
  minPool: number = MIN_GENERATION_WORD_POOL,
): WordSelection<T> {
  if (
    !profile.wordDifficulties.every((difficulty) =>
      isWordDifficultyWithinProfile(difficulty, profile),
    )
  ) {
    throw new Error(
      `${profile.difficulty} wordDifficulties exceed ${profile.wordDifficultyCeiling} ceiling`,
    );
  }
  const allowed = new Set<Difficulty>(profile.wordDifficulties);
  let selected = words.filter((word) => allowed.has(getWordDifficulty(word)));
  const broadenedWith: Difficulty[] = [];

  for (const difficulty of DIFFICULTY_ORDER) {
    if (selected.length >= minPool) {
      break;
    }

    if (allowed.has(difficulty)) {
      continue;
    }
    if (!isWordDifficultyWithinProfile(difficulty, profile)) {
      continue;
    }

    allowed.add(difficulty);
    broadenedWith.push(difficulty);
    selected = words.filter((word) => allowed.has(getWordDifficulty(word)));
  }

  return {
    words: selected,
    difficulties: DIFFICULTY_ORDER.filter((difficulty) =>
      allowed.has(difficulty),
    ),
    broadened: broadenedWith.length > 0,
    broadenedWith,
  };
}
