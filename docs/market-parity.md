# 3마켓 패리티

## 목표

`crossword-puzzle`는 AppsInToss, Google Play, App Store에서 같은 퍼즐 정책과 운영 계약을 유지한다. 시장별 SDK와 빌드 산출물은 다르지만, 사용자가 보는 공개 퍼즐, 보너스 해금, 힌트, 시도 횟수, 이벤트 이름, Remote Config 키는 공통 계약을 따른다.

```mermaid
flowchart TD
  Core["packages/crossword-core<br/>정책 / 타입 / Remote Config / telemetry 계약"]
  AIT["AIT WebView<br/>src + src/adapters"]
  Mobile["Android/iOS RN<br/>apps/mobile"]
  AITRelease["AppsInToss .ait"]
  PlayRelease["Google Play .aab"]
  AppStoreRelease["App Store archive/TestFlight"]

  Core --> AIT
  Core --> Mobile
  AIT --> AITRelease
  Mobile --> PlayRelease
  Mobile --> AppStoreRelease
```

## Source Of Truth

| 영역                    | Source of truth                                             | 시장별 구현                                                              |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| 퍼즐 타입/검증          | `packages/crossword-core/src/types.ts`, `puzzle.ts`         | 없음                                                                     |
| 공개/보너스/힌트 정책   | `packages/crossword-core/src/uiPolicy.ts`                   | 화면 렌더링만 분리                                                       |
| Remote Config 키/기본값 | `packages/crossword-core/src/launchConfig.ts`               | AIT는 Firebase Web SDK, mobile은 RNFirebase                              |
| telemetry 파라미터 정리 | `packages/crossword-core/src/platformContracts.ts`          | AIT는 AppsInToss Analytics + Firebase Web, mobile은 RNFirebase Analytics |
| 광고 adapter            | `src/adapters/appsInTossAds.ts`, `apps/mobile/mobileAds.ts` | AIT는 AppsInToss 광고, mobile은 AdMob                                    |
| AIT adapter             | `src/adapters`                                              | AppsInToss SDK, Web Firebase, localStorage                               |
| Android/iOS adapter     | `apps/mobile`                                               | RNFirebase, AsyncStorage, native projects                                |

## Firebase

| 시장        | Firebase 방식                  | 설정 파일/secret                                                               |
| ----------- | ------------------------------ | ------------------------------------------------------------------------------ |
| AppsInToss  | Firebase Web SDK optional init | `VITE_FIREBASE_*` GitHub Variables                                             |
| Google Play | RNFirebase native Android      | `FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64` repo secret                     |
| App Store   | RNFirebase native iOS          | `FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64` `app-store` environment secret |

`google-services.json`과 `GoogleService-Info.plist`는 커밋하지 않는다. CI는 `scripts/restore-mobile-firebase-config.mjs`로 복구하고, local native build도 같은 스크립트를 사용한다.

## 개발 규칙

- 새 제품 정책은 먼저 `packages/crossword-core`에 추가한다.
- AIT와 mobile이 같은 값을 써야 하는 설정은 `launchConfig.ts`에 추가하고, `remoteconfig.template.json`과 문서를 같이 갱신한다.
- 시장별 SDK import는 app adapter에만 둔다.
- `npm run check:release-parity`가 3마켓 패리티의 최소 자동 가드다.
- Android/iOS가 같은 `apps/mobile` 타깃을 공유하므로, 인앱 홈 타이틀이나 입력 UX를 `Platform.OS === 'ios'` / `Platform.OS === 'android'` 분기로 되돌리면 안 된다. `check:release-parity`는 iOS 전용 홈 타이틀 분기, Android 전용 보드 입력 재포커스, 관련 테스트 누락을 실패 처리한다.
- 한 시장에서만 기능을 임시로 끄는 경우, fallback UX와 해제 조건을 이 문서 또는 release 문서에 남긴다.

## 복귀 리마인드 푸시 동의 (D1 재방문)

- 결정 로직(언제·몇 번 동의를 유도할지)은 코어 `packages/crossword-core/src/returnReminder.ts`에 두어 3개 시장이 같은 정책으로 동작한다. 노출 게이트는 Remote Config 키 `return_reminder_enabled`(기본값 `true`, #162)이다. 필요 시 Remote Config에서 `false`로 끌 수 있다.
- 실제 동의 요청(시장별 알림 SDK)은 adapter로 분리한다. **AIT/Web**은 `src/adapters/notificationAgreement.ts`가 `@apps-in-toss/web-framework`의 `requestNotificationAgreement`(스마트발송 캠페인 동의)를 호출하고, 다음날 "오늘의 퍼즐" 리마인드는 서버(스마트발송)가 발송한다.
- **Android/iOS(RN)**는 아직 알림 SDK 의존성이 없어 동의 요청 adapter가 없다(후속 작업). 기본값이 `true`로 바뀌면서 **AIT/Web만 완료 시 동의를 유도**하고, mobile은 이 값과 무관하게 동의 유도/이벤트가 없는 no-op으로 동작한다(`apps/mobile/firebaseClient.ts`는 키를 읽지만 prompt 호출부가 없음). mobile에서 동일 동작을 켜려면 RN 알림 동의 adapter를 먼저 추가해야 한다. 이 시장 차이는 의도된 상태다.
- 동의 유도/결과는 텔레메트리 `return_reminder_prompt`, `return_reminder_result`(영문 키 유지)로 계측한다. 1회 유도 후 동의/거부/미지원으로 종결되면 다시 묻지 않는다.
