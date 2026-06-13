# App Store 릴리스 가이드

## 현재 상태

`crossword-puzzle`의 App Store 릴리스는 GitHub Actions 기반 TestFlight 업로드 체계와 로컬 build/archive/upload 체계를 함께 둔다. Apple signing secrets, App Store Connect API key, App Store Connect app shell/profile 준비 후 `.github/workflows/deploy-app-store.yml`에서 `v0.1.5` / build `1005` 업로드까지 성공했다. GitHub Actions minutes가 소진된 경우에는 아래 로컬 명령을 사용한다.

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

로컬 unsigned Release build는 다음 명령으로 확인한다.

```bash
npm run app-store:build:local
```

signed archive는 signing 값이 확정된 뒤 실행한다. `app-store/app-store.config.json`의 `ios.teamId`, `ios.provisioningProfileSpecifier`를 기본값으로 쓰며, 필요한 경우 환경변수로 덮어쓴다.

```bash
APPLE_TEAM_ID="HCDUXX4Z3X" \
IOS_PROVISIONING_PROFILE_NAME="AppStore Crossword Puzzle Profile" \
npm run app-store:build:local -- --archive --tag v1.0.0
```

로컬 파일 없이 GitHub secret과 같은 base64 값을 환경변수로 주입할 수도 있다.

```bash
APPLE_TEAM_ID="HCDUXX4Z3X" \
APPLE_DISTRIBUTION_CERTIFICATE_BASE64="$APPLE_DISTRIBUTION_CERTIFICATE_BASE64" \
APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD="$APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD" \
APPLE_PROVISIONING_PROFILE_BASE64="$APPLE_PROVISIONING_PROFILE_BASE64" \
APPLE_KEYCHAIN_PASSWORD="$APPLE_KEYCHAIN_PASSWORD" \
npm run app-store:build:local -- --archive --tag v1.0.0
```

archive 후 App Store Connect/TestFlight 업로드까지 로컬에서 실행하려면 App Store Connect API key를 추가한다.

```bash
APPLE_TEAM_ID="HCDUXX4Z3X" \
IOS_PROVISIONING_PROFILE_NAME="AppStore Crossword Puzzle Profile" \
APP_STORE_CONNECT_API_KEY_ID="$APP_STORE_CONNECT_API_KEY_ID" \
APP_STORE_CONNECT_ISSUER_ID="$APP_STORE_CONNECT_ISSUER_ID" \
APP_STORE_CONNECT_PRIVATE_KEY_BASE64="$APP_STORE_CONNECT_PRIVATE_KEY_BASE64" \
npm run app-store:build:local -- --export-upload --tag v1.0.0
```

수동 xcodebuild 참고 명령:

```bash
xcodebuild \
  -workspace apps/mobile/ios/CrosswordPuzzleMobile.xcworkspace \
  -scheme CrosswordPuzzleMobile \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath tmp/crossword-puzzle.xcarchive \
  MARKETING_VERSION=1.0.0 \
  CURRENT_PROJECT_VERSION=1000000 \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  PROVISIONING_PROFILE_SPECIFIER="$IOS_PROVISIONING_PROFILE_NAME" \
  archive
```

## 6. GitHub Actions TestFlight 업로드

Workflow:

```text
.github/workflows/deploy-app-store.yml
```

Trigger:

- 수동 실행 `workflow_dispatch` + `release_tag=vX.Y.Z` (비우면 최신 태그 사용)
- `Deploy All` 묶음 workflow에서 `workflow_call`로 호출

릴리스 버전:

- `MARKETING_VERSION`: `vX.Y.Z`에서 `X.Y.Z`
- `CURRENT_PROJECT_VERSION`: `major * 1000000 + minor * 1000 + patch`

필수 GitHub Secrets/Variables:

