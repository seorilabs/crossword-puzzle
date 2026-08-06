import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import type {
  LeaderboardAdapter,
  TelemetryClient,
} from '../../../packages/crossword-core/src';
import { useLeaderboard } from '../useLeaderboard';

type HookResult = ReturnType<typeof useLeaderboard>;

function createAdapter(
  overrides: Partial<LeaderboardAdapter> = {},
): LeaderboardAdapter {
  return {
    supported: true,
    submitScore: jest.fn(() => Promise.resolve()),
    openLeaderboard: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function createTelemetry() {
  return {
    impression: jest.fn(),
  } satisfies Pick<TelemetryClient, 'impression'>;
}

function HookHarness({
  adapter,
  telemetry,
  onRender,
}: {
  adapter: LeaderboardAdapter;
  telemetry: Pick<TelemetryClient, 'impression'>;
  onRender(result: HookResult): void;
}) {
  onRender(useLeaderboard({ enabled: true, adapter, telemetry }));
  return null;
}

test('네이티브 미지원이면 순위 UI와 제출을 비활성화한다', async () => {
  const adapter = createAdapter({ supported: false });
  const telemetry = createTelemetry();
  let hookResult: HookResult | undefined;

  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(
      <HookHarness
        adapter={adapter}
        telemetry={telemetry}
        onRender={result => {
          hookResult = result;
        }}
      />,
    );
  });

  expect(hookResult?.visible).toBe(false);
  await expect(
    hookResult?.submitScore(1200, { puzzleId: 'daily-easy' }),
  ).resolves.toBe('unsupported');
  expect(adapter.submitScore).not.toHaveBeenCalled();
  expect(telemetry.impression).not.toHaveBeenCalled();
});

test('네이티브 제출 실패를 계측하고 현재 세션 CTA만 숨긴다', async () => {
  const adapter = createAdapter({
    submitScore: jest.fn(() => Promise.reject(new Error('not configured'))),
  });
  const telemetry = createTelemetry();
  let hookResult: HookResult | undefined;

  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(
      <HookHarness
        adapter={adapter}
        telemetry={telemetry}
        onRender={result => {
          hookResult = result;
        }}
      />,
    );
  });

  await ReactTestRenderer.act(async () => {
    await expect(
      hookResult?.submitScore(1200, {
        puzzleId: 'daily-easy',
        difficulty: 'easy',
        elapsedSeconds: 90,
      }),
    ).resolves.toBe('failure');
  });

  expect(hookResult?.visible).toBe(false);
  expect(telemetry.impression).toHaveBeenCalledWith(
    'leaderboard_score_submit',
    {
      puzzle_id: 'daily-easy',
      difficulty: 'easy',
      elapsed_seconds: 90,
      score: 1200,
      outcome: 'failure',
    },
  );
});
