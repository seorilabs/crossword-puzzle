import type {
  LeaderboardAdapter,
  LeaderboardContext,
} from '../../packages/crossword-core/src';

// React Native(Android/iOS) 리더보드 adapter. core의 LeaderboardAdapter 계약을
// 구현하지만, 현재 모바일 앱에는 Google Play Games Services / Apple Game Center
// 네이티브 모듈이 통합돼 있지 않다. 따라서 supported=false 로 보고 점수 제출과
// 리더보드 열기는 no-op 으로 둔다. 공통 UI는 supported=false 이면 리더보드 진입점을
// 노출하지 않으므로, AIT(웹) 우선 출시 정책(docs/leaderboard-strategy.md)과
// 3마켓 패리티(미지원 시장은 동일하게 숨김)를 유지한다. 네이티브 모듈을 붙이면
// 이 파일만 교체해 지원하도록 확장한다.

export const leaderboardAdapter: LeaderboardAdapter = {
  supported: false,

  async submitScore(_score: number, _context: LeaderboardContext) {
    // 네이티브 리더보드 모듈 미통합. 지원 전까지는 제출하지 않는다.
  },

  async openLeaderboard() {
    // 네이티브 리더보드 모듈 미통합. 지원 전까지는 열지 않는다.
  },
};
