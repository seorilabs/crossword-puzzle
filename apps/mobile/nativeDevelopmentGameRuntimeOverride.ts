import {
  defaultLaunchConfig,
  normalizeLaunchConfig,
  type LaunchConfig,
} from '../../packages/crossword-core/src';

export const NATIVE_DEVELOPMENT_GAME_RUNTIME_OVERRIDE_TOKEN =
  'crossword-native-game-runtime-debug-v1';

export type NativeDevelopmentGameRuntimeOverride = Readonly<{
  launchConfig: LaunchConfig;
  runtimeConfigCandidate: Readonly<{ gameRuntimeEnabled: true }>;
}>;

const launchConfigPropertyNames = Object.keys(defaultLaunchConfig) as Array<
  keyof LaunchConfig
>;

/**
 * Resolves the local native-game override without reading Firebase or storage.
 * Both the JS development build and the native debug-only launch property must
 * opt in. Any mismatch fails closed to the existing remote-only path.
 */
export function resolveNativeDevelopmentGameRuntimeOverride(
  jsDevelopmentMode: boolean,
  nativeInitialProperty: unknown,
): NativeDevelopmentGameRuntimeOverride | null {
  if (
    jsDevelopmentMode !== true ||
    nativeInitialProperty !== NATIVE_DEVELOPMENT_GAME_RUNTIME_OVERRIDE_TOKEN
  ) {
    return null;
  }

  const candidate = {
    ...defaultLaunchConfig,
    gameRuntimeEnabled: true,
  } satisfies LaunchConfig;
  const launchConfig = normalizeLaunchConfig(candidate);

  // Keep this override pinned to the validated code defaults. A future default
  // that falls outside the launch-config contract disables the override rather
  // than silently booting with a different value.
  if (
    !launchConfigPropertyNames.every(key =>
      Object.is(launchConfig[key], candidate[key]),
    )
  ) {
    return null;
  }

  return Object.freeze({
    launchConfig: Object.freeze({ ...launchConfig }),
    runtimeConfigCandidate: Object.freeze({ gameRuntimeEnabled: true }),
  });
}
