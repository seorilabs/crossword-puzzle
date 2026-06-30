import type { Difficulty } from "./difficultyProfiles";

// 리더보드 정책의 공유 계약(3마켓 공통). 점수 산식과 제출 가드는 core에 두고,
// 플랫폼 SDK(AIT 게임센터 / Google Play Games / Apple Game Center)는 앱 adapter에만
// 둔다. core에는 React / React Native / AppsInToss / Firebase SDK import를 넣지 않는다.
// 설계 근거: docs/leaderboard-strategy.md

/** 점수 산식 가중치. docs/leaderboard-strategy.md 의 후보 산식과 일치한다. */
export const LEADERBOARD_SCORE_WEIGHTS = {
  // 완료한 단어 1개당 점수
  completedWord: 1000,
  // 끝까지 남긴 도전(오답 여유) 1개당 점수
  remainingAttempt: 200,
  // 사용한 힌트 1개당 감점
  hint: 80,
  // 빠른 완료 보너스의 최댓값(0초 완료 시 부여). 데일리 퍼즐에서 전 단어를 맞힌
  // 완료자끼리의 동점을 풀이 시간으로 변별하기 위한 가산점이다.
  timeBonusBase: 600,
  // 풀이 1초당 보너스 감쇠량. timeBonusBase / timeDecayPerSecond 초가 지나면 0이 된다.
  timeDecayPerSecond: 1,
} as const;

export type LeaderboardScoreInput = {
  // 정답으로 채운 단어 수
  completedWordCount: number;
  // 완료 시점에 남아 있던 도전(오답 허용) 수
  remainingAttempts: number;
  // 사용한 힌트 수
  hintCount: number;
  // 일시정지를 제외한 순수 풀이 시간(초). 미제공 시 시간 보너스를 적용하지 않는다.
  elapsedSeconds?: number;
};

function toCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

/**
 * 빠른 완료 보너스를 계산한다. `max(0, base - elapsedSeconds * decay)`.
 *
 * - `elapsedSeconds` 미제공 시 0(하위호환: 기존 점수 유지).
 * - 음수/NaN 등 유효하지 않은 값은 보너스 0으로 처리한다(가짜 만점 보너스 방지).
 * - 보너스 항 자체가 음수가 되지 않도록 0으로 클램프한다.
 */
function computeTimeBonus(elapsedSeconds: number | undefined): number {
  if (elapsedSeconds === undefined) {
    return 0;
  }
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    return 0;
  }

  return Math.max(
    0,
    LEADERBOARD_SCORE_WEIGHTS.timeBonusBase -
      elapsedSeconds * LEADERBOARD_SCORE_WEIGHTS.timeDecayPerSecond,
  );
}

/**
 * 리더보드 제출 점수를 계산한다.
 *
 * `score = 완료 단어 수 * 1000 + 남은 도전 수 * 200 - 사용 힌트 수 * 80 + 빠른 완료 보너스`
 *
 * 빠른 완료 보너스는 `max(0, 600 - 풀이초 * 1)`로, `elapsedSeconds` 미제공 시 0이다.
 * 음수가 되면 0으로 클램프한다. 입력은 음수/NaN을 0으로 정규화한다.
 */
export function computeLeaderboardScore(input: LeaderboardScoreInput): number {
  const completedWordCount = toCount(input.completedWordCount);
  const remainingAttempts = toCount(input.remainingAttempts);
  const hintCount = toCount(input.hintCount);
  const timeBonus = computeTimeBonus(input.elapsedSeconds);

  const raw =
    completedWordCount * LEADERBOARD_SCORE_WEIGHTS.completedWord +
    remainingAttempts * LEADERBOARD_SCORE_WEIGHTS.remainingAttempt -
    hintCount * LEADERBOARD_SCORE_WEIGHTS.hint +
    timeBonus;

  return Math.max(0, raw);
}

/** 한 번의 점수 제출에 함께 보내는 맥락. 플랫폼 adapter가 참고한다. */
export type LeaderboardContext = {
  puzzleId: string;
  difficulty?: Difficulty | null;
  elapsedSeconds?: number;
};

/**
 * 플랫폼 리더보드 계약. AIT/Android/iOS adapter가 각각 구현한다.
 * `supported`가 false이면 공통 UI는 리더보드 진입점을 노출하지 않는다.
 */
export type LeaderboardAdapter = {
  // 현재 플랫폼/런타임이 리더보드를 지원하는지 여부(네이티브 모듈/게임 카테고리 등)
  supported: boolean;
  submitScore(score: number, context: LeaderboardContext): Promise<void>;
  openLeaderboard(): Promise<void>;
};

export type LeaderboardSubmissionState = {
  // 퍼즐을 끝까지 정답으로 완료했는지
  completed: boolean;
  // 정답 보기(reveal)를 사용했는지. 사용했다면 제출 대상에서 제외한다.
  revealUsed: boolean;
  // 같은 시도에서 이미 제출했는지(중복 제출 방지)
  alreadySubmitted: boolean;
};

/**
 * 점수를 제출해도 되는지 판정한다. 완료한 퍼즐만, 정답 보기를 쓰지 않은 경우에만,
 * 그리고 같은 시도에서 아직 제출하지 않았을 때만 1회 제출한다.
 */
export function shouldSubmitLeaderboardScore(
  state: LeaderboardSubmissionState,
): boolean {
  return state.completed && !state.revealUsed && !state.alreadySubmitted;
}
