import type { Puzzle } from "./types";

// 퍼즐 난이도 티어(easy/normal/hard)의 공통 정책. 3마켓(AIT/Android/iOS)이 같은
// 티어 정의를 공유하도록 생성 튜닝 파라미터를 한곳에 둔다. 생성기(server/batch)는
// 이 프로파일로 보드 크기·단어 수·최소 단어 길이를 정한다.
//
// 난이도는 "단어 개수"로만 가른다. 어휘 등급으로 티어를 나누던 방식은 두 가지가
// 나빴다. easy 풀이 907단어로 좁아져 같은 단어가 반복됐고, hard 에는 생소한 단어만
// 몰려 어려움이 아니라 좌절이 됐다. 모든 티어가 같은 워드뱅크 전체를 후보로 쓰면
// 어휘 엔트로피가 최대가 되고, 체감 난도는 보드 크기와 배치 단어 수가 만든다.

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
};

export const DIFFICULTY_ORDER: readonly Difficulty[] = [
  "easy",
  "normal",
  "hard",
];

// easy < normal <= hard 로 보드 크기를 유지한다. "사이즈와 난이도를 동시에 올리지
// 말 것" 원칙에 따라 easy 는 작은 보드에 적은 단어로, hard 는 normal 과 같은 8×8
// 에서 더 많은 단어와 완화된 교차율로 구성한다. normal 은 기존 기본 생성값과
// 동일하게 유지해 회귀가 없도록 한다.
export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: {
    difficulty: "easy",
    // 매일 5×5 easy를 서빙하는 방향(일간 easy 5×5 + normal/hard 8×8)에 맞춰
    // 보드를 5로 낮춘다. 온보딩 퍼즐과 같은 5×5 규격으로, 적은 단어와 촘촘한
    // 교차로 1~2분 안에 푸는 가벼운 데일리를 목표로 한다.
    boardSize: 5,
    maxWords: 7,
    minWordLength: 2,
    minWordCount: 6,
    // easy 는 더 촘촘한 교차(쉬운 단서 연결)가 유리해 교차율을 normal 보다 약간
    // 상향한다. 작은 보드라 밀도는 normal 과 동일하게 둔다(생성 리포트로 보정).
    minCrossRatio: 0.6,
    minBboxDensity: 0.5,
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
