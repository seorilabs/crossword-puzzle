import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  LeaderboardAdapter,
  TelemetryClient,
} from "../packages/crossword-core/src";
import { useLeaderboard } from "./useLeaderboard";

function createTelemetry() {
  return {
    impression: vi.fn(),
  } satisfies Pick<TelemetryClient, "impression">;
}

function createAdapter(
  overrides: Partial<LeaderboardAdapter> = {},
): LeaderboardAdapter {
  return {
    supported: true,
    submitScore: vi.fn(() => Promise.resolve()),
    openLeaderboard: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe("useLeaderboard 리더보드 개방 폴백 (#325)", () => {
  it("AC-2: adapter가 미지원이면 순위 UI를 숨기고 기존 결과 흐름을 유지한다", async () => {
    const adapter = createAdapter({ supported: false });
    const telemetry = createTelemetry();
    const { result } = renderHook(() =>
      useLeaderboard({ enabled: true, adapter, telemetry }),
    );

    expect(result.current.visible).toBe(false);
    await expect(
      result.current.submitScore(1200, { puzzleId: "daily-easy" }),
    ).resolves.toBe("unsupported");
    expect(adapter.submitScore).not.toHaveBeenCalled();
    expect(telemetry.impression).not.toHaveBeenCalled();
  });

  it("AC-2·3: 제출 실패를 삼키고 failure로 계측한 뒤 순위 UI만 숨긴다", async () => {
    const adapter = createAdapter({
      submitScore: vi.fn(() =>
        Promise.reject(new Error("LeaderBoard not found")),
      ),
    });
    const telemetry = createTelemetry();
    const { result } = renderHook(() =>
      useLeaderboard({ enabled: true, adapter, telemetry }),
    );

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.submitScore(1200, {
        puzzleId: "daily-easy",
        difficulty: "easy",
        elapsedSeconds: 90,
      });
    });

    expect(outcome).toBe("failure");
    expect(result.current.visible).toBe(false);
    expect(telemetry.impression).toHaveBeenCalledWith(
      "leaderboard_score_submit",
      {
        puzzle_id: "daily-easy",
        difficulty: "easy",
        elapsed_seconds: 90,
        score: 1200,
        outcome: "failure",
      },
    );
  });

  it("AC-2: 순위 조회 실패도 결과 화면을 깨뜨리지 않고 CTA만 숨긴다", async () => {
    const adapter = createAdapter({
      openLeaderboard: vi.fn(() =>
        Promise.reject(new Error("game center unavailable")),
      ),
    });
    const telemetry = createTelemetry();
    const { result } = renderHook(() =>
      useLeaderboard({ enabled: true, adapter, telemetry }),
    );

    await act(async () => {
      await expect(result.current.openLeaderboard()).resolves.toBe("failure");
    });
    expect(result.current.visible).toBe(false);
  });

  it("AC-3: 제출 성공은 success로 계측하고 순위 UI를 유지한다", async () => {
    const adapter = createAdapter();
    const telemetry = createTelemetry();
    const { result } = renderHook(() =>
      useLeaderboard({ enabled: true, adapter, telemetry }),
    );

    await act(async () => {
      await expect(
        result.current.submitScore(1200, { puzzleId: "daily-easy" }),
      ).resolves.toBe("success");
    });
    expect(result.current.visible).toBe(true);
    expect(telemetry.impression).toHaveBeenCalledWith(
      "leaderboard_score_submit",
      expect.objectContaining({ outcome: "success" }),
    );
  });
});
