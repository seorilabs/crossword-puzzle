import { captureMobileLegacySaveSnapshot } from '../legacyMobileSaveInventory';

test('native host가 legacy AsyncStorage를 mutation 없이 전체 캡처한다', async () => {
  const values = new Map<string, string>([
    [
      'crossword-puzzle:progress:p1',
      JSON.stringify({
        cellValues: { '0:0': '가' },
        earnedHintCredits: 2,
        hintCount: 1,
        revealUsed: true,
        tentativeCells: ['0:0'],
      }),
    ],
    ['crossword:answer-input-mode', 'cell'],
    ['crossword:game-save:v2', 'new-save'],
    ['unrelated', 'secret'],
  ]);
  const operations: string[] = [];
  const snapshot = await captureMobileLegacySaveSnapshot({
    market: 'google-play',
    sourceVersion: 'current-main',
    capturedAt: '2026-07-18T00:00:00.000Z',
    storage: {
      async getAllKeys() {
        operations.push('getAllKeys');
        return [...values.keys()];
      },
      async getMany(keys) {
        operations.push(`getMany:${keys.join(',')}`);
        return Object.fromEntries(
          keys.map(key => [key, values.get(key) ?? null]),
        );
      },
    },
  });

  expect(snapshot.records.map(({ key }) => key)).toEqual([
    'crossword-puzzle:progress:p1',
    'crossword:answer-input-mode',
  ]);
  expect(JSON.parse(snapshot.records[0].rawValue)).toMatchObject({
    revealUsed: true,
    tentativeCells: ['0:0'],
  });
  expect(operations).toEqual([
    'getAllKeys',
    'getMany:crossword-puzzle:progress:p1,crossword:answer-input-mode',
  ]);
  expect(values.get('crossword-puzzle:progress:p1')).toContain('revealUsed');
});
