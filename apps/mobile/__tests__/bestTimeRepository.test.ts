import {
  createMobileBestTimeRepository,
  getAllBestTimeValuesMs,
  getOverallBestTimeMs,
} from '../bestTimeRepository';

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test('첫 기록은 갱신으로 저장하고 같은 기록·느린 기록은 갱신하지 않는다', async () => {
  const storage = createStorage();
  const repository = createMobileBestTimeRepository({ storage });

  await expect(repository.recordBestTime('p1', 90_000)).resolves.toEqual({
    isNewBest: true,
    bestTimes: { p1: 90_000 },
  });
  await expect(repository.recordBestTime('p1', 90_000)).resolves.toEqual({
    isNewBest: false,
    bestTimes: { p1: 90_000 },
  });
  await expect(repository.recordBestTime('p1', 120_000)).resolves.toEqual({
    isNewBest: false,
    bestTimes: { p1: 90_000 },
  });
  await expect(repository.recordBestTime('p1', 60_000)).resolves.toEqual({
    isNewBest: true,
    bestTimes: { p1: 60_000 },
  });
  expect(JSON.parse(storage.values.get('crossword-puzzle:best-times') ?? '{}')).toEqual({
    p1: 60_000,
  });
});

test('손상된 JSON 과 유효하지 않은 값은 무시하고 빈 기록으로 복원한다', async () => {
  const broken = createMobileBestTimeRepository({
    storage: createStorage({ 'crossword-puzzle:best-times': '{not json' }),
  });
  await expect(broken.loadBestTimes()).resolves.toEqual({});

  const dirty = createMobileBestTimeRepository({
    storage: createStorage({
      'crossword-puzzle:best-times': JSON.stringify({
        ok: 45_000,
        zero: 0,
        negative: -1,
        text: 'nope',
      }),
    }),
  });
  await expect(dirty.loadBestTimes()).resolves.toEqual({ ok: 45_000 });
});

test('전체 최고 기록 값과 최단 기록을 계산한다', () => {
  expect(getAllBestTimeValuesMs({ a: 3000, b: 1000 })).toEqual([3000, 1000]);
  expect(getOverallBestTimeMs({ a: 3000, b: 1000 })).toBe(1000);
  expect(getOverallBestTimeMs({})).toBeNull();
});
