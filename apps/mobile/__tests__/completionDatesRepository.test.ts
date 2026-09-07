import { createMobileCompletionDatesRepository } from '../completionDatesRepository';

function createStorage(initial: Record<string, string> = {}, failKeys = false) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async getAllKeys() {
      if (failKeys) {
        throw new Error('getAllKeys unavailable');
      }
      return [...values.keys()];
    },
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async multiGet(keys: readonly string[]) {
      return keys.map(key => [key, values.get(key) ?? null] as const);
    },
    async setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

const archiveRecords = [
  { completedAt: '2026-06-10T10:00:00Z', puzzle: { date: '2026-06-10' } },
  { completedAt: undefined, puzzle: { date: '2026-06-11' } },
  { completedAt: 'invalid', puzzle: { date: '2026-06-12' } },
];

test('완료일을 중복 없이 정렬해 누적한다', async () => {
  const repository = createMobileCompletionDatesRepository({
    storage: createStorage(),
  });
  await expect(repository.addCompletionDate('2026-06-11')).resolves.toEqual([
    '2026-06-11',
  ]);
  await expect(repository.addCompletionDate('2026-06-09')).resolves.toEqual([
    '2026-06-09',
    '2026-06-11',
  ]);
  await expect(repository.addCompletionDate('2026-06-11')).resolves.toEqual([
    '2026-06-09',
    '2026-06-11',
  ]);
  await expect(repository.loadCompletionDates()).resolves.toEqual([
    '2026-06-09',
    '2026-06-11',
  ]);
});

test('구버전 archive와 mission 키에서 완료일을 1회 백필한다', async () => {
  const storage = createStorage({
    'crossword-puzzle:mission:2026-06-01:p1': JSON.stringify({
      completedAt: '2026-06-01T10:00:00Z',
    }),
    'crossword-puzzle:mission:2026-06-02:p2': JSON.stringify({
      attemptsUsed: 1,
    }),
    'crossword-puzzle:mission:2026-06-03:p3': '{broken',
    'crossword-puzzle:progress:p1': JSON.stringify({}),
  });
  const repository = createMobileCompletionDatesRepository({ storage });

  await expect(
    repository.migrateCompletionDatesIfNeeded({ archiveRecords }),
  ).resolves.toEqual(['2026-06-01', '2026-06-10']);
  expect(storage.values.get('crossword-puzzle:completion-dates:migrated')).toBe(
    '1',
  );

  // 마커가 있으면 다시 스캔하지 않는다(새 mission 키가 생겨도 반영 안 됨).
  storage.values.set(
    'crossword-puzzle:mission:2026-06-05:p5',
    JSON.stringify({ completedAt: '2026-06-05T10:00:00Z' }),
  );
  await expect(
    repository.migrateCompletionDatesIfNeeded({ archiveRecords }),
  ).resolves.toEqual(['2026-06-01', '2026-06-10']);
});

test('getAllKeys 를 못 쓰면 archive 완료일만으로 백필한다', async () => {
  const repository = createMobileCompletionDatesRepository({
    storage: createStorage({}, true),
  });
  await expect(
    repository.migrateCompletionDatesIfNeeded({ archiveRecords }),
  ).resolves.toEqual(['2026-06-10']);
});

test('손상된 저장값은 빈 목록으로 복원한다', async () => {
  const repository = createMobileCompletionDatesRepository({
    storage: createStorage({
      'crossword-puzzle:completion-dates': '{not an array',
    }),
  });
  await expect(repository.loadCompletionDates()).resolves.toEqual([]);
});
