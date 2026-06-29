import {
  openGameCenterLeaderboard,
  submitGameCenterLeaderBoardScore,
} from "@apps-in-toss/web-framework";
import type { LeaderboardAdapter } from "../../packages/crossword-core/src/leaderboard";

// AppsInToss(토스 게임센터) 리더보드 adapter. core의 LeaderboardAdapter 계약을
// AIT WebView SDK로 구현한다. 점수 산식·제출 가드는 core(packages/crossword-core)에
// 두고, 여기서는 SDK 호출만 담당한다. 설계: docs/leaderboard-strategy.md

// 토스 게임센터 점수는 실수 형태의 "문자열"로 제출한다. 음수 방지를 위해 0 이상
// 정수로 정규화한 뒤 문자열로 변환한다.
function toScoreString(score: number): string {
  const normalized =
    Number.isFinite(score) && score > 0 ? Math.round(score) : 0;
  return String(normalized);
}

// 현재 런타임에서 게임센터 브리지를 사용할 수 있는지 확인한다. AIT WebView가 아닌
// 환경(로컬 브라우저 등)에서는 함수가 없거나 호출이 무의미하므로 false로 본다.
function isGameCenterSupported(): boolean {
  try {
    return (
      typeof submitGameCenterLeaderBoardScore === "function" &&
      typeof openGameCenterLeaderboard === "function"
    );
  } catch {
    return false;
  }
}

export const leaderboardAdapter: LeaderboardAdapter = {
  supported: isGameCenterSupported(),

  // context(puzzleId/난이도)는 토스 게임센터 제출 API가 받지 않으므로 사용하지
  // 않는다. core 계약(submitScore(score, context))과는 구조적으로 호환된다.
  async submitScore(score: number) {
    if (!isGameCenterSupported()) {
      return;
    }

    try {
      // 앱 버전이 낮으면 undefined를 반환하고, 미승인 시 statusCode로 사유가 온다.
      // 어떤 실패도 결과 화면 흐름을 막지 않도록 조용히 무시한다.
      await submitGameCenterLeaderBoardScore({ score: toScoreString(score) });
    } catch {
      // 리더보드 제출 실패가 퍼즐 완료 경험을 깨뜨리지 않게 한다.
    }
  },

  async openLeaderboard() {
    if (!isGameCenterSupported()) {
      return;
    }

    try {
      await openGameCenterLeaderboard();
    } catch {
      // 리더보드 웹뷰 호출 실패는 무시한다.
    }
  },
};
