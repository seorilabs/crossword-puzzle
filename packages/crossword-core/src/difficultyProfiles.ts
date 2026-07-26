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
};

export const DIFFICULTY_ORDER: readonly Difficulty[] = [
  "easy",
  "normal",
  "hard",
];

// easy < normal <= hard 로 보드 크기를 유지한다. "사이즈와 난이도를 동시에 올리지
// 말 것" 원칙에 따라 easy 는 작은 보드+적은 단어+초급 어휘로, hard 는 normal과
// 같은 8×8에서 더 많은 단어+고급 어휘+완화된 교차율로 구성한다. normal 은 기존
// 기본 생성값과 동일하게 유지해 회귀가 없도록 한다.
export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: {
    difficulty: "easy",
    // 매일 5×5 easy를 서빙하는 방향(일간 easy 5×5 + normal/hard 8×8)에 맞춰
    // 보드를 5로 낮춘다. 온보딩 퍼즐과 같은 5×5 규격으로, 초급 어휘·촘촘한
    // 교차로 1~2분 안에 푸는 가벼운 데일리를 목표로 한다.
    boardSize: 5,
    maxWords: 7,
    minWordLength: 2,
    minWordCount: 6,
    // easy 는 더 촘촘한 교차(쉬운 단서 연결)가 유리해 교차율을 normal 보다 약간
    // 상향한다. 작은 보드라 밀도는 normal 과 동일하게 둔다(생성 리포트로 보정).
    minCrossRatio: 0.6,
    minBboxDensity: 0.5,
    wordDifficulties: ["easy"],
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
    wordDifficulties: ["easy", "normal", "hard"],
  },
  hard: {
    difficulty: "hard",
    // 모바일에서 normal과 같은 물리 크기로 비교·선택할 수 있도록 hard도 8×8로
    // 고정한다. 13개 배치를 8×8에 강제하면 유효 후보가 고갈되므로 실제 생성
    // 검증을 통과한 11개 배치로 조정하고, 어휘 편향·교차율·단어 수로 난도를 올린다.
    boardSize: 8,
    maxWords: 11,
    minWordLength: 2,
    minWordCount: 12,
    // hard 는 큰 보드에 더 성긴 배치를 허용해도 되므로 교차율·밀도를 완화한다.
    minCrossRatio: 0.5,
    minBboxDensity: 0.45,
    wordDifficulties: ["normal", "hard"],
  },
};

// 온보딩 난이도 램프(#291)의 "중간" 생성 프로파일 — easy 와 normal 사이의 완화된
// normal 파라미터 세트다. easy(73초) 대비 normal(약 18분) 완료 시간 절벽을 낮추기
// 위해, 단어 수를 normal 보다 줄이고 교차율(easy 수준)로 촘촘히 얽어 체감 난도를
// 낮춘다. 새 티어(enum) 를 추가하지 않으려고 difficulty 는 "normal" 로 유지하므로
// (isDifficulty("medium") 는 계속 false) Puzzle 타입·검증·계측에 파급이 없다.
//
// 단조성: boardSize 는 easy(5)<normal(8) 사이에 정수가 없어 normal 과 같은 8 로 두되,
// maxWords·minWordCount 를 easy 이상 normal 미만으로, 교차율은 easy 와 동일(0.6)하게
// 상향해 "사이즈가 아니라 단어 수·교차로 난도를 낮춘다".
export const ONBOARDING_MEDIUM_PROFILE: DifficultyProfile = {
  difficulty: "normal",
  boardSize: 8,
  // easy(7) 이상 normal(10) 미만인 9로 두어 normal보다 한 단어 적게 배치한다.
  maxWords: 9,
  minWordLength: 2,
  // minWordCount 는 easy(6)<9<normal(10) 로 엄밀히 중간에 둔다.
  minWordCount: 9,
  // 교차율은 easy 수준(0.6)으로 올려(normal 0.55 대비) 단서 연결을 쉽게 한다.
  minCrossRatio: 0.6,
  minBboxDensity: 0.5,
  // 고급(hard) 어휘를 배제해 normal 대비 어휘 편향도 완화한다.
  wordDifficulties: ["easy", "normal"],
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
// 막기 위해 인접(난이도 순) 티어 단어를 차례로 더해 minPool 이상이 되도록
// 보강한다. 1차 풀이 충분하면(예: easy 907단어) 보강 없이 순수 티어 풀을 쓴다.
export function selectWordsForProfile<T extends { difficulty?: string | null }>(
  words: readonly T[],
  profile: DifficultyProfile,
  minPool: number = MIN_GENERATION_WORD_POOL,
): WordSelection<T> {
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
