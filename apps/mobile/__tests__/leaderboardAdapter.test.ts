import { leaderboardAdapter } from '../leaderboardAdapter';

test('네이티브 리더보드 모듈이 없으면 supported=false 로 노출한다', () => {
  expect(leaderboardAdapter.supported).toBe(false);
});

test('미지원 환경에서 점수 제출/리더보드 열기는 조용히 no-op 으로 끝난다', async () => {
  await expect(
    leaderboardAdapter.submitScore(1000, { puzzleId: 'puzzle-1' }),
  ).resolves.toBeUndefined();
  await expect(leaderboardAdapter.openLeaderboard()).resolves.toBeUndefined();
});
