import { NATIVE_DEVELOPMENT_GAME_RUNTIME_OVERRIDE_TOKEN } from '../nativeDevelopmentGameRuntimeOverride';

declare const __dirname: string;
declare const require: (moduleName: string) => unknown;

const { readFileSync } = require('fs') as Readonly<{
  readFileSync(path: string, encoding: 'utf8'): string;
}>;
const { join } = require('path') as Readonly<{
  join(...paths: string[]): string;
}>;

const mobileRoot = join(__dirname, '..');
const androidSource = readFileSync(
  join(
    mobileRoot,
    'android/app/src/main/java/com/seorilabs/crosswordpuzzle/MainActivity.kt',
  ),
  'utf8',
);
const androidOverrideSource = readFileSync(
  join(
    mobileRoot,
    'android/app/src/main/java/com/seorilabs/crosswordpuzzle/NativeDevelopmentGameRuntimeOverride.kt',
  ),
  'utf8',
);
const iosSource = readFileSync(
  join(mobileRoot, 'ios/CrosswordPuzzleMobile/AppDelegate.swift'),
  'utf8',
);

describe('native development game runtime injection contract', () => {
  test('Android는 DEBUG와 exact boolean intent extra가 모두 있어야 prop을 주입한다', () => {
    expect(androidSource).toContain('isDebugBuild = BuildConfig.DEBUG');
    expect(androidSource).toMatch(
      /intent\.getBooleanExtra\(\s*NativeDevelopmentGameRuntimeOverride\.INTENT_EXTRA,\s*false,/,
    );
    expect(androidOverrideSource).toContain(
      'if (isDebugBuild && explicitlyRequested) INITIAL_PROPERTY_TOKEN else null',
    );
    expect(androidOverrideSource).toContain(
      'const val INTENT_EXTRA = "com.seorilabs.crosswordpuzzle.DEV_GAME_RUNTIME"',
    );
    expect(androidOverrideSource).toContain(
      `const val INITIAL_PROPERTY_TOKEN = "${NATIVE_DEVELOPMENT_GAME_RUNTIME_OVERRIDE_TOKEN}"`,
    );
  });

  test('iOS는 DEBUG Simulator의 exact launch argument에서만 같은 prop을 주입한다', () => {
    expect(iosSource).toMatch(
      /#if DEBUG\s+#if targetEnvironment\(simulator\)\s+return arguments\.contains\(launchArgument\) \? initialPropertyToken : nil/,
    );
    expect(iosSource).toContain(
      'static let launchArgument = "--crossword-dev-game-runtime"',
    );
    expect(iosSource).toContain(
      `static let initialPropertyToken = "${NATIVE_DEVELOPMENT_GAME_RUNTIME_OVERRIDE_TOKEN}"`,
    );
  });
});
