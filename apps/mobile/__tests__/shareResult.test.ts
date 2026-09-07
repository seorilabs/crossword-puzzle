import { Share } from 'react-native';

import {
  buildShareGrid,
  buildShareText,
  type Puzzle,
} from '../../../packages/crossword-core/src';
import { buildMobileShareText, shareResultText } from '../shareResult';

const puzzle: Puzzle = {
  puzzleId: 'p1',
  date: '2026-09-08',
  difficulty: 'easy',
  gridSize: 2,
  grid: [
    ['가', '나'],
    ['', '다'],
  ],
  entries: [
    {
      id: 'a1',
      answer: '가나',
      clue: '첫 줄',
      direction: 'across',
      row: 0,
      col: 0,
      generatedBy: 'placed',
    },
  ],
  metrics: {
    autoRunCount: 0,
    bboxDensity: 0.75,
    crossCells: 1,
    crossRatio: 0.5,
    filledCells: 3,
    multiCrossEntries: 0,
    placedWordCount: 1,
    wordCount: 1,
  },
};

function createTelemetry() {
  return { click: jest.fn(), impression: jest.fn() };
}

test('공유 텍스트는 core buildShareText 와 이모지 격자를 그대로 쓴다', () => {
  const cellValues = { '0:0': '가', '0:1': '나', '1:1': '다' };
  const text = buildMobileShareText({
    puzzle,
    cellValues,
    puzzleLabel: '#p1',
    elapsedLabel: '1분 2초',
    hintCount: 0,
    attemptsUsed: 1,
    completedCount: 1,
    totalCount: 1,
    consecutiveStreak: 3,
    isComplete: true,
    revealUsed: false,
  });
  expect(text).toBe(
    buildShareText({
      puzzleLabel: '#p1',
      elapsedLabel: '1분 2초',
      hintCount: 0,
      attemptsUsed: 1,
      completedCount: 1,
      totalCount: 1,
      consecutiveStreak: 3,
      isComplete: true,
      revealUsed: false,
      shareGrid: buildShareGrid(puzzle, cellValues),
      shareLandingUrl: undefined,
    }),
  );
  expect(text).toContain(buildShareGrid(puzzle, cellValues));
});

test('클릭 계측 후 공유 시트를 열고 결과를 surface 와 함께 계측한다', async () => {
  const telemetry = createTelemetry();
  const share = jest.fn(async () => ({ action: Share.sharedAction }));

  await expect(
    shareResultText(
      {
        text: 'hello',
        surface: 'completion_dialog',
        clickParams: { puzzleId: 'p1', difficulty: 'easy' },
      },
      { share, telemetry },
    ),
  ).resolves.toBe('shared');

  expect(telemetry.click).toHaveBeenCalledWith('share_result_click', {
    surface: 'completion_dialog',
    puzzle_id: 'p1',
    difficulty: 'easy',
  });
  expect(share).toHaveBeenCalledWith({ message: 'hello' });
  expect(telemetry.impression).toHaveBeenCalledWith('share_result_outcome', {
    surface: 'completion_dialog',
    outcome: 'shared',
  });
});

test('시트를 닫으면 aborted, 예외는 failed 로 축약하고 throw 하지 않는다', async () => {
  const telemetry = createTelemetry();
  await expect(
    shareResultText(
      { text: 'x', surface: 'result_screen' },
      {
        share: jest.fn(async () => ({ action: Share.dismissedAction })),
        telemetry,
      },
    ),
  ).resolves.toBe('aborted');

  await expect(
    shareResultText(
      { text: 'x', surface: 'result_screen' },
      {
        share: jest.fn(async () => {
          throw new Error('no sheet');
        }),
        telemetry,
      },
    ),
  ).resolves.toBe('failed');
  expect(telemetry.impression).toHaveBeenLastCalledWith('share_result_outcome', {
    surface: 'result_screen',
    outcome: 'failed',
  });
});
