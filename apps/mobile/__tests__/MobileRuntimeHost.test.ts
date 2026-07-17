jest.mock('react-native-webview', () => ({
  __esModule: true,
  default: () => null,
}));

import { validateNativeGameBundle } from '../MobileRuntimeHost';

const checksum =
  'sha256:3fdc5808ada6c91ae0d355a1c8ea5d45aca3582d51f3013c52949ef0768663a8';
const bridgeSessionId = '147a74c2-cb40-4f06-a955-89a599cf0ed9';

describe('validateNativeGameBundle', () => {
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
});
