import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TileHomeScreen } from '../TileHomeScreen';
import { setUiLanguage } from '../languageRepository';

test.each(['ko', 'en'] as const)(
  'unavailable and completed home states have distinct copy in %s',
  async language => {
    setUiLanguage(language);
    const props = {
      completedToday: 0,
      summary: undefined,
      allComplete: false,
      loading: false,
      date: '2026-10-31',
      started: false,
      streak: 0,
      week: [],
      offline: false,
      onStart: jest.fn(),
      onResume: jest.fn(),
      onHistory: jest.fn(),
      onSettings: jest.fn(),
      onLicense: jest.fn(),
      onRetry: jest.fn(),
    };
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<TileHomeScreen {...props} />);
    });
    const serialized = JSON.stringify(renderer!.toJSON());
    expect(serialized).toContain(
      language === 'ko'
        ? '지금 풀 수 있는 판이 없어요.'
        : 'No playable puzzles are available right now.',
    );
    const retryLabel = language === 'ko' ? '다시 불러오기' : 'Try again';
    expect(serialized).toContain(retryLabel);
    const retry = renderer!.root
      .findAllByProps({ onPress: props.onRetry })
      .find(button => button.props.accessibilityRole === 'button');
    expect(retry?.props.disabled).toBe(false);
    await ReactTestRenderer.act(async () => {
      retry!.props.onPress();
    });
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    expect(serialized).not.toContain(
      language === 'ko'
        ? '모든 판을 완성했어요'
        : 'You’ve completed every puzzle',
    );
    await ReactTestRenderer.act(async () => {
      renderer!.update(
        <TileHomeScreen {...props} completedToday={5} allComplete />,
      );
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain(
      language === 'ko'
        ? '모든 판을 완성했어요'
        : 'You’ve completed every puzzle',
    );
    await ReactTestRenderer.act(async () => {
      renderer!.unmount();
    });
  },
);