| 이름                                            | 용도                                                     |
| ----------------------------------------------- | -------------------------------------------------------- |
| `APPLE_TEAM_ID`                                 | Team ID. secret 또는 repository variable                 |
| `APPLE_DISTRIBUTION_CERTIFICATE_BASE64`         | Apple Distribution `.p12` base64                         |
| `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD`       | `.p12` 비밀번호                                          |
| `APPLE_PROVISIONING_PROFILE_BASE64`             | App Store provisioning profile `.mobileprovision` base64 |
| `APPLE_KEYCHAIN_PASSWORD`                       | CI 임시 keychain 비밀번호                                |
| `APP_STORE_CONNECT_API_KEY_ID`                  | App Store Connect API key ID                             |
| `APP_STORE_CONNECT_ISSUER_ID`                   | App Store Connect issuer ID                              |
| `APP_STORE_CONNECT_PRIVATE_KEY_BASE64`          | `AuthKey_*.p8` base64                                    |
| `FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64` | `GoogleService-Info.plist` base64                        |

2026-06-07 확인 기준, `seorilabs/crossword-puzzle` GitHub repo에는 `app-store` environment가 생성되어 있고 TestFlight 업로드에 필요한 Apple signing/App Store Connect environment secrets와 `APPLE_TEAM_ID=HCDUXX4Z3X` variable이 등록되어 있다. `v0.1.5` / build `1005`는 GitHub Actions run `27087313726`, job `79945275484`에서 App Store Connect 업로드까지 성공했다.

2026-06-13 로컬 확인 기준, GitHub Actions minutes를 쓰지 않고 아래 명령으로 `0.3.2` / build `3002`를 App Store Connect에 업로드했다. App Store Connect build ID는 `5720d5e9-38ab-4324-a8fa-acb74721426a`이고 processing state는 `VALID`다. 업로드 중 `hermesvm.framework` dSYM 누락 경고가 있었지만 binary upload는 성공했다.

```bash
npm run app-store:build:local -- --export-upload --tag v0.3.2 --skip-pods
```

2026-06-13 로컬 확인 기준, iOS AdMob 설정을 점검한 뒤 아래 명령으로 `0.3.4` / build `3004`를 App Store Connect에 업로드했다. App Store Connect build ID는 `7adb7c92-7763-4046-9b42-119c0612c249`이고 processing state는 `VALID`다. archive 산출물 `Info.plist`에서 `GADApplicationIdentifier=ca-app-pub-2444587584524186~4715406099`와 Google Mobile Ads `SKAdNetworkItems`를 업로드 전에 검증했다. 업로드 중 `hermesvm.framework` dSYM 누락 경고가 있었지만 binary upload는 성공했다.

```bash
npm run app-store:build:local -- --export-upload --marketing-version 0.3.4 --build-number 3004 --skip-pods
```

2026-06-13 로컬 확인 기준, 보상형 광고 진단 모드를 추가한 뒤 아래 명령으로 `0.3.5` / build `3005`를 App Store Connect에 업로드했다. App Store Connect build ID는 `28e5db1a-fc5d-4788-a1c8-beaa1481eda1`이고 processing state는 `VALID`다. archive 산출물 `Info.plist`에서 iOS AdMob app ID와 Google Mobile Ads SKAdNetwork ID를 다시 검증했다. 업로드 중 `hermesvm.framework` dSYM 누락 경고가 있었지만 binary upload는 성공했다.

```bash
npm run app-store:build:local -- --export-upload --marketing-version 0.3.5 --build-number 3005 --skip-pods
```

`0.3.5` 광고 진단은 `출처` 화면에서 `한국어기초사전` 제목을 7회 탭해 연다. `힌트 테스트`/`보너스 테스트`가 성공하면 SDK 통합은 정상이고, `힌트 운영`/`보너스 운영`이 `googleMobileAds/no-fill`이면 AdMob serving 또는 신규 광고 단위 fill 문제로 본다. `module_unavailable` 또는 `initialize_failed`면 앱 binary/native SDK 연결 문제다. Ad Inspector 버튼은 Google Mobile Ads SDK request log를 확인하는 데 사용한다.

