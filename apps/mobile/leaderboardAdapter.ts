import type {
  LeaderboardAdapter,
  LeaderboardContext,
} from '../../packages/crossword-core/src';
import NativeLeaderboard from './specs/NativeLeaderboard';

// React Native(Android/iOS) 리더보드 adapter. core의 LeaderboardAdapter 계약을
// Android Play Games Services / iOS GameKit TurboModule로 연결한다. 점수 산식과
// 제출 조건은 계속 core가 소유하고, 이 adapter는 네이티브 호출만 담당한다.

export type NativeLeaderboardModule = {
  isSupported(): boolean;
  isAuthenticated(): Promise<boolean>;
  submitScore(score: number): Promise<void>;
  openLeaderboard(): Promise<void>;
};

function normalizeScore(score: number): number {
  return Number.isFinite(score) && score > 0 ? Math.round(score) : 0;
}

export function createNativeLeaderboardAdapter(
  nativeModule: NativeLeaderboardModule | null,
): LeaderboardAdapter {
  return {
    get supported() {
      try {
        return nativeModule?.isSupported() === true;
      } catch {
        return false;
      }
    },

    async isAuthenticated() {
      if (nativeModule == null || !nativeModule.isSupported()) {
        throw Object.assign(new Error('Native leaderboard is not configured'), {
          code: 'leaderboard_not_configured',
        });
      }
      return nativeModule.isAuthenticated();
    },

    async submitScore(score: number, _context: LeaderboardContext) {
      if (nativeModule == null || !nativeModule.isSupported()) {
        throw new Error('Native leaderboard is not configured');
      }

      await nativeModule.submitScore(normalizeScore(score));
    },

    async openLeaderboard() {
      if (nativeModule == null || !nativeModule.isSupported()) {
        throw new Error('Native leaderboard is not configured');
      }

      await nativeModule.openLeaderboard();
    },
  };
}

export const leaderboardAdapter =
  createNativeLeaderboardAdapter(NativeLeaderboard);
