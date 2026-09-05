# 프로젝트 문서
- AGENTS.local.md 파일을 참고하세요.

# 참고 문서
- docs/skills/apps-in-toss.md 파일을 참고하세요.
- docs/skills/tds-mobile.md 파일을 참고하세요.

# 3마켓 패리티
- 이 저장소는 AppsInToss(AIT), Google Play(Android), App Store(iOS)를 같은 제품으로 유지한다.
- 기능 정책, 퍼즐 선택 규칙, Remote Config 키, telemetry event 계약은 먼저 `packages/crossword-core`에 둔다.
- AIT WebView 전용 구현은 `src/adapters`, Android/iOS RN 전용 구현은 `apps/mobile` 아래 adapter에 둔다.
- `packages/crossword-core`에는 React, React Native, AppsInToss SDK, Firebase SDK, AdMob SDK import를 넣지 않는다.
- 새 기능은 AIT/Web, Android, iOS에서 같은 사용자 정책으로 동작해야 한다. 시장별 SDK 차이는 adapter로만 분리한다.
- 릴리스 전 `npm run check:release-parity`, `npm run build`, `npm run check:mobile`을 같이 통과시키는 것을 기본 완료 기준으로 본다.
- 이 저장소의 package manager 는 npm 하나다. 루트와 `apps/mobile` 모두 `npm ci` 로 설치하고, 커밋되는 lockfile 은 `package-lock.json` 뿐이다. `pnpm-lock.yaml` 등 다른 package manager 의 lockfile 을 커밋하면 Platform discovery 의 의존성 감지가 흔들린다.
- `@seorilabs/platform-sdk` 는 캐럿·틸드 없이 exact 버전으로 선언하고 lockfile 도 같은 버전으로 해석돼야 한다.
- native Firebase 설정 파일은 커밋하지 않는다. CI/local은 `scripts/restore-mobile-firebase-config.mjs`와 GitHub Secrets로 복구한다.
- RNFirebase iOS 빌드는 Podfile의 `RCT_USE_RN_DEP=0`, `RCT_USE_PREBUILT_RNCORE=0`, static framework 설정을 유지한다.
- Google Play/App Store/AIT 중 한 시장만 기능을 바꾸는 경우, 나머지 두 시장의 동작 차이를 문서와 release gate에 명시한다.
