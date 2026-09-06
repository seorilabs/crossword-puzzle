import React from 'react';
import { Linking, Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';

type Listener = (state: unknown) => void;

const listeners: Listener[] = [];

jest.mock('../platformAuth', () => ({
  subscribeToUpdateGateState: (listener: Listener) => {
    listeners.push(listener);
    listener(null);
    return () => {
      const index = listeners.indexOf(listener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    };
  },
}));

import { UpdateGateOverlay } from '../UpdateGateOverlay';

function emit(state: unknown) {
  act(() => {
    listeners.forEach(listener => listener(state));
  });
}

function existsByTestId(
  renderer: ReactTestRenderer.ReactTestRenderer,
  testID: string,
): boolean {
  return renderer.root.findAll(node => node.props.testID === testID).length > 0;
}

function pressByTestId(
  renderer: ReactTestRenderer.ReactTestRenderer,
  testID: string,
): void {
  const [node] = renderer.root.findAll(
    n => n.props.testID === testID && typeof n.props.onPress === 'function',
  );
  act(() => {
    node.props.onPress();
  });
}

beforeEach(() => {
  listeners.length = 0;
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('ok(구독 초기값 null)면 아무것도 렌더링하지 않는다', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<UpdateGateOverlay />);
  });

  expect(renderer.toJSON()).toBeNull();
});

test('recommended면 업데이트·나중에 버튼을 모두 그린다', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<UpdateGateOverlay />);
  });

  emit({
    kind: 'recommended',
    message: '새 버전이 나왔어요',
    updateUrl: 'https://play.google.com/store/apps/details?id=x',
  });

  expect(existsByTestId(renderer, 'update-gate-update-button')).toBe(true);
  expect(existsByTestId(renderer, 'update-gate-later-button')).toBe(true);
  expect(
    renderer.root.findAllByType(Text).map(node => node.props.children),
  ).toContain('새 버전이 나왔어요');
});

test('required면 닫기(나중에) 버튼이 없다', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<UpdateGateOverlay />);
  });

  emit({
    kind: 'required',
    message: '업데이트가 필요해요',
    updateUrl: 'https://play.google.com/store/apps/details?id=x',
  });

  expect(existsByTestId(renderer, 'update-gate-update-button')).toBe(true);
  expect(existsByTestId(renderer, 'update-gate-later-button')).toBe(false);
});

test('updateUrl이 없으면 어떤 버튼도 그리지 않는다(강제·점검 폴백)', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<UpdateGateOverlay />);
  });

  emit({ kind: 'required', message: '업데이트가 필요해요' });

  expect(existsByTestId(renderer, 'update-gate-update-button')).toBe(false);
  expect(existsByTestId(renderer, 'update-gate-later-button')).toBe(false);
});

test('maintenance는 점검 문구를 보여주고 버튼이 없다', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<UpdateGateOverlay />);
  });

  emit({ kind: 'maintenance', message: '지금 점검 중이에요' });

  expect(existsByTestId(renderer, 'update-gate-update-button')).toBe(false);
  expect(existsByTestId(renderer, 'update-gate-later-button')).toBe(false);
  expect(
    renderer.root.findAllByType(Text).map(node => node.props.children),
  ).toContain('지금 점검 중이에요');
});

test('ok로 바뀌면 떠 있던 안내가 내려간다', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<UpdateGateOverlay />);
  });

  emit({
    kind: 'recommended',
    message: 'm',
    updateUrl: 'https://play.google.com/x',
  });
  expect(renderer.toJSON()).not.toBeNull();

  emit({ kind: 'ok' });
  expect(renderer.toJSON()).toBeNull();
});

test('나중에를 누르면 닫힌다', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<UpdateGateOverlay />);
  });

  emit({
    kind: 'recommended',
    message: 'm',
    updateUrl: 'https://play.google.com/x',
  });
  pressByTestId(renderer, 'update-gate-later-button');

  expect(renderer.toJSON()).toBeNull();
});

test('업데이트하기를 누르면 스토어 주소를 연다', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<UpdateGateOverlay />);
  });

  emit({
    kind: 'recommended',
    message: 'm',
    updateUrl: 'https://play.google.com/store/apps/details?id=x',
  });
  pressByTestId(renderer, 'update-gate-update-button');

  expect(Linking.openURL).toHaveBeenCalledWith(
    'https://play.google.com/store/apps/details?id=x',
  );
});
