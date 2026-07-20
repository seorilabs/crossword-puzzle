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
      clue: "일요일 바로 전날, 주말의 시작",
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
      clue: "버스나 기차를 탈 때 내는 표",
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
