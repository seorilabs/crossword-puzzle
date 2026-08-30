import {
  createNativeLeaderboardAdapter,
  leaderboardAdapter,
  type NativeLeaderboardModule,
} from '../leaderboardAdapter';

test('네이티브 리더보드 모듈이 없으면 supported=false 로 숨긴다', () => {
  expect(leaderboardAdapter.supported).toBe(false);
});

test('미지원 환경에서 직접 호출되면 명시적으로 실패한다', async () => {
  const adapter = createNativeLeaderboardAdapter(null);

  await expect(
    adapter.submitScore(1000, { puzzleId: 'puzzle-1' }),
  ).rejects.toThrow('not configured');
  await expect(adapter.openLeaderboard()).rejects.toThrow('not configured');
});

test('지원 모듈에 정규화한 점수를 제출하고 리더보드를 연다', async () => {
  const nativeModule: jest.Mocked<NativeLeaderboardModule> = {
    isSupported: jest.fn(() => true),
    isAuthenticated: jest.fn(() => Promise.resolve(true)),
    openLeaderboard: jest.fn(() => Promise.resolve()),
    submitScore: jest.fn((_score: number) => Promise.resolve()),
  };
  const adapter = createNativeLeaderboardAdapter(nativeModule);

  expect(adapter.supported).toBe(true);
  await expect(adapter.isAuthenticated?.()).resolves.toBe(true);
  await adapter.submitScore(1234.6, { puzzleId: 'puzzle-1' });
  await adapter.openLeaderboard();

  expect(nativeModule.submitScore).toHaveBeenCalledWith(1235);
  expect(nativeModule.isAuthenticated).toHaveBeenCalledTimes(1);
  expect(nativeModule.openLeaderboard).toHaveBeenCalledTimes(1);
});

test('네이티브 지원 판정 오류는 unsupported로 격리한다', () => {
  const nativeModule: NativeLeaderboardModule = {
    isSupported() {
      throw new Error('bridge unavailable');
    },
    isAuthenticated: jest.fn(() => Promise.resolve(false)),
    openLeaderboard: jest.fn(() => Promise.resolve()),
    submitScore: jest.fn(() => Promise.resolve()),
  };

  expect(createNativeLeaderboardAdapter(nativeModule).supported).toBe(false);
});
