import { createMobileDailyHintWalletRepository } from '../dailyHintWalletRepository';

function createStorage() {
  const values = new Map<string, string>();

  return {
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test('날짜별 공용 힌트 지갑을 AsyncStorage에서 복원한다', async () => {
  const storage = createStorage();
  const repository = createMobileDailyHintWalletRepository({ storage });

  await repository.saveWallet({
    date: '2026-07-26',
    earnedCredits: 1,
    usedCredits: 2,
  });

  await expect(repository.loadWallet('2026-07-26')).resolves.toEqual({
    date: '2026-07-26',
    earnedCredits: 1,
    usedCredits: 2,
  });
  await expect(repository.loadWallet('2026-07-27')).resolves.toBeNull();
});
