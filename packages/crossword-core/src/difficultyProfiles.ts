import type { Puzzle } from "./types";

// 퍼즐 난이도 티어(easy/hard)의 공통 정책. 3마켓(AIT/Android/iOS)이 같은
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

export const DIFFICULTY_ORDER: readonly Difficulty[] = ["easy", "hard"];

// 두 단계는 "가볍게 한 판"과 "제대로 한 판"으로 갈린다. 어휘는 같은 풀을 쓰므로
// 차이를 만드는 것은 보드 크기와 배치 단어 수뿐이다. easy 5×5 는 실제 생성에서
// 9~10단어, hard 8×8 은 19~20단어가 나와 완료 부담이 약 두 배로 벌어진다.
export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: {
    difficulty: "easy",
    // 매일 두 판을 서빙하는 방향(easy 5×5 + hard 8×8)에 맞춰
    // 보드를 5로 낮춘다. 온보딩 퍼즐과 같은 5×5 규격으로, 적은 단어와 촘촘한
    // 교차로 1~2분 안에 푸는 가벼운 데일리를 목표로 한다.
    boardSize: 5,
    maxWords: 7,
    minWordLength: 2,
    minWordCount: 6,
    // easy 는 더 촘촘한 교차(쉬운 단서 연결)가 유리해 hard 보다 교차율을 올린다.
    // 작은 보드라 밀도 하한은 hard 보다 높게 둔다(생성 리포트로 보정).
    minCrossRatio: 0.6,
    minBboxDensity: 0.5,
  },
  hard: {
    difficulty: "hard",
    // 모바일 난이도 선택에서 두 티어를 나란히 비교할 수 있도록 8×8로 고정한다.
    // 13개 배치를 8×8에 강제하면 유효 후보가 고갈되므로 실제 생성 검증을 통과한
    // 11개 배치로 조정하고, 교차율과 단어 수로 난도를 올린다.
    boardSize: 8,
    maxWords: 11,
    minWordLength: 2,
    minWordCount: 12,
    // hard 는 큰 보드에 더 성긴 배치를 허용해도 되므로 교차율·밀도를 완화한다.
    minCrossRatio: 0.5,
    minBboxDensity: 0.45,
  },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return value === "easy" || value === "hard";
}

// 입력 difficulty 가 유효하지 않으면 가벼운 쪽(easy)으로 폴백한다. 생성 배치는
// 항상 난이도를 명시하므로, 이 폴백은 잘못된 입력이 어려운 판으로 새지 않게 하는
// 안전장치다.
export function resolveDifficultyProfile(
  difficulty: string | undefined | null,
): DifficultyProfile {
  if (isDifficulty(difficulty)) {
    return DIFFICULTY_PROFILES[difficulty];
  }

  return DIFFICULTY_PROFILES.easy;
}
