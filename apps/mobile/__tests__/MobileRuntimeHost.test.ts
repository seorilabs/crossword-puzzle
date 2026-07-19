jest.mock('react-native-webview', () => ({
  __esModule: true,
  default: () => null,
}));

import { BUNDLED_FIRST_RUN_CONTENT_IDENTITIES } from '../../../packages/crossword-core/src/launchContentCatalog';
import {
  createMobileRuntimeReadyExpectations,
  MOBILE_FIRST_RUN_KNOWN_CONTENT_CHECKSUMS,
  resolveMobileGameBootOptions,
  validateNativeGameBundle,
} from '../MobileRuntimeHost';

const checksum =
  'sha256:3fdc5808ada6c91ae0d355a1c8ea5d45aca3582d51f3013c52949ef0768663a8';
const bridgeSessionId = '147a74c2-cb40-4f06-a955-89a599cf0ed9';

describe('validateNativeGameBundle', () => {
  test('exact native development override만 local cold-start boot budget을 확장한다', () => {
    expect(resolveMobileGameBootOptions(false)).toBeUndefined();
    expect(resolveMobileGameBootOptions(true)).toEqual({ watchdogMs: 30_000 });
  });

  test('Android appassets exact bundle만 허용한다', () => {
    const bundle = {
      indexUrl:
        'https://appassets.androidplatform.net/assets/crossword-game/index.html',
      assetManifestUrl:
        'https://appassets.androidplatform.net/assets/crossword-game/asset-manifest.json',
      assetManifestChecksum: checksum,
      bridgeSessionId,
    };
    expect(validateNativeGameBundle(bundle, 'android')).toEqual(bundle);
    expect(
      validateNativeGameBundle(
        { ...bundle, indexUrl: `${bundle.indexUrl}?escape=1` },
        'android',
      ),
    ).toBeNull();
    expect(
      validateNativeGameBundle(
        { ...bundle, readAccessUrl: 'file:///tmp/' },
        'android',
      ),
    ).toBeNull();
    expect(
      validateNativeGameBundle({ ...bundle, extra: 'not-allowed' }, 'android'),
    ).toBeNull();
  });

  test('RN URL polyfill의 relative-base 동작과 무관하게 sibling manifest를 검증한다', () => {
    const bundle = {
      indexUrl:
        'https://appassets.androidplatform.net/assets/crossword-game/index.html',
      assetManifestUrl:
        'https://appassets.androidplatform.net/assets/crossword-game/asset-manifest.json',
      assetManifestChecksum: checksum,
      bridgeSessionId,
    };
    const OriginalUrl = globalThis.URL;

    class ReactNativeLikeUrl extends OriginalUrl {
      constructor(input: string | URL, base?: string | URL) {
        super(
          base == null
            ? input
            : `${base.toString().replace(/\/$/, '')}/${input.toString()}`,
        );
      }
    }

    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      writable: true,
      value: ReactNativeLikeUrl,
    });
    try {
      expect(validateNativeGameBundle(bundle, 'android')).toEqual(bundle);
    } finally {
      Object.defineProperty(globalThis, 'URL', {
        configurable: true,
        writable: true,
        value: OriginalUrl,
      });
    }
  });

  test('iOS read access를 CrosswordGame 전용 디렉터리로 제한한다', () => {
    const bundle = {
      indexUrl:
        'file:///private/var/containers/Bundle/Application/APP/CrosswordPuzzleMobile.app/CrosswordGame/index.html',
      readAccessUrl:
        'file:///private/var/containers/Bundle/Application/APP/CrosswordPuzzleMobile.app/CrosswordGame/',
      assetManifestUrl:
        'file:///private/var/containers/Bundle/Application/APP/CrosswordPuzzleMobile.app/CrosswordGame/asset-manifest.json',
      assetManifestChecksum: checksum,
      bridgeSessionId,
    };
    expect(validateNativeGameBundle(bundle, 'ios')).toEqual(bundle);
    expect(
      validateNativeGameBundle(
        {
          ...bundle,
          readAccessUrl:
            'file:///private/var/containers/Bundle/Application/APP/CrosswordPuzzleMobile.app/',
        },
        'ios',
      ),
    ).toBeNull();
    expect(
      validateNativeGameBundle(
        { ...bundle, indexUrl: bundle.indexUrl.replace('file:', 'https:') },
        'ios',
      ),
    ).toBeNull();
  });

  test('manifest 경로와 SHA-256 형식 불일치를 거부한다', () => {
    const bundle = {
      indexUrl:
        'https://appassets.androidplatform.net/assets/crossword-game/index.html',
      assetManifestUrl:
        'https://appassets.androidplatform.net/assets/crossword-game/other.json',
      assetManifestChecksum: checksum,
      bridgeSessionId,
    };
    expect(validateNativeGameBundle(bundle, 'android')).toBeNull();
    expect(
      validateNativeGameBundle(
        { ...bundle, assetManifestChecksum: 'sha256:not-a-checksum' },
        'android',
      ),
    ).toBeNull();
    expect(
      validateNativeGameBundle(
        { ...bundle, bridgeSessionId: 'predictable-session' },
        'android',
      ),
    ).toBeNull();
  });

  test('마이그레이션과 runtime proof가 실제 첫 실행 3보드 identity를 모두 사용한다', () => {
    expect(MOBILE_FIRST_RUN_KNOWN_CONTENT_CHECKSUMS).toEqual(
      Object.fromEntries(
        BUNDLED_FIRST_RUN_CONTENT_IDENTITIES.map(identity => [
          identity.puzzleId,
          identity.contentChecksum,
        ]),
      ),
    );
    expect(createMobileRuntimeReadyExpectations(checksum)).toEqual(
      BUNDLED_FIRST_RUN_CONTENT_IDENTITIES.map(identity => ({
        renderer: 'webgl',
        scene: 'puzzle',
        visible: true,
        contentChecksum: identity.contentChecksum,
        contentLocale: 'ko-KR',
        puzzleId: identity.puzzleId,
        assetManifestChecksum: checksum,
      })),
    );
  });
});
