import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import {
  useStuckHintPrompt,
  type MobileStuckHintShowInfo,
} from '../useStuckHintPrompt';

type HookInput = Parameters<typeof useStuckHintPrompt>[0];
type HookResult = ReturnType<typeof useStuckHintPrompt>;

const baseInput: Omit<HookInput, 'onShow' | 'resetKeys'> = {
  active: true,
  firstInputPending: false,
  firstInputIdleMs: 6000,
  wrongCellCount: 0,
  wrongCellThreshold: 2,
  idleMs: 20000,
  wrongIdleMs: 5000,
  puzzleKey: 'puzzle-1',
  maxPromptsPerAttempt: 2,
  maxDismissals: 1,
  dismissBackoffFactor: 2,
  minCooldownMs: 180000,
  progressPercent: 0,
  wordsRemaining: 5,
  finishNudgeProgressThreshold: 90,
  finishNudgeWordsRemaining: 2,
};

let latestResult: HookResult | null = null;

function Harness({ input }: { input: HookInput }) {
  latestResult = useStuckHintPrompt(input);
  return null;
}

function renderHook(input: HookInput) {
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Harness input={input} />);
  });
  return {
    get result() {
      if (latestResult == null) {
        throw new Error('hook result unavailable');
      }
      return latestResult;
    },
    rerender(nextInput: HookInput) {
      act(() => renderer.update(<Harness input={nextInput} />));
    },
    unmount() {
      act(() => renderer.unmount());
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  latestResult = null;
});

afterEach(() => {
  jest.useRealTimers();
});

test('첫 입력 전에는 공용 6초 지연 뒤 first_input으로 한 번 노출한다', () => {
  const onShow = jest.fn<void, [MobileStuckHintShowInfo]>();
  const hook = renderHook({
    ...baseInput,
    firstInputPending: true,
    resetKeys: [{}],
    onShow,
  });

  act(() => jest.advanceTimersByTime(5999));
  expect(hook.result.isVisible).toBe(false);
  act(() => jest.advanceTimersByTime(1));
  expect(hook.result.isVisible).toBe(true);
  expect(onShow).toHaveBeenCalledWith({
    trigger: 'first_input',
    delayMs: 6000,
    promptSeq: 1,
    dismissCount: 0,
    nearFinish: false,
    wordsRemaining: 5,
  });
  hook.unmount();
});

test('입력 활동이 생기면 기존 타이머를 취소하고 idle 지연을 다시 센다', () => {
  const onShow = jest.fn<void, [MobileStuckHintShowInfo]>();
  const firstInput = {
    ...baseInput,
    resetKeys: [{}] as readonly unknown[],
    onShow,
  };
  const hook = renderHook(firstInput);

  act(() => jest.advanceTimersByTime(19000));
  hook.rerender({ ...firstInput, resetKeys: [{ '0:0': '가' }] });
  act(() => jest.advanceTimersByTime(19999));
  expect(onShow).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1));
  expect(onShow).toHaveBeenCalledWith(
    expect.objectContaining({ trigger: 'idle', delayMs: 20000 }),
  );
  hook.unmount();
});

test('직전 노출 뒤에는 공용 최소 쿨다운이 지나기 전 재노출하지 않는다', () => {
  const onShow = jest.fn<void, [MobileStuckHintShowInfo]>();
  const firstInput = {
    ...baseInput,
    resetKeys: [{}] as readonly unknown[],
    onShow,
  };
  const hook = renderHook(firstInput);

  act(() => jest.advanceTimersByTime(20000));
  expect(onShow).toHaveBeenCalledTimes(1);
  act(() => hook.result.hide());
  hook.rerender({ ...firstInput, resetKeys: [{ '0:0': '가' }] });
  act(() => jest.advanceTimersByTime(179999));
  expect(onShow).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(1));
  expect(onShow).toHaveBeenCalledTimes(2);
  hook.unmount();
});

test('비활성 게이트와 dismiss 상한은 추가 노출을 차단한다', () => {
  const onShow = jest.fn<void, [MobileStuckHintShowInfo]>();
  const disabled = renderHook({
    ...baseInput,
    active: false,
    resetKeys: [{}],
    onShow,
  });
  act(() => jest.advanceTimersByTime(60000));
  expect(onShow).not.toHaveBeenCalled();
  disabled.unmount();

  const enabledInput = {
    ...baseInput,
    minCooldownMs: 0,
    resetKeys: [{}] as readonly unknown[],
    onShow,
  };
  const enabled = renderHook(enabledInput);
  act(() => jest.advanceTimersByTime(20000));
  expect(onShow).toHaveBeenCalledTimes(1);
  act(() => enabled.result.dismiss());
  enabled.rerender({ ...enabledInput, resetKeys: [{ '0:0': '가' }] });
  act(() => jest.advanceTimersByTime(60000));
  expect(onShow).toHaveBeenCalledTimes(1);
  enabled.unmount();
});
