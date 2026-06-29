import * as appsInTossFramework from "@apps-in-toss/web-framework";
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

type GameCenterBridge = {
  submit: (params: { score: string }) => Promise<unknown>;
  open: () => Promise<void>;
};

// 게임센터 브리지를 접근 시점에 다시 해석한다. 네임스페이스 import로 접근해, 일부
// 환경에서 게임센터 함수가 export되지 않아도 import 단계에서 throw하지 않는다.
// 또한 supported를 모듈 평가 시점에 고정하지 않고 호출/렌더 시점마다 재판정해
// 런타임 환경 변화(브리지 주입 시점 차이)에 대응한다.
function getGameCenterBridge(): GameCenterBridge | null {
  try {
    const framework = appsInTossFramework as Partial<
      typeof appsInTossFramework
    >;
    const submit = framework.submitGameCenterLeaderBoardScore;
    const open = framework.openGameCenterLeaderboard;
    if (typeof submit === "function" && typeof open === "function") {
      return { submit, open };
    }
  } catch {
    // 브리지 접근 자체가 실패하면 미지원으로 본다.
  }
  return null;
}

export const leaderboardAdapter: LeaderboardAdapter = {
  // 모듈 평가 시점이 아니라 접근 시점에 게임센터 지원 여부를 다시 판정한다.
  get supported(): boolean {
    return getGameCenterBridge() != null;
  },

  // context(puzzleId/난이도)는 토스 게임센터 제출 API가 받지 않으므로 사용하지
  // 않는다. core 계약(submitScore(score, context))과는 구조적으로 호환된다.
  async submitScore(score: number) {
    const bridge = getGameCenterBridge();
    if (bridge == null) {
      return;
    }

    try {
      // 앱 버전이 낮으면 undefined를 반환하고, 미승인 시 statusCode로 사유가 온다.
      // 어떤 실패도 결과 화면 흐름을 막지 않도록 조용히 무시한다.
      await bridge.submit({ score: toScoreString(score) });
    } catch {
      // 리더보드 제출 실패가 퍼즐 완료 경험을 깨뜨리지 않게 한다.
    }
  },

  async openLeaderboard() {
    const bridge = getGameCenterBridge();
    if (bridge == null) {
      return;
    }

    try {
      await bridge.open();
    } catch {
      // 리더보드 웹뷰 호출 실패는 무시한다.
    }
  },
};
