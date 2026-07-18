import type { Puzzle } from "../../packages/crossword-core/src";

// 신규 사용자 첫 진입용 입문(easy) 티어 퍼즐. 매일 회전하는 일반 퍼즐 팩과
// 무관하게 항상 번들에 포함되어 제공되므로(원격 팩 사용 여부와 무관) 날짜 기반
// 선택이 아니라 신규 여부로 라우팅한다. 5×5 그리드 · 6단어 · 쉬운 일상 단어로
// 첫 성공(활성화) 도달 비용을 낮춘다. difficulty="easy"는 mission_start /
// attempt_start 텔레메트리로 그대로 흘러 입문 티어를 구분 측정할 수 있다.
export const ONBOARDING_PUZZLE_ID = "onboarding-easy-01";

export const onboardingPuzzle: Puzzle = {
  alias: "입문",
  puzzleId: ONBOARDING_PUZZLE_ID,
  date: "2026-01-01",
  difficulty: "easy",
  gridSize: 5,
  grid: [
    ["토", "끼", "", "", ""],
    ["마", "", "", "", ""],
    ["토", "요", "일", "", ""],
    ["", "", "기", "차", ""],
    ["", "", "", "표", ""],
  ],
  entries: [
    {
      id: "a1",
      answer: "토끼",
      clue: "귀가 길고 깡충깡충 뛰는 동물",
      direction: "across",
      row: 0,
      col: 0,
      generatedBy: "placed",
    },
    {
      id: "a2",
      answer: "토요일",
      clue: "한 주의 여섯째 날로, 주말이 시작되는 날",
      direction: "across",
      row: 2,
      col: 0,
      generatedBy: "placed",
    },
    {
      id: "a3",
      answer: "기차",
      clue: "철길 위를 달리는 긴 탈것",
      direction: "across",
      row: 3,
      col: 2,
      generatedBy: "placed",
    },
    {
      id: "d1",
      answer: "토마토",
      clue: "빨갛고 둥근, 샐러드에 넣는 채소",
      direction: "down",
      row: 0,
      col: 0,
      generatedBy: "placed",
    },
    {
      id: "d2",
      answer: "일기",
      clue: "하루 동안 있었던 일을 적는 글",
      direction: "down",
      row: 2,
      col: 2,
      generatedBy: "placed",
    },
    {
      id: "d3",
      answer: "차표",
      clue: "대중교통을 탈 때 돈을 내고 받는 표",
      direction: "down",
      row: 3,
      col: 3,
      generatedBy: "placed",
    },
  ],
  metrics: {
    autoRunCount: 0,
    bboxDensity: 0.45,
    crossCells: 5,
    crossRatio: 0.556,
    filledCells: 9,
    multiCrossEntries: 4,
    placedWordCount: 6,
    wordCount: 6,
  },
};

/**
 * 첫 보드에서 교차 입력을 배운 뒤, 같은 5x5 규칙으로 답 길이와 교차 수를
 * 조금씩 바꾸는 실제 ko-KR 두 번째 보드다. 모든 단서와 답은 저장소가 직접
 * 소유하는 손작성 콘텐츠다.
 */
export const onboardingPuzzleTwo: Puzzle = {
  alias: "입문 2",
  puzzleId: "onboarding-easy-02",
  date: "2026-01-02",
  difficulty: "easy",
  gridSize: 5,
  grid: [
    ["운", "동", "화", "", ""],
    ["전", "시", "", "", ""],
    ["", "", "", "", ""],
    ["", "", "", "", ""],
    ["", "", "", "", ""],
  ],
  entries: [
    {
      id: "a1",
      answer: "운동화",
      clue: "걷거나 달릴 때 편하게 신는 신발",
      direction: "across",
      row: 0,
      col: 0,
      generatedBy: "placed",
    },
    {
      id: "d1",
      answer: "운전",
      clue: "자동차를 움직여 길을 가는 일",
      direction: "down",
      row: 0,
      col: 0,
      generatedBy: "placed",
    },
    {
      id: "a2",
      answer: "전시",
      clue: "그림이나 물건을 한곳에 펼쳐 보여 주는 일",
      direction: "across",
      row: 1,
      col: 0,
      generatedBy: "placed",
    },
    {
      id: "d2",
      answer: "동시",
      clue: "두 가지 일이 같은 순간에 함께 일어남",
      direction: "down",
      row: 0,
      col: 1,
      generatedBy: "placed",
    },
  ],
  metrics: {
    autoRunCount: 0,
    bboxDensity: 0.83,
    crossCells: 2,
    crossRatio: 0.5,
    filledCells: 5,
    multiCrossEntries: 2,
    placedWordCount: 4,
    wordCount: 4,
  },
};

/** 세 번째 보드는 앞선 두 보드와 답이 겹치지 않는 생활 어휘로 여정을 마친다. */
export const onboardingPuzzleThree: Puzzle = {
  alias: "입문 3",
  puzzleId: "onboarding-easy-03",
  date: "2026-01-03",
  difficulty: "easy",
  gridSize: 5,
  grid: [
    ["자", "동", "차", "", ""],
    ["연", "기", "", "", ""],
    ["", "", "", "", ""],
    ["", "", "", "", ""],
    ["", "", "", "", ""],
  ],
  entries: [
    {
      id: "a1",
      answer: "자동차",
      clue: "엔진의 힘으로 바퀴를 굴려 도로를 달리는 차",
      direction: "across",
      row: 0,
      col: 0,
      generatedBy: "placed",
    },
    {
      id: "d1",
      answer: "자연",
      clue: "사람의 힘을 보태지 않아도 저절로 이루어진 것",
      direction: "down",
      row: 0,
      col: 0,
      generatedBy: "placed",
    },
    {
      id: "a2",
      answer: "연기",
      clue: "불이 탈 때 생겨 공중으로 퍼지는 흐린 기체",
      direction: "across",
      row: 1,
      col: 0,
      generatedBy: "placed",
    },
    {
      id: "d2",
      answer: "동기",
      clue: "어떤 일을 시작하거나 계속하게 만드는 까닭",
      direction: "down",
      row: 0,
      col: 1,
      generatedBy: "placed",
    },
  ],
  metrics: {
    autoRunCount: 0,
    bboxDensity: 0.833,
    crossCells: 2,
    crossRatio: 0.5,
    filledCells: 5,
    multiCrossEntries: 2,
    placedWordCount: 4,
    wordCount: 4,
  },
};

export const firstRunPuzzles = Object.freeze([
  onboardingPuzzle,
  onboardingPuzzleTwo,
  onboardingPuzzleThree,
]);
