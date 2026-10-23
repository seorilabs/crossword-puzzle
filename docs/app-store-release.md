# App Store 릴리스 가이드

## 현재 상태

공개 저장소인 `crossword-puzzle`의 iOS archive와 App Store Connect 업로드는 GitHub-hosted macOS에서 중앙 `rn-deploy-app-store.yml@main`으로 실행한다. 앱의 `.github/workflows/deploy-app-store.yml`에 exact stable 태그와 `upload`를 전달한다. 중앙 정책상 private 저장소는 Xcode Cloud 경로를 사용한다.

설치된 기존 배포 인증서와 앱 전용 프로파일로 수동 서명하며 새 인증서를 자동 발급하지 않는다. 중앙 PR [#313](https://github.com/seorilabs/.github/pull/313)부터 archive 단계가 프로파일 이름을 `IOS_PROVISIONING_PROFILE_NAME`에도 전달한다. 이 앱은 Release 구성에서 해당 변수를 읽는다. 프로파일의 앱 식별자와 Game Center 권한도 일치해야 한다.

v1.2.0의 고정 후보와 개발 검수, 실제 마켓 실행 상태는 [출시 기록](qa/2026-10-23-single-daily-puzzle/release-status.md)을 따른다. 아래 로컬 명령은 개발 환경 진단용이며 서명 업로드, 심사 제출과 공개 완료의 근거를 대신하지 않는다.

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

로컬 archive도 임의 `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`을 받지 않는다. 현재 HEAD를
가리키는 exact stable 태그와 SHA `565fba53aa5053785c63c9b732b93a3fbd7be847`의 중앙 정본이
계산한 값만 `xcodebuild`에 전달한다.

## 6. 중앙 릴리스 실행

```bash
gh workflow run deploy-app-store.yml \
  --repo seorilabs/crossword-puzzle \
  --ref main \
  -f release_tag=v1.2.0 \
  -f upload=true
```

실제 빌드 소스는 입력한 태그로 고정한다. 중앙 원장의 버전 번호를 사용하고 before-build 검증, Firebase 설정 복원, 의존성 설치와 기존 인증서 및 프로파일 설치, archive와 산출물 버전 및 bundle ID 대조, before-deploy 검증, App Store Connect 업로드 순서로 실행한다. 실패 실행의 재실행은 해당 단계와 이미 올라간 빌드 번호를 먼저 읽어 중복 업로드를 피한다.

필요한 실행 복사본은 이 앱의 `app-store` 환경에 둔다. `APPLE_PROVISIONING_PROFILE_BASE64`는 등록된 앱 전용 프로파일을 사용하며 인증서, 팀, 앱 식별자와 Game Center 권한을 대조한다. `FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64`도 기존 Secret에서 복원한다. 로컬 원본과 공개 identity가 확인된 자격증명만 재사용하며 새 발급과 회전은 별도 승인 범위다.

기존 Xcode Cloud 훅은 `apps/mobile/ios/ci_scripts`에 남아 있다. private 저장소의 Xcode Cloud 경로를 사용할 때는 최신 중앙 정책과 해당 workflow의 실제 설정을 따로 확인한다. 현재 공개 저장소의 태그 실행 진입점은 위 caller다.

빌드 성공, 업로드 접수, Apple 처리의 VALID, 내부 테스트 배포, 심사 제출, 승인과 공개를 각각 읽어 기록한다. 기기 검수 범위와 미실행 항목은 승인된 테스트 계획을 따른다.

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
npm run app-store:deliver:upload -- --metadata-only --tag v1.0.0
```

App Store 앱 이름은 iOS용으로 `가로세로 퍼즐`을 사용한다. `supportUrl`, `privacyPolicyUrl`, `marketingUrl` 후보를 실제 등록값으로 확정한 경우에만 `--use-suggested-urls`를 추가한다.

업로드 없이 현재 ASC 값을 읽어서 확인:

```bash
source "$HOME/.config/seorilabs/app-store-connect.env"
npm run app-store:deliver:upload -- --metadata-only --tag v1.0.0 -- --verify_only true
```

screenshot만 로컬 업로드:

```bash
source "$HOME/.config/seorilabs/app-store-connect.env"
npm run app-store:deliver:upload -- --screenshots-only --tag v1.0.0
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
