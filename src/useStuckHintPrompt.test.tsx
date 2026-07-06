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
    expect(onShow).toHaveBeenCalledWith({
      trigger: "idle",
      delayMs: 20000,
      promptSeq: 1,
      dismissCount: 0,
    });
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
      promptSeq: 1,
      dismissCount: 0,
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
    expect(onShow).toHaveBeenCalledWith({
      trigger: "idle",
      delayMs: 8000,
      promptSeq: 1,
      dismissCount: 0,
    });
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

  it("입력 없이 선택만 바뀌면(resetKeys 불변) 정체 타이머가 리셋되지 않아 idle에 노출된다", () => {
    // #184: 막힌 사용자가 정답 입력 없이 이 칸 저 칸(단어 선택)만 바꾸는 상황.
    // 선택 이동은 resetKeys(실제 입력)에 포함되지 않으므로, 재렌더가 여러 번 나도
    // 정체 타이머는 최초 스케줄대로 진행해 idleMs에 발화해야 한다.
    const onShow = vi.fn();
    const stableInput = { cellValues: {} };
    const props = {
      active: true,
      resetKeys: [stableInput] as readonly unknown[],
      wrongCellCount: 0,
      wrongCellThreshold: 2,
      idleMs: 20000,
      wrongIdleMs: 5000,
      onShow,
    };
    const { result, rerender } = renderHook((p) => useStuckHintPrompt(p), {
      initialProps: props,
    });

    // 선택 이동을 흉내낸 재렌더(입력 resetKeys는 동일 참조 유지).
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    rerender({ ...props });
    act(() => {
      vi.advanceTimersByTime(9999);
    });
    rerender({ ...props });
    expect(result.current.isVisible).toBe(false);
    expect(onShow).not.toHaveBeenCalled();

    // 최초 스케줄(20000) 완료 시 발화. 선택 변경 재렌더는 타이머를 늦추지 못한다.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isVisible).toBe(true);
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenCalledWith({
      trigger: "idle",
      delayMs: 20000,
      promptSeq: 1,
      dismissCount: 0,
    });
  });

  it("실제 입력(resetKeys 변경)은 정체 타이머를 리셋한다", () => {
    // 대비군: cellValues 참조가 바뀌면(실제 입력) 정체 타이머가 리셋되어야 한다.
    const onShow = vi.fn();
    const makeProps = (cellValues: object) => ({
      active: true,
      resetKeys: [cellValues] as readonly unknown[],
      wrongCellCount: 0,
      wrongCellThreshold: 2,
      idleMs: 20000,
      wrongIdleMs: 5000,
      onShow,
    });
    const { result, rerender } = renderHook((p) => useStuckHintPrompt(p), {
      initialProps: makeProps({ a: "1" }),
    });

    act(() => {
      vi.advanceTimersByTime(19000);
    });
    // 입력 발생: 새 cellValues 참조 → 타이머 리셋
    rerender(makeProps({ a: "1", b: "2" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.isVisible).toBe(false);
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

  // #254: dismiss 폭주 방어(노출 상한·닫기 상한·백오프·attempt 리셋).
  const capProps = (
    overrides: Partial<Parameters<typeof useStuckHintPrompt>[0]> = {},
  ) => ({
    active: true,
    resetKeys: ["k"] as readonly unknown[],
    wrongCellCount: 0,
    wrongCellThreshold: 2,
    idleMs: 20000,
    wrongIdleMs: 5000,
    attemptKey: 1,
    maxPromptsPerAttempt: 0,
    maxDismissals: 0,
    dismissBackoffFactor: 1,
    onShow: vi.fn(),
    ...overrides,
  });

  it("attempt 당 노출 상한을 넘으면 더 노출하지 않는다(#254)", () => {
    const onShow = vi.fn();
    const makeProps = (key: string) =>
      capProps({ resetKeys: [key], maxPromptsPerAttempt: 2, onShow });
    const { result, rerender } = renderHook((p) => useStuckHintPrompt(p), {
      initialProps: makeProps("a"),
    });

    act(() => vi.advanceTimersByTime(20000));
    expect(result.current.isVisible).toBe(true); // 1회차
    // 활동 → 재스케줄 → 2회차
    rerender(makeProps("b"));
    act(() => vi.advanceTimersByTime(20000));
    expect(result.current.isVisible).toBe(true);
    expect(onShow).toHaveBeenCalledTimes(2);
    expect(onShow.mock.calls[1][0]).toMatchObject({ promptSeq: 2 });
    // 활동 → 상한(2) 도달로 미노출
    rerender(makeProps("c"));
    act(() => vi.advanceTimersByTime(60000));
    expect(result.current.isVisible).toBe(false);
    expect(onShow).toHaveBeenCalledTimes(2);
  });

  it("닫으면 다음 노출 지연이 백오프로 증가한다(#254)", () => {
    const onShow = vi.fn();
    const { result } = renderHook(() =>
      useStuckHintPrompt(capProps({ dismissBackoffFactor: 2, onShow })),
    );

    act(() => vi.advanceTimersByTime(20000));
    expect(result.current.isVisible).toBe(true);
    expect(onShow.mock.calls[0][0]).toMatchObject({
      delayMs: 20000,
      promptSeq: 1,
      dismissCount: 0,
    });

    // 닫기 → dismissCount=1 → 다음 지연 20000×2=40000
    act(() => result.current.dismiss());
    expect(result.current.isVisible).toBe(false);
    act(() => vi.advanceTimersByTime(39999));
    expect(result.current.isVisible).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.isVisible).toBe(true);
    expect(onShow.mock.calls[1][0]).toMatchObject({
      delayMs: 40000,
      promptSeq: 2,
      dismissCount: 1,
    });
  });

  it("닫기 상한에 도달하면 그 attempt 에서 더 노출하지 않는다(#254)", () => {
    const onShow = vi.fn();
    const { result } = renderHook(() =>
      useStuckHintPrompt(capProps({ maxDismissals: 2, onShow })),
    );

    act(() => vi.advanceTimersByTime(20000));
    expect(result.current.isVisible).toBe(true);
    act(() => result.current.dismiss()); // 1회 닫기
    act(() => vi.advanceTimersByTime(20000));
    expect(result.current.isVisible).toBe(true); // 재노출
    act(() => result.current.dismiss()); // 2회 닫기 → 상한 도달
    act(() => vi.advanceTimersByTime(60000));
    expect(result.current.isVisible).toBe(false);
    expect(onShow).toHaveBeenCalledTimes(2);
  });

  it("attemptKey 가 바뀌면 노출/닫기 카운터가 리셋된다(#254)", () => {
    const onShow = vi.fn();
    const makeProps = (attemptKey: number, key: string) =>
      capProps({ attemptKey, resetKeys: [key], maxPromptsPerAttempt: 1, onShow });
    const { result, rerender } = renderHook((p) => useStuckHintPrompt(p), {
      initialProps: makeProps(1, "a"),
    });

    act(() => vi.advanceTimersByTime(20000));
    expect(result.current.isVisible).toBe(true); // attempt 1 노출
    // 같은 attempt 에서 활동해도 상한(1) 도달로 재노출 없음
    rerender(makeProps(1, "b"));
    act(() => vi.advanceTimersByTime(60000));
    expect(result.current.isVisible).toBe(false);
    expect(onShow).toHaveBeenCalledTimes(1);

    // 새 attempt → 카운터 리셋 → 다시 노출
    rerender(makeProps(2, "c"));
    act(() => vi.advanceTimersByTime(20000));
    expect(result.current.isVisible).toBe(true);
    expect(onShow).toHaveBeenCalledTimes(2);
    expect(onShow.mock.calls[1][0]).toMatchObject({ promptSeq: 1 });
  });
});
