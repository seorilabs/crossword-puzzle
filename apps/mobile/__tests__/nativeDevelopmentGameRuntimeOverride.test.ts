import { defaultLaunchConfig } from '../../../packages/crossword-core/src';
import {
  NATIVE_DEVELOPMENT_GAME_RUNTIME_OVERRIDE_TOKEN,
  resolveNativeDevelopmentGameRuntimeOverride,
} from '../nativeDevelopmentGameRuntimeOverride';

describe('native development game runtime override', () => {
  test.each([
    [false, NATIVE_DEVELOPMENT_GAME_RUNTIME_OVERRIDE_TOKEN],
    [true, undefined],
    [true, true],
    [true, 'crossword-native-game-runtime-debug-v0'],
  ])(
    'JS dev=%s, native prop=%p 조합은 fail-closed한다',
    (jsDevelopmentMode, nativeInitialProperty) => {
      expect(
        resolveNativeDevelopmentGameRuntimeOverride(
          jsDevelopmentMode,
          nativeInitialProperty,
        ),
      ).toBeNull();
    },
  );

  test('두 명시 조건이 맞을 때만 기본값에서 runtime gate 하나만 켠다', () => {
    const resolved = resolveNativeDevelopmentGameRuntimeOverride(
      true,
      NATIVE_DEVELOPMENT_GAME_RUNTIME_OVERRIDE_TOKEN,
    );

    expect(resolved).not.toBeNull();
    expect(resolved?.launchConfig).not.toBe(defaultLaunchConfig);
    expect(resolved?.launchConfig).toEqual({
      ...defaultLaunchConfig,
      gameRuntimeEnabled: true,
    });
    expect(
      Object.keys(defaultLaunchConfig).filter(
        key =>
          resolved?.launchConfig[key as keyof typeof defaultLaunchConfig] !==
          defaultLaunchConfig[key as keyof typeof defaultLaunchConfig],
      ),
    ).toEqual(['gameRuntimeEnabled']);
    expect(resolved?.runtimeConfigCandidate).toEqual({
      gameRuntimeEnabled: true,
    });
    expect(Object.isFrozen(resolved?.launchConfig)).toBe(true);
    expect(defaultLaunchConfig.gameRuntimeEnabled).toBe(false);
  });
});
