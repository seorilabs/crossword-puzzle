// useStuckHintPrompt 회귀 테스트(#172).
// 막힘 힌트 타이머가 launchConfig(원격 조정) 임계·지연을 사용하고, 임계/활동 변경 시
// cleanup으로 이전 타이머를 취소한 뒤 새 지연으로 재스케줄하며(stale 타이머 발화 없음),
// 발화 시점에 최신 onShow(텔레메트리 페이로드)를 호출함을 고정한다.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStuckHintPrompt } from "./useStuckHintPrompt";

const baseConfig = {
  wrongCellThreshold: 2,
  idleMs: 20000,
  wrongIdleMs: 5000,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useStuckHintPrompt", () => {
  it("비활성(active=false)이면 타이머를 걸지 않고 노출되지 않는다", () => {
    const onShow = vi.fn();
    const { result } = renderHook(() =>
      useStuckHintPrompt({
        active: false,
        resetKeys: ["k"],
        wrongCellCount: 0,
        ...baseConfig,
        onShow,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(result.current.isVisible).toBe(false);
    expect(onShow).not.toHaveBeenCalled();
  });

  it("오답이 임계 미만이면 idle 지연(idleMs) 후 idle 트리거로 노출한다", () => {
    const onShow = vi.fn();
    const { result } = renderHook(() =>
      useStuckHintPrompt({
        active: true,
        resetKeys: ["k"],
        wrongCellCount: 1,
        ...baseConfig,
        onShow,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(19999);
    });
    expect(result.current.isVisible).toBe(false);
    expect(onShow).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isVisible).toBe(true);
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenCalledWith({ trigger: "idle", delayMs: 20000 });
  });

  it("오답이 임계 이상이면 더 짧은 지연(wrongIdleMs) 후 wrong_answer 트리거로 노출한다", () => {
    const onShow = vi.fn();
    const { result } = renderHook(() =>
      useStuckHintPrompt({
        active: true,
        resetKeys: ["k"],
        wrongCellCount: 2,
        ...baseConfig,
        onShow,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.isVisible).toBe(true);
    expect(onShow).toHaveBeenCalledWith({
      trigger: "wrong_answer",
      delayMs: 5000,
    });
  });

  it("대기 중 임계값(idleMs)이 원격 조정되면 이전 타이머를 취소하고 새 지연으로 재스케줄한다", () => {
    const onShow = vi.fn();
    const { result, rerender } = renderHook((props) => useStuckHintPrompt(props), {
      initialProps: {
        active: true,
        resetKeys: ["k"] as readonly unknown[],
        wrongCellCount: 0,
        wrongCellThreshold: 2,
        idleMs: 20000,
        wrongIdleMs: 5000,
        onShow,
      },
    });

    // 20000ms 타이머 대기 중 10000ms 경과
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.isVisible).toBe(false);

    // 원격 조정: idleMs 20000 → 8000. 이전 타이머는 취소되어 발화하지 않아야 한다.
    rerender({
      active: true,
      resetKeys: ["k"],
      wrongCellCount: 0,
      wrongCellThreshold: 2,
      idleMs: 8000,
      wrongIdleMs: 5000,
      onShow,
    });

    // 이전 임계(20000) 기준 잔여(10000ms)만큼 지나도 발화하면 안 된다(stale 타이머 없음).
    act(() => {
      vi.advanceTimersByTime(7999);
    });
    expect(result.current.isVisible).toBe(false);
    expect(onShow).not.toHaveBeenCalled();

    // 재스케줄된 새 지연(8000) 경과 시 비로소 발화한다.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isVisible).toBe(true);
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenCalledWith({ trigger: "idle", delayMs: 8000 });
  });

  it("활동(resetKeys) 변경 시 정체 타이머를 리셋한다", () => {
    const onShow = vi.fn();
    const { result, rerender } = renderHook((props) => useStuckHintPrompt(props), {
      initialProps: {
        active: true,
        resetKeys: ["a"] as readonly unknown[],
        wrongCellCount: 0,
        wrongCellThreshold: 2,
        idleMs: 20000,
        wrongIdleMs: 5000,
        onShow,
      },
    });

    act(() => {
      vi.advanceTimersByTime(19000);
    });
    // 활동 발생(resetKeys 변경) → 타이머 리셋
    rerender({
      active: true,
      resetKeys: ["b"],
      wrongCellCount: 0,
      wrongCellThreshold: 2,
      idleMs: 20000,
      wrongIdleMs: 5000,
      onShow,
    });
    // 리셋 전 잔여(1000ms)로는 발화하지 않는다.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.isVisible).toBe(false);
    // 리셋 후 전체 지연(20000)이 지나야 발화한다.
    act(() => {
      vi.advanceTimersByTime(19000);
    });
    expect(result.current.isVisible).toBe(true);
  });

  it("노출 페이로드(onShow)는 발화 시점의 최신 클로저를 호출한다(latestRef)", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook((props) => useStuckHintPrompt(props), {
      initialProps: {
        active: true,
        resetKeys: ["k"] as readonly unknown[],
        wrongCellCount: 0,
        wrongCellThreshold: 2,
        idleMs: 20000,
        wrongIdleMs: 5000,
        onShow: first,
      },
    });

    // onShow만 새 클로저로 갱신(임계/활동 불변) → 타이머는 재스케줄되지 않아야 한다.
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    rerender({
      active: true,
      resetKeys: ["k"],
      wrongCellCount: 0,
      wrongCellThreshold: 2,
      idleMs: 20000,
      wrongIdleMs: 5000,
      onShow: second,
    });

    // 최초 스케줄(20000) 기준으로 발화하되, 최신 onShow(second)가 호출되어야 한다.
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("hide()는 노출된 CTA를 즉시 숨긴다", () => {
    const onShow = vi.fn();
    const { result } = renderHook(() =>
      useStuckHintPrompt({
        active: true,
        resetKeys: ["k"],
        wrongCellCount: 0,
        ...baseConfig,
        onShow,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(result.current.isVisible).toBe(true);

    act(() => {
      result.current.hide();
    });
    expect(result.current.isVisible).toBe(false);
  });
});
