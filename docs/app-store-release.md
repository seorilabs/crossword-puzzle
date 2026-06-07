# App Store 릴리스 가이드

## 현재 상태

`crossword-puzzle`의 App Store 릴리스는 준비 시작 단계다. 현재 목표는 등록값과 iOS build gate를 repo에 고정하고, 이후 App Store Connect 콘솔 작업과 archive/upload를 진행하는 것이다.

## 1. 로컬 점검

```bash
npm run check:app-store
npm --prefix apps/mobile run lint
npm --prefix apps/mobile test -- --watchAll=false
```

`check:app-store`는 콘솔 수동 항목이 남아 있으면 실패한다. 이 실패는 의도된 blocker inventory로 보고, 남은 항목을 줄이는 데 사용한다.

## 2. CocoaPods 정상화

`apps/mobile/ios` CocoaPods 산출물은 생성됐다. Podfile/native dependency 변경 후에는 아래 명령을 다시 실행한다.

```bash
cd apps/mobile/ios
bundle exec pod install
```

그 뒤 workspace 기준으로 Release build를 확인한다.

```bash
xcodebuild \
  -workspace apps/mobile/ios/CrosswordPuzzleMobile.xcworkspace \
  -scheme CrosswordPuzzleMobile \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath tmp/xcode-derived-data \
  CODE_SIGNING_ALLOWED=NO \
  build
```

2026-06-05 기준 위 unsigned Release build는 Xcode 권한으로 통과했다.

## 3. Signing 확정

App Store/TestFlight upload에는 개발 인증서가 아니라 `Apple Distribution` 인증서와 같은 Team ID의 App Store provisioning profile이 필요하다.

확인 명령:

```bash
xcodebuild \
  -workspace apps/mobile/ios/CrosswordPuzzleMobile.xcworkspace \
  -scheme CrosswordPuzzleMobile \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath tmp/xcode-derived-data \
  -showBuildSettings | rg 'DEVELOPMENT_TEAM|CODE_SIGN_STYLE|CODE_SIGN_IDENTITY|PROVISIONING_PROFILE_SPECIFIER|PRODUCT_BUNDLE_IDENTIFIER|TARGETED_DEVICE_FAMILY'
```

현재 config의 signing 관련 값은 `확정 필요`다. 실제 Apple 계정의 Team ID/profile 이름을 확인하기 전에는 repo 기본값으로 추정해서 넣지 않는다.

## 4. Assets

- App Store icon: `app-store/assets/icon-1024.png`
- Xcode AppIcon: `apps/mobile/ios/CrosswordPuzzleMobile/Images.xcassets/AppIcon.appiconset`
- iPhone screenshots: `app-store/screenshots/iphone`
- iPad screenshots: `app-store/screenshots/ipad`

현재 `TARGETED_DEVICE_FAMILY = 1,2`이므로 iPad asset 요구사항까지 본다. iPad 지원을 빼는 결정은 별도 제품 결정으로 처리한다.

## 5. Archive

Signing 값이 확정된 뒤 archive한다.

```bash
xcodebuild \
  -workspace apps/mobile/ios/CrosswordPuzzleMobile.xcworkspace \
  -scheme CrosswordPuzzleMobile \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath tmp/crossword-puzzle.xcarchive \
  archive
```

## 6. Export/Upload

`app-store/export-options.plist`는 signing 확정 후 만든다. Export method는 App Store Connect upload 기준으로 `app-store-connect`를 사용한다.

업로드 성공은 App Store Connect 처리 시작을 의미할 뿐이다. 다음 항목은 별도 확인해야 한다.

- build processing completion
- version build selection
- TestFlight internal testing setup
- final Submit for Review

## 7. 남은 blocker

남은 blocker는 `npm run check:app-store`와 `app-store/app-store.config.json.manualGates`를 기준으로 관리한다.
