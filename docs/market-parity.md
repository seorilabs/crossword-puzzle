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

| 영역                    | Source of truth                                             | 시장별 구현                                                     |
| ----------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| 퍼즐 타입/검증          | `packages/crossword-core/src/types.ts`, `puzzle.ts`         | 없음                                                            |
| 발행 난이도 로테이션    | `packages/crossword-core/src/difficultyRotation.ts`         | 세 시장이 같은 Firebase Hosting manifest를 읽음                 |
| 난이도 한글 라벨        | `packages/crossword-core/src/puzzleLabels.ts`               | 이전 난이도 데이터 해석에 사용, 새 홈에서는 난이도 선택 제거                |
| 공개/보너스/힌트 정책   | `packages/crossword-core/src/uiPolicy.ts`                   | 화면 렌더링만 분리                                              |
| Remote Config 키/기본값 | `packages/crossword-core/src/launchConfig.ts`               | AIT는 Firebase Web SDK, mobile은 RNFirebase                     |
| telemetry 표준 차원     | `packages/crossword-core/src/releaseVersion.ts`             | 모든 custom event에 시장·runtime·release를 sink에서 강제        |
| Presence opt-in 정책    | `packages/crossword-core/src/platformPresence.ts`           | AIT WebView와 Android/iOS가 Platform SDK 0.6.0 lifecycle을 연결 |
| 광고 adapter            | `src/adapters/appsInTossAds.ts`, `apps/mobile/mobileAds.ts` | AIT는 AppsInToss 광고, mobile은 AdMob                           |
| 리더보드 정책/점수      | `packages/crossword-core/src/leaderboard.ts`                | AIT Game Center, Android Play Games Services, iOS GameKit       |
| AIT adapter             | `src/adapters`                                              | AppsInToss SDK, Web Firebase, localStorage                      |
| Android/iOS adapter     | `apps/mobile`                                               | RNFirebase, AsyncStorage, native projects                       |

## 퍼즐 식별자 telemetry 문자열 계약

- `puzzle_id`, `puzzle_alias`, `next_puzzle_id`, `pack_id`, `slot_id`는 AppsInToss Web, Google Play Android, App Store iOS에서 모두 문자열로 전송한다. `packages/crossword-core/src/platformContracts.ts`가 일반 telemetry를, `gameAnalytics.ts`가 `game_*` 컨텍스트를 전송 전에 정규화한다.
- Web과 mobile의 원격 퍼즐 loader는 manifest와 puzzle JSON의 숫자 식별자를 즉시 문자열로 바꿔 `Puzzle["puzzleId"]` 타입과 런타임 값을 일치시킨다.
- 교정 전 GA4 데이터에는 같은 키가 `string_value`와 `int_value`로 나뉘어 있다. 과거 구간 쿼리는 `COALESCE(value.string_value, CAST(value.int_value AS STRING))`로 읽고, 교정 이후에도 연속 시계열을 위해 이 형태를 유지한다.

## 완료 후 다음 퍼즐 추천 계약

- v1.2.0의 결과 화면은 한 판의 실제 완료와 기록을 보여 준다. 공유, 기록, 완성한 판 다시 보기와 홈 복귀를 제공한다.
- 난이도를 올리는 다음 판 추천과 두 단계 사다리는 새 화면에서 사용하지 않는다. 이전 easy와 hard 판은 기록에서 직접 열 수 있다. 미래 공개 판을 추천하거나 홈에서 노출하지 않는다.

## Firebase

| 시장        | Firebase 방식                  | 설정 파일/secret                                                               |
| ----------- | ------------------------------ | ------------------------------------------------------------------------------ |
| AppsInToss  | Firebase Web SDK optional init | `VITE_FIREBASE_*` GitHub Variables                                             |
| Google Play | RNFirebase native Android      | `FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64` repo secret                     |
| App Store   | RNFirebase native iOS          | `FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64` `app-store` environment secret |