남은 항목은 App Store Connect 정책 답변, TestFlight/App Store version build selection, 최종 심사 제출이다.

Workflow는 profile을 복원한 뒤 다음을 검증한다.

- profile Team ID가 `APPLE_TEAM_ID`와 일치
- profile application identifier가 `com.seorilabs.crosswordpuzzle` 또는 wildcard와 일치
- `get-task-allow=false`
- device 목록이 없는 App Store profile
- Apple Distribution signing identity import 성공

업로드는 `xcodebuild -exportArchive`와 `destination=upload`, `method=app-store-connect`로 수행한다. 업로드 성공은 App Store Connect에서 build processing이 시작됐다는 뜻이며, TestFlight 그룹 선택/빌드 선택/최종 심사 제출은 별도 gate다.

로컬 스크립트는 `~/.config/seorilabs/app-store-connect.env`가 있으면 자동으로 읽는다. App Store Connect API 인증은 archive 단계의 `-allowProvisioningUpdates`에도 전달하고, signing profile은 Xcode project의 앱 타깃 전용 `$(IOS_PROVISIONING_PROFILE_NAME)`로만 주입한다. `PROVISIONING_PROFILE_SPECIFIER`를 xcodebuild command-line build setting으로 넘기면 Pods target까지 오염되어 archive가 실패한다.

## 7. Metadata/Screenshot 로컬 등록

App Store Connect 등록 텍스트와 screenshot은 로컬에서 업로드한다. GitHub Actions minutes를 쓰지 않는다.

텍스트 metadata는 Fastlane `deliver`가 최초 버전의 비어 있는 review detail을 조회하다 실패할 수 있으므로, 기본적으로 App Store Connect API 직접 업로더를 사용한다. screenshot은 Fastlane `deliver`를 사용한다.

업로드 전 생성 산출물 확인:

```bash
npm run app-store:deliver:prepare
```

`supportUrl`, `privacyPolicyUrl`, `marketingUrl`은 현재 config에 확정값을 둔다. 아직 확정값이 없고 후보 URL을 실제 등록값으로 쓰기로 결정한 경우에만 다음 옵션을 사용한다.

```bash
npm run app-store:deliver:prepare -- --use-suggested-urls
```

metadata만 로컬 업로드:

```bash
source "$HOME/.config/seorilabs/app-store-connect.env"
npm run app-store:metadata:upload
```

App Store 앱 이름은 iOS용으로 `가로세로 퍼즐`을 사용한다. `supportUrl`, `privacyPolicyUrl`, `marketingUrl` 후보를 실제 등록값으로 확정한 경우에만 `--use-suggested-urls`를 추가한다.

업로드 없이 현재 ASC 값을 읽어서 확인:

```bash
source "$HOME/.config/seorilabs/app-store-connect.env"
npm run app-store:metadata:upload -- --verify-only
```

screenshot만 로컬 업로드:

```bash
source "$HOME/.config/seorilabs/app-store-connect.env"
npm run app-store:deliver:upload -- --screenshots-only
```

현재 `app-store/screenshots/iphone/iphone-{1,2,3}.png`와 `app-store/screenshots/ipad/ipad-{1,2,3}.png`를 시뮬레이터 Release build에서 생성했다. iPhone은 1320 x 2868, iPad는 2064 x 2752 PNG다.

## 8. Export/Upload 로컬 참고

`app-store/export-options.plist`는 signing 확정 후 만든다. Export method는 App Store Connect upload 기준으로 `app-store-connect`를 사용한다.

업로드 성공은 App Store Connect 처리 시작을 의미할 뿐이다. 다음 항목은 별도 확인해야 한다.

- build processing completion
- version build selection
- TestFlight internal testing setup
- final Submit for Review

## 9. 남은 blocker

남은 blocker는 `npm run check:app-store`와 `app-store/app-store.config.json.manualGates`를 기준으로 관리한다.
