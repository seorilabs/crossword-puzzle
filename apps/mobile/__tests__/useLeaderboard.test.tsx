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
    isAuthenticated: jest.fn(() => Promise.resolve(true)),
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

test('순위 열기 실패 상태를 화면에 전달하고 제출 실패와 구분한다', async () => {
  const adapter = createAdapter({
    openLeaderboard: jest.fn(() => Promise.reject(new Error('unavailable'))),
  });
  let hookResult: HookResult | undefined;
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <HookHarness
          adapter={adapter}
          telemetry={createTelemetry()}
          onRender={result => {
            hookResult = result;
          }}
        />,
      );
    });
    expect(hookResult?.openFailed).toBe(false);
    await ReactTestRenderer.act(async () => {
      await expect(hookResult?.openLeaderboard()).resolves.toBe('failure');
    });
    expect(hookResult?.openFailed).toBe(true);
    expect(hookResult?.visible).toBe(false);
  } finally {
    ReactTestRenderer.act(() => renderer?.unmount());
  }
});

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

test('네이티브 자동 제출 실패를 원인 코드로 계측하고 CTA는 유지한다', async () => {
  const error = Object.assign(new Error('not configured'), {
    code: 'leaderboard_not_configured',
  });
  const adapter = createAdapter({
    submitScore: jest.fn(() => Promise.reject(error)),
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

  expect(hookResult?.visible).toBe(true);
  expect(telemetry.impression).toHaveBeenCalledWith(
    'leaderboard_score_submit',
    {
      puzzle_id: 'daily-easy',
      difficulty: 'easy',
      elapsed_seconds: 90,
      score: 1200,
      outcome: 'failure',
      error_code: 'leaderboard_not_configured',
    },
  );
});

test('미인증 자동 제출은 PGS 로그인 UI 없이 skipped로 계측한다', async () => {
  const adapter = createAdapter({
    isAuthenticated: jest.fn(() => Promise.resolve(false)),
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
      hookResult?.submitScore(1200, { puzzleId: 'daily-easy' }),
    ).resolves.toBe('skipped');
  });

  expect(adapter.submitScore).not.toHaveBeenCalled();
  expect(hookResult?.visible).toBe(true);
  expect(telemetry.impression).toHaveBeenCalledWith(
    'leaderboard_score_submit',
    expect.objectContaining({
      outcome: 'skipped',
      error_code: 'leaderboard_auth_required',
    }),
  );
});