`google-services.json`과 `GoogleService-Info.plist`는 커밋하지 않는다. CI는 `scripts/restore-mobile-firebase-config.mjs`로 복구하고, local native build도 같은 스크립트를 사용한다.

모든 커스텀 이벤트는 공통 sink를 거쳐 `app_market`, `runtime_platform`,
`release_version`을 받는다. 웹은 `apps_in_toss`/`web`, Android는
`google_play`/`android`, iOS는 `app_store`/`ios`다. 호출자가 같은 키를 넘겨도 빌드에서
결정한 표준값이 마지막에 덮어쓴다. Firebase 자동 이벤트는 앱 코드에서 억지로 고치지 않고
BigQuery 정규화 뷰에서 출처와 함께 보완한다. Firebase/GA4/BigQuery 콘솔 링크와 custom
dimension의 live 상태는 이 코드 변경의 완료 범위가 아니다.

## Platform Presence (#356)

- Web/AIT와 Android/iOS는 `@seorilabs/platform-sdk@0.6.0`을 사용하고 안정된 `appId=crossword-puzzle`, 플랫폼, 앱 버전만 Presence context로 전달한다. 사용자 ID·광고 ID·외부 세션 ID·기타 PII와 재전송 큐는 추가하지 않는다.
- 개발용 빌드는 SDK가 `X-Seori-Build: debug`를 붙여 운영 가입·이벤트·presence 집계에서 빠진다. Android/iOS는 SDK 기본값(React Native `__DEV__`)을 쓰고, `__DEV__`가 없는 Web/AIT는 `src/adapters/platformAuth.ts`가 Vite `import.meta.env.DEV`를 `debugBuild`로 넘긴다. 출시 번들은 두 표면 모두 false다.
- 공용 기본 opt-in은 `packages/crossword-core/src/platformPresence.ts`의 `PLATFORM_PRESENCE_ENABLED=true`다. 이 값을 `false`로 두면 token/Edge 요청이 아예 발생하지 않는다.
- 각 composition root는 시작·background/hidden 정지·foreground/visible 복귀를 SDK Presence lifecycle에 연결한다. 동기 SDK 오류와 SDK 내부의 timeout·5xx·DNS·TLS 실패는 모두 fail-open이며 앱 시작·퍼즐 플레이·저장 흐름을 막지 않는다.
- SDK가 제공하는 전용 token/Edge HTTP 경로, Edge 2초 timeout, no-outbox/no-replay 계약을 그대로 사용한다. 앱 adapter는 직접 heartbeat나 별도 fallback을 구현하지 않는다.
- 실제 heartbeat는 이 앱 스위치와 Platform registry `registry/apps/crossword-puzzle.json`의 `features.presence`가 **둘 다** 켜져야 나간다. registry만 켜면 앱이 요청하지 않고, 앱만 켜면 token이 `enabled=false`로 돌아온다.
- 롤백은 registry를 닫는 쪽으로 한다. 이미 마켓에 나간 빌드에서도 heartbeat가 멈추므로 앱 재배포가 필요 없다.
- 중앙 rollout 게이트는 2026-09-09에 해제됐다(seorilabs/platform#78). 앱 스위치를 켠 것과 공개 배포·live readback 완료는 계속 구분해 기록한다.

## 개발 규칙

- 새 제품 정책은 먼저 `packages/crossword-core`에 추가한다.
- AIT와 mobile이 같은 값을 써야 하는 설정은 `launchConfig.ts`에 추가하고, `remoteconfig.template.json`과 문서를 같이 갱신한다.
- 시장별 SDK import는 app adapter에만 둔다.
- `npm run check:release-parity`가 3마켓 패리티의 최소 자동 가드다.
- Android/iOS가 같은 `apps/mobile` 타깃을 공유하므로, 인앱 홈 타이틀이나 입력 UX를 `Platform.OS === 'ios'` / `Platform.OS === 'android'` 분기로 되돌리면 안 된다. `check:release-parity`는 iOS 전용 홈 타이틀 분기, Android 전용 보드 입력 재포커스, 관련 테스트 누락을 실패 처리한다.
- 한 시장에서만 기능을 임시로 끄는 경우, fallback UX와 해제 조건을 이 문서 또는 release 문서에 남긴다.

## 홈 사다리와 주간 스트릭

- v1.2.0은 두 단계 사다리 대신 오늘 공개된 8×8 판 하나를 권한다. core `getDailyFreePuzzleSummary`가 공개 시각을 지난 판 중 같은 날짜의 hard를 우선한다. 이전 두 판 발행 날짜도 같은 선택 규칙을 쓴다.
- 홈의 주 행동은 오늘 한 판 시작, 이어서 풀기 또는 완성한 판 보기다. 지난 미완료 판과 전체 기록은 보조 진입이다.
- 주간 표시는 core `buildWeeklyStreakStrip`와 `computeConsecutiveStreakDays`로 계산한다. 화면 방문만으로 완료일이나 스트릭을 늘리지 않는다.

## 일간 발행 난이도 구성

- 단일 판 전환일 전에는 기존 easy와 hard 발행을 유지한다. `PUZZLE_SINGLE_DAILY_FROM_DATE`를 설정한 날짜부터 전날 23:00에 8×8 한 판을 생성해 해당 날짜 00:00 KST에 공개한다. 실제 적용 여부는 운영 readback으로 별도 확인한다.
- 새 판의 전송 식별자는 hard, h01과 YYMMDD01을 유지한다. 사용자 화면에서는 난이도를 선택하지 않는다. 과거 easy와 hard의 정답, ID와 진행 기록은 덮어쓰지 않는다.
- 세 마켓은 같은 Firebase Hosting manifest를 읽으며 미래 공개 판을 숨긴다. 공개된 판이 하나도 없으면 준비 상태로 남기고 미래 판을 대신 시작하지 않는다.

## 막힘 힌트 과다 노출 방어 (#265)

- 첫 입력 가이드와 자동 막힘 프롬프트는 각각 공용 Remote Config `first_input_guide_enabled`, `stuck_hint_prompt_enabled`를 따른다. 두 키는 기본 `true`이고 Web·Android·iOS에서 독립적으로 즉시 끌 수 있다.
- 막힘 판정 시간·첫 입력 전용 지연(`stuck_hint_first_input_idle_ms`, 기본 6초)·오답 임계·퍼즐당 노출 상한·dismiss 상한·최소 쿨다운은 `packages/crossword-core/src/launchConfig.ts`의 공용 Remote Config 계약을 따른다. 기본 정책은 같은 퍼즐에서 최대 2회, 노출 간 최소 180초, 첫 dismiss 후 해당 퍼즐 재노출 금지다.
- **AIT/Web**은 `src/useStuckHintPrompt.ts`가 퍼즐 ID를 기준으로 상태를 유지하므로 같은 퍼즐의 재도전이나 홈 왕복으로 상한과 dismiss 억제를 초기화하지 않는다. 기존 `stuck_hint_prompt`, `stuck_hint_prompt_accept`, `stuck_hint_prompt_dismiss` 이벤트 이름은 유지한다.
- **AIT/Web**은 보드가 비고 이번 attempt에 입력이 없으면 6초 뒤 `trigger=first_input` 입력 개시 안내를 띄운다. 수락은 힌트를 소비하지 않고 첫 빈 칸 선택·입력 포커스만 수행한다. 첫 입력 뒤에는 기존 20초 idle/5초 오답 분기로 돌아간다.
- **Android/iOS(RN)**도 `apps/mobile/useStuckHintPrompt.ts`에서 같은 코어 지연·쿨다운·상한 함수를 사용한다. 첫 세 단어 안내의 공통 상태를 AsyncStorage에 저장한다. `first_three_words_shown`, `first_three_words_complete`, `first_three_words_skip`와 `stuck_hint_prompt|accept|dismiss`를 Web과 같은 파라미터 계약으로 RNFirebase Analytics에 발화한다.

## 리워드 힌트 광고 시스템 실패 재시도 (#277)

- AIT/Web과 Android/iOS는 `packages/crossword-core/src/rewardedAdRetry.ts`의 정책에 따라 시스템 실패만 정확히 1회 자동 재시도한다. 사용자가 닫은 `dismissed`와 SDK 미지원 `unsupported`는 재시도하지 않는다.
- 최초 광고 요청부터 최종 결과까지 loading 상태를 유지해 중복 탭을 막고, 첫 시스템 실패 뒤에는 `광고를 다시 준비하는 중` 안내를 노출한다. 두 번째 실패 뒤에는 기존 실패 안내로 돌아간다.
- `rewarded_hint_ad_request`, `rewarded_hint_ad_event`, `rewarded_hint_ad_result`, 보상 이벤트에 `retry=0|1`을 기록해 최초 시도와 회수 시도를 구분한다.

## 완료 직후 다음 퍼즐 연결 (#274)

- v1.2.0 결과 화면은 한 판 완성 뒤 공유와 기록으로 잇는다. 이전 `next_puzzle_cta`와 난이도 상승 화면은 사용하지 않는다.
- 실제 완료 전환에만 `mission_complete`와 별도의 `game_puzzle_complete`를 각각 한 번 기록한다. 지표에서는 두 이름을 더해 두 번 완주한 것으로 세지 않는다. 저장된 완성 판을 다시 열어도 새 완료를 만들지 않는다.

## 보너스 퍼즐 제거 상태 (#326)

- `bonus_puzzle_panel_impression` 계약은 f992a61(2026-07-25)에서 기능과 함께 제거됨. 1.0.9+ 론칭 사용자에게서 미발화하는 것이 현재 정상 상태다.
- `rewarded_bonus_puzzle` 광고·Remote Config 계약도 f992a61에서 제거됨. 광고 퍼널과 마켓 파리티 대상에 포함하지 않는다.
- 복원 여부는 제품 결정 대기 상태다. 제거 전 표본이 개발자 1~2명뿐이라 리텐션 효과 근거가 없으며, 별도 결정과 검증 계획 없이 기능을 복원하지 않는다.

## 기록·통계·공유 계약

- 개인 통계(`computePersonalStats`·`computeSolveTimeDistribution`), 스트릭 달력(`buildStreakCalendarWeeks`·`computeLongestStreakDays`), 공유 문구·격자(`buildShareText`·`buildShareGrid`), 공유 계측(`shareResult.ts`의 `share_result_click`/`share_result_outcome`, `surface=result_screen|completion_dialog`), 진척 화면 노출(`emitProgressionScreenView` → `personal_stats_view`·`streak_view`)과 스트릭 마일스톤(`emitStreakMilestoneIfReached`)은 모두 core 에 있고 Web·RN 이 같은 함수를 호출한다.
- RN 기록 화면은 `apps/mobile/recordsComponents.tsx`(`PersonalStatsCard`·`StreakHeatmap`·`ShareGridPreview`)로 웹과 같은 카드를 그린다. 완료 모달·결과 화면 배지는 core `getCompletionAchievements`(노힌트·첫 도전·최고 기록 자격)를 쓰고 `🏆 최고 기록 갱신!`을 포함한다. 진행 마일스톤(25/50/75%) 보상 토스트도 core 문구를 쓴다.
- RN 저장 키: 최고 기록 `crossword-puzzle:best-times`(퍼즐별 ms 단일 JSON, 갱신 판정은 core `shouldRecordBestTime`), 완료일 `crossword-puzzle:completion-dates`(정렬된 `YYYY-MM-DD[]`, 아카이브 30건 상한과 무관하게 누적), 백필 마커 `crossword-puzzle:completion-dates:migrated`. 첫 실행에 아카이브 완료 레코드와 `crossword-puzzle:mission:{date}:{puzzleId}` 키를 한 번 스캔해 완료일을 백필하므로 기존 기기의 스트릭·히트맵이 줄지 않는다. 마커는 스캔과 저장이 모두 성공했을 때만 남기고, 실패하면 다음 실행에서 다시 백필한다. 최고 기록도 저장이 성공했을 때만 갱신으로 본다(웹 `saveBestTimeMs`와 동일). 아카이브 레코드는 완료 시점의 `hintCount`·`revealUsed`를 동결한다.
- 스트릭과 7일 스트립·12주 히트맵은 모두 누적 완료일 저장소에서 파생한다(`computeConsecutiveStreakDays`).

## 리더보드

- 세 시장은 `packages/crossword-core`의 완료 제출 조건, 점수 산식, `leaderboard_enabled`, `leaderboard_score_submit` 계약을 공유한다. 결과 화면에서 완료한 퍼즐에만 `순위 보기`를 노출한다.
- **AIT/Web**은 AppsInToss Game Center adapter, **Android**는 Play Games Services v2, **iOS**는 GameKit을 사용한다. Android/iOS는 React Native Codegen의 `NativeLeaderboard` TurboModule을 통해 같은 mobile adapter에 연결한다.
- 완료 직후 자동 제출은 네이티브의 비대화형 `isAuthenticated` 조회가 true일 때만 수행한다. 미인증이면 `outcome=skipped`, `error_code=leaderboard_auth_required`로 계측하고 `순위 보기` CTA를 유지한다. Android의 대화형 PGS `signIn()`은 사용자가 `순위 보기`를 누른 열람 경로에서만 허용한다.
- 자동 제출 실패는 네이티브 reject code를 `leaderboard_score_submit.error_code`에 보존하고 CTA를 숨기지 않는다. 명시적 순위 열람 자체가 실패한 경우에만 기존처럼 현재 세션 CTA를 숨긴다.
- AIT, Google, Apple의 순위 데이터 풀은 서로 분리된다. 세 마켓 사용자를 한 표에 합치는 기능은 Firebase custom leaderboard를 별도 설계해야 한다.
- Android 빌드에는 `PLAY_GAMES_PROJECT_ID`와 `PLAY_GAMES_LEADERBOARD_ID`가 필요하다. iOS는 App Store Connect의 실제 공개 ID를 Xcode project의 `GAME_CENTER_LEADERBOARD_ID` 기본값으로 유지하고 GitHub Actions variable로 동일 값을 검증한다. 플랫폼 설정이 없거나 Remote Config가 `false`면 안전하게 CTA를 숨긴다.

## 복귀 리마인드 푸시 동의 (D1 재방문)

- 결정 로직(언제·몇 번 동의를 유도할지)은 코어 `packages/crossword-core/src/returnReminder.ts`에 두어 3개 시장이 같은 정책으로 동작한다. 노출 게이트는 Remote Config 키 `return_reminder_enabled`(기본값 `true`, #162)이다. 필요 시 Remote Config에서 `false`로 끌 수 있다.
- 실제 동의 요청(시장별 알림 SDK)은 adapter로 분리한다. **AIT/Web**은 `src/adapters/notificationAgreement.ts`가 `@apps-in-toss/web-framework`의 `requestNotificationAgreement`(스마트발송 캠페인 동의)를 호출하고, 다음날 "오늘의 퍼즐" 리마인드는 서버(스마트발송)가 발송한다.
- **사전 안내(pre-prompt)**: 두 표면 모두 완료 축하 화면 안에 core 문구(`RETURN_REMINDER_PREPROMPT_COPY`, `formatReturnReminderPrepromptBody(streak)`) 카드를 먼저 보여 주고, "알림 받기"를 누른 뒤에만 시스템 다이얼로그(AIT 스마트발송 동의·OS 알림 권한)를 띄운다. 시스템 다이얼로그는 한 번 거부되면 되돌리기 어렵기 때문이다. "괜찮아요"와 카드에 답하지 않은 닫기는 `declined`로 기록하며, 종결이 아니라 `error`/`timeout`처럼 다음 날 다시 안내하고 유도 예산(3회)은 소진한다. 카드 노출·수락·보류는 `return_reminder_preprompt(action=shown|accept|decline, channel, prompt_count, streak_days)`로 계측한다. Web은 `src/components/ReturnReminderPrepromptCard.tsx`, RN도 결과 화면 진입 후 동의 카드를 연다.
- **Android/iOS(RN)**는 `react-native-notify-kit` adapter가 사전 안내 수락 뒤 OS 알림 권한을 요청하고, 허용 시 다음 날 09:00 KST에 "오늘의 퍼즐" 로컬 알림 한 건을 예약한다(`apps/mobile/mobileReturnReminder.ts`의 `prepare → confirm/decline`). 동의(`agreed`) 상태면 **매 완료마다** D+1로 다시 예약한다(`refreshMobileReturnReminderSchedule`, `return_reminder_schedule(channel=local, outcome, reminder_date)`) — 이전에는 동의한 첫날 한 번만 예약돼 D1 알림 한 건으로 끝났다. 앱을 다시 열면(초기 로드·active 복귀) 예약 날짜가 오늘 이전·오늘인 알림은 취소한다(`cancelStaleMobileReturnReminder`). 같은 notification ID를 취소 후 재사용하고 Android는 `alarmManager=false`로 WorkManager를 사용하므로 exact-alarm 권한이 필요 없다. 앱이 꺼진 상태의 탭은 early background handler가 저장하고, foreground/cold-start 소비가 `today` 화면으로 이동시킨다.
- Android 13+ 권한은 Manifest의 `POST_NOTIFICATIONS`와 SDK 런타임 요청으로 처리한다. iOS 알림 권한 문구는 OS가 앱 이름과 함께 표시하며 사용자 정의 purpose-string용 Info.plist 키가 없으므로 가짜 키를 추가하지 않는다. 양쪽 모두 퍼즐 완료라는 사용 맥락에서 요청한다.
- 동의 유도/결과는 텔레메트리 `return_reminder_prompt`, `return_reminder_result`(영문 키 유지)로 계측하고 `channel=ait|local`로 구분한다. 동의/거부/미지원은 1회 결과로 종결하고, `error`/`timeout`/`declined`만 다음 날짜에 총 3회 상한으로 재유도한다. 결과에는 `prompt_count`, `error_reason`, 가장 구체적인 `error_code`, 다른 최상위 래퍼가 있으면 `error_wrapper_code`, 실패 단계 `stage=preflight|sdk_callback|timeout`을 기록한다. 중첩 코드 `4000`도 AIT 배포 설정 오류로 인식해 프롬프트 예산 상한을 우회한다. RN 알림 탭은 `notification_opened(channel=local, notification_kind=daily_puzzle, reminder_date)`를 한 번 발화한다.
- AIT/Web의 `templateCode`는 콘솔에서 발급되는 실제 코드여야 하며, 빌드 환경변수 `VITE_RETURN_REMINDER_TEMPLATE_CODE`로 주입한다. 로컬 개발은 기본값 `crossword-daily-reminder`로 폴백할 수 있지만 `Deploy AIT`는 repository variable이 없거나 공백이면 빌드 전에 실패한다. 발급 코드 확인·반영 절차는 README를 참고한다.

## 신규 첫 실행 온보딩 퍼즐 자동 진입 (#205)

- 세 마켓 모두 오늘 판 홈에서 시작한다. 별도 작은 입문 판과 자동 진입은 사용하지 않는다.
- 같은 판에서 쉬운 세 단서를 안내한다. 건너뛰기, 자유 선택과 중단 후 복원을 허용한다. 다른 미시작 판을 열어도 원래 진행 중인 안내를 덮어쓰지 않는다.
- `first_three_words_shown`, `first_three_words_complete`, `first_three_words_skip`는 공통 `FIRST_WORD_GUIDE_EVENTS`에서 가져온다. `puzzle_id`, `input_policy=syllable-v1`, `word_count`를 함께 기록한다. 세 단어 안내 완료는 전체 한 판 완료와 다르다.
- `scripts/analytics/onboarding-guide-funnel.sql`은 고유 사용자와 퍼즐의 노출을 분모로 계산한다. 출력 해석은 [첫 세 단어 안내 분석](onboarding-guide-funnel.md)을 따른다. 기존 한 입력 안내 `onboarding_guide_*`와 새 세 단어 안내를 합치지 않는다.

## 연필(임시 입력) 모드 (#200)

- v1.2.0의 기본 입력은 core `letterTileInput.ts`의 글자 타일이다. 시스템 키보드와 연필 토글은 새 풀이 화면에서 사용하지 않는다.
- 맞힌 단어와 교차 칸은 잠그고, 전체 오답에서는 맞는 위치를 유지해 틀린 칸만 다시 선택하게 한다. 미완성 입력, 선택 위치와 되돌리기 이력은 저장 후 복원한다. 과거 저장 형식은 읽을 수 있게 유지한다.
- 같은 viewport에서는 보드와 입력부 위치를 고정한다. 타일은 5열, 2줄 영역을 예약하고 더 긴 과거 단어는 타일 영역 안에서만 스크롤한다.

## 일일 도전 횟수 상한 원격화 (#225)

- 하루 도전 횟수 상한은 코어 `packages/crossword-core/src/launchConfig.ts`의 Remote Config 키 `daily_attempt_limit`(기본값 `3` = `uiPolicy.DAILY_ATTEMPT_LIMIT`, 최소 1로 클램프)로 조정한다. 기본값이 기존 상수와 같아 원격 미주입 시 3마켓 모두 기존과 동일하게 3회로 동작한다.
- **AIT/Web**은 `src/App.tsx`가 미션 로드 시 `launchConfig.dailyAttemptLimit`를 `loadMission`에 넘겨 미션의 `maxAttempts`로 반영하고, 카드 "도전 종료" 판정도 미션의 `maxAttempts`를 따른다. 원격에서 값을 2/4로 바꾸면 재배포 없이 상한이 반영된다.
- **Android/iOS(RN)**는 아직 `apps/mobile/firebaseClient.ts`가 이 키를 읽지 않고 `apps/mobile/App.tsx`가 공유 기본 상수 `DAILY_ATTEMPT_LIMIT`를 그대로 사용한다(후속 작업). 원격값을 3에서 바꾸면 **AIT/Web만** 반영되고 mobile은 기본 3회로 유지되는 시장 차이가 생기며, 이는 의도된 상태다. mobile까지 원격화하려면 `apps/mobile/firebaseClient.ts`에 `daily_attempt_limit` 파싱과 미션 로드부 배선을 추가해야 한다.

## v1.2.0 사용 통계와 iOS 동의

- 세 마켓의 사용 통계 선택은 core의 `usageStatistics.ts`로 정의한다. 저장값이 없을 때 기본 켬이며 꺼진 선택을 보존한다. 복원 중에는 앱 분석 이벤트를 보내지 않는다. 끄기는 UI와 게임 분석의 모든 sink에 적용한다. 퍼즐 기록, 힌트, 계정 기능은 유지한다. 제공자 자체 필수 운영 로그까지 이 스위치로 차단한다고 안내하지 않는다.
- iOS는 UMP와 광고 개인정보 메뉴를 사용하지 않는다. 앱 시작 시 `IABTCF_` 값만 제거하며 비개인화 광고와 Firebase 광고 신호 거부를 유지한다. ATT와 새 SDK를 추가하지 않는다. Android UMP는 유지한다.
- 실제 제공자 SDK, OS 및 광고 송출 검사는 미실행이다. 승인된 L3 개발 환경과 독립 검수 3회로 검증하며 기기는 사용하지 않는다.
- Firebase collection 및 consent 키: https://firebase.google.com/docs/analytics/configure-data-collection?platform=ios 와 https://developers.google.com/tag-platform/security/guides/app-consent?platform=ios 를 확인했다.
