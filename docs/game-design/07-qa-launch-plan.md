# QA 론칭 계획

- 제품명: `말길: 가로세로 모험` (제안명)
- 문서 상태: draft
- 소유자: QA Lead / Release Manager
- 버전/수정일: v0.2 / 2026-07-17
- Source of truth: 검증 범위, 증거, 소프트론칭, 출시·롤백 gate는 이 문서가 소유한다.
- Depends on: `02-gdd.md`, `03-ui-ux-spec.md`, `05-economy-content-liveops.md`, `06-technical-production-plan.md`, 기존 market release 문서
- Open blockers: `BLK-CONTENT-001`, `BLK-ENG-001`, `BLK-A11Y-001`, `BLK-STORE-001`, `BLK-PRIVACY-001`, `BLK-LEGAL-001`, `BLK-AUDIENCE-001`, `BLK-OBS-001`, `BLK-I18N-001`
- 승인 근거: 부분 승인 — 2026-07-17 사용자 메시지 `구조 다국어, 출시 콘텐츠 한국어 동의.` (`DEC-015`); 그 외 결정은 사용자 승인 전

## 기기와 플랫폼 매트릭스

| Tier            | 시장           | 대표 환경                                     | 필수 시나리오                          |
| --------------- | -------------- | --------------------------------------------- | -------------------------------------- |
| AIT-Android-Low | AppsInToss     | Galaxy A15급, Toss 최신 지원 버전             | cold start, 9×9, 광고, background 20회 |
| AIT-Android-Ref | AppsInToss     | Galaxy S23급                                  | 60fps, 햅틱, IntegratedAd, deep link   |
| AIT-iOS-Compact | AppsInToss     | iPhone SE급, Toss iOS                         | WKWebView, IME, X 버튼, 복귀, 광고     |
| AIT-iOS-Safe    | AppsInToss     | Dynamic Island iPhone, Toss iOS               | safe area, closeView, CORS, memory     |
| Android-Min     | Google Play    | Android 7/API 24 지원 기기 또는 동급 test lab | 설치, local WebView, 저장, offline     |
| Android-Ref     | Google Play    | Galaxy S23, Android 최신 지원 버전            | 전체 회귀, AdMob, TalkBack             |
| Android-Fold    | Google Play    | Galaxy Z Fold/Flip급                          | fold, 회전, safe area, resize          |
| iOS-Min         | App Store      | iPhone SE 2세대, iOS 15.1 이상                | 작은 화면, IME, VoiceOver, memory      |
| iOS-Ref         | App Store      | iPhone 13/16급                                | 전체 회귀, AdMob, background           |
| iOS-Safe        | App Store      | Dynamic Island 기기                           | safe area, 알림, share sheet           |
| Tablet          | Play/App Store | Android 10인치, iPad 9세대급                  | portrait 2열, font 200%, resize        |

- 최소 OS와 실제 스토어 지원 범위는 release config와 일치시킨다.
- emulator와 simulator는 자동 회귀에 쓰되 광고, 햅틱, IME, memory, 접근성 완료 증거는 실기기에서 수집한다.
- AIT 검수는 샌드박스 QR과 실제 Toss 컨테이너를 구분해 기록한다.

## 기능 QA

### 퍼즐과 입력

- 가로·세로 같은 시작 칸, 중복 음절, 받침, 쌍자음, 긴 답, 빈 칸 삭제를 fixture로 고정한다.
- 한글 조합 중 focus 이동, 단어 전환, 앱 중단이 정답 판정을 호출하지 않는지 확인한다.
- 직접 입력과 쉬운 음절 탭이 같은 core state를 만든다.
- 단어 완료 뒤 교차 칸, 연필 입력, reveal, 힌트 상태가 세 시장에서 같다.
- 5×5, 7×7, 8×8, 9×9와 잘못된 pack을 모두 테스트한다.

### locale과 Unicode

- 출시 `ko-KR/v1`에서 NFC/NFD 입력, 받침, 쌍자음, 미완성 자모, paste와 IME composition을 세 runtime에서 검증한다.
- multi-code-point cell을 가진 비출시 synthetic profile로 공통 코어의 `string.length`와 문자열 spread syntax 의존을 탐지한다. 이 fixture는 출시 언어나 콘텐츠로 표시하지 않는다.
- `answerCells`, grid, `answer` legacy projection, locale/profile version과 checksum 중 하나라도 다르면 pack을 차단한다.
- `uiLocale` 변경은 progress snapshot checksum과 `contentChecksum`을 바꾸지 않는다. UI 설정을 포함한 save envelope/profile checksum은 바뀔 수 있다. `contentLocale` namespace는 서로의 완료·지도·카드·streak·journal·grant·원장 record를 덮어쓰지 않아야 한다.
- legacy unscoped 저장은 `ko-KR`로만 이관하고 unsupported UI locale은 `ko-KR` catalog로 fallback한다.
- 요청·manifest·payload locale 불일치와 cross-locale bundled/cache fallback을 차단한다. `releaseTimeZone=Asia/Seoul`은 표시 언어를 바꿔도 유지한다.
- AIT, Android, iOS canonical transcript의 `ui_locale`, `content_locale`, profile ID/version이 같아야 한다.

### 저장과 복구

- 입력, 단어 완료, 힌트, 보드 완료 각 시점에서 process kill 후 복원한다.
- 기존 AIT live-origin localStorage와 mobile AsyncStorage fixture를 Save v2로 변환한다.
- AIT의 신규 Save v2는 AppsInToss Storage에 기록하고 localStorage는 migration source와 cache로만 남는다.
- AIT QR origin과 live origin의 저장 격리를 확인하고 live-origin localStorage→Storage migration을 실제 출시 경로에서 rehearsal한다.
- 마이그레이션 전·중·후 강제 종료, 저장공간 부족, checksum 불일치를 주입한다.
- 원격 retention에서 사라진 보드는 저장 snapshot으로 계속 열 수 있어야 한다.
- 마이그레이션을 3회 실행해도 잔액, 완료 수, 보상이 늘지 않아야 한다.

### 광고와 수명주기

- load, show, click, reward, close, fail, timeout, background callback 순서를 조합한다.
- callback 중복과 process resume에도 한 transaction만 지급한다.
- `load_failed`·`timeout` fallback은 보드당 1회, local day 2회 상한이며 cancel에는 지급되지 않고 kill switch OFF에서 0회인지 확인한다.
- 광고 중 BGM·SFX·Phaser loop가 멈추고 닫은 뒤 한 번만 재개한다.
- 첫 세션과 튜토리얼에서 광고 request 자체가 발생하지 않는지 로그로 확인한다.
- 실패 시 무료 대체 도움과 원래 focus가 복원된다.

### 콘텐츠

- local validator 통과 뒤 실제 공개 URL에서 manifest와 모든 puzzle을 재다운로드해 검증한다.
- generator commit, config hash, content checksum, license manifest를 build provenance와 비교한다.
- 단서·답 오류 제보가 puzzle/entry ID만 포함하고 자유 입력은 동의 뒤 보내는지 확인한다.
- 공개 pack에서 `needsManualClue`가 누락되거나 `false` 이외 값인 entry, 허용되지 않은 `clueSource`, 필수 provenance 누락이 하나라도 있으면 release를 중단한다.

### AppsInToss container

- 프레임워크 우측 상단 X와 게임 UI가 겹치지 않고 모든 scene에서 종료할 수 있어야 한다.
- 종료 확인 뒤 `closeView`는 durable 저장 완료 후 한 번만 호출한다. timeout이면 자동으로 닫지 않고 저장 실패 UI에서 재시도 또는 마지막 durable snapshot으로 나가기를 사용자가 다시 확인한 뒤에만 호출한다.
- OS back gesture는 게임에서 비활성화하고 내부 back 동작과 framework X를 구분한다.
- browser pinch zoom을 비활성화하고 버튼식 격자 확대가 동등한 기능을 제공한다.
- 사용자의 모든 tap은 2초 안에 시각 또는 상태 피드백을 준다.
- `getUserKeyForGame` 성공, 미지원 버전 fallback, raw key 비계측을 확인한다.
- QR와 live origin 모두 Firebase Hosting content CORS, Analytics 초기화, Storage namespace를 별도로 확인한다.

### 기존 3마켓 차이 청산

| 현재 차이                                 | 신규 runtime 결정                            | 증거                         |
| ----------------------------------------- | -------------------------------------------- | ---------------------------- |
| return reminder는 AIT만 동의 adapter 있음 | 세 시장 adapter 전까지 신규 runtime 기본 OFF | 동일 config E2E              |
| 첫 실행 자동 진입은 AIT만 배선            | Android·iOS도 같은 core 정책 구현            | 신규 저장 3 runtime 영상     |
| 연필 입력은 AIT만 UI 있음                 | 세 시장 동일 UI·Save v2 상태                 | tentative fixture와 실기기   |
| 일일 상한 Remote Config는 mobile 미반영   | DEC-005 승인 전 세 시장 reader 구현          | normalized config transcript |
| mobile이 reveal·tentative 복원 일부 유실  | Save v2에서 보존                             | migration fixture            |
| mobile이 28개 config 중 일부만 읽음       | 유지 키 전체 reader와 deprecate 처리         | 동일 snapshot contract test  |

의도적 예외를 남기려면 사용자 승인, fallback UX, 해제 조건을 `docs/market-parity.md`와 release gate에 함께 기록한다.

## UX와 접근성 QA

| 항목           | 방법                       | 통과 기준                           |
| -------------- | -------------------------- | ----------------------------------- |
| 첫 제어권      | 신규 설치 10회 영상        | 상호작용 가능 후 5초 안에 입력 가능 |
| 첫 입력        | 비숙련자 5명, 장년층 5명   | 8명 이상 도움 없이 첫 답 입력       |
| 터치           | overlay와 layout inspector | 주요 동작 44pt/48dp 이상            |
| Screen reader  | VoiceOver/TalkBack AC-005  | 격자 직접 탭 없이 튜토리얼 완료     |
| 글자 확대      | 100/150/200%               | 잘림, 겹침, 접근 불가 동작 0건      |
| 색각           | protan/deutan/tritan 필터  | 색 없이 선택·오답·완료 구분         |
| reduced motion | 시스템과 앱 설정           | 이동 제거, 정보 손실 0건            |
| 한 손          | Compact 기기 오른손·왼손   | 주 입력과 삭제에 grip 변경 불필요   |
| 연출 건너뛰기  | 단어·보드 완료 중 탭       | 상태 손실 없이 즉시 다음 입력       |

Apple의 빈번한 게임 조작 44×44pt 권고와 Android 48×48dp 접근성 목표를 적용한다. 8×8과 9×9의 축소 격자는 단독 터치 경로로 인정하지 않는다.

## 성능과 안정성

### 측정 시나리오

1. cold install 후 첫 실행
2. warm start 20회
3. 9×9 보드 15분 연속 플레이
4. 단어 완료 연쇄 10회
5. 광고 열기·닫기 20회
6. background 30초·5분·30분 후 복귀
7. 저속 네트워크와 offline 전환
8. font 200%와 screen reader 동시 사용

### 출시 기준

- Android는 Play Android vitals, iOS는 App Store Connect crash report를 source로 crash-free users 99.5% 이상과 Android ANR 0.3% 미만을 목표로 한다. AIT는 provider 확인 전 local unclean-session recovery 비율을 별도 proxy로 본다.
- Save v2는 `game_save_write_result`의 attempt 대비 success를 분모로 write 성공 99.9% 이상, 진행 소실 재현 0건을 목표로 한다.
- AIT 플랫폼 하드 기준인 최초 화면 10초 이내와 `.ait` 압축 해제 100MB 미만을 지킨다.
- 프로젝트 내부 출시 차단 기준은 저사양 상호작용 5초, 활성 연출 average 30fps 미만, memory 200MB 초과다. Unity 성능 문서의 수치를 AIT 전체 정책 하드 제한으로 표현하지 않는다.
- 내부 목표인 P75 2.5초, 기준 기기 60fps, 저사양 120MB를 별도로 본다.
- 단어 완료, asset streaming, shader compile을 포함한 5분 trace에서 기준 기기는 P90≤18ms·P99≤33ms·100ms hitch≤1, 저사양은 P90≤33ms·P99≤50ms·hitch≤2를 통과해야 한다. input-to-next-paint p95≤80ms, WebGL context loss 0회도 함께 요구한다.
- 정적 단서 읽기에서는 loop가 감속되고 background에서는 중단되어야 한다.
- 흰 화면, 오디오 중복, 입력 focus 소실, 광고 후 scene 정지 0건이다.
- 성능 trace에는 app version, content version, device tier만 남기고 개인 식별자를 넣지 않는다.

위 KPI는 BLK-OBS-001이 닫힌 뒤에만 출시 판정에 쓴다. 구현 gate는 시장별 source 연결, save write attempt/success/failure instrumentation, app·content version denominator, BigQuery 검증 SQL, dashboard와 alert의 synthetic failure 검증이다.

## 개인정보 정책과 연령등급

### 데이터 맵

| 데이터              | 목적                 | 저장                | 전송                    | 삭제                        |
| ------------------- | -------------------- | ------------------- | ----------------------- | --------------------------- |
| 퍼즐 진행·설정      | 이어하기             | 기기 로컬           | 출시 최소 범위에는 없음 | 앱 내 초기화·앱 삭제        |
| 분석 이벤트         | 퍼널·품질            | Firebase/AppsInToss | SDK adapter             | 정책에 따른 보관·삭제 요청  |
| 광고 이벤트·광고 ID | 보상·광고 측정       | 광고 SDK            | AIT/AdMob               | SDK와 플랫폼 정책           |
| AIT game user key   | AIT 게임 식별·호환성 | AIT Storage adapter | 필요 기능 adapter만     | raw key 분석 금지·정책 경로 |
| 오류 제보           | 콘텐츠 수정          | 이슈 처리 시스템    | 동의한 본문만           | 지원 정책                   |
| 알림 동의           | 재방문 안내          | 플랫폼·AIT          | 해당 adapter            | 플랫폼 설정                 |

- 정답 입력 문자열, 단서 자유 입력, 로컬 save 원문은 분석으로 보내지 않는다.
- iOS Analytics의 IDFA 없는 variant는 후보 기본값으로 유지하되, 최종 release archive의 privacy report, Google Mobile Ads SDK manifest, 수집·tracking 선언을 다시 읽고 App Store Connect 저장 전에는 개인정보 답변을 완료로 보지 않는다.
- Android Data safety, Apple App Privacy, AIT 개인정보 항목을 같은 데이터 맵에서 생성한다.
- 아동 대상 카테고리로 포지셔닝하지 않는다. 광고·분석 SDK와 콘텐츠를 실제 기능 기준으로 연령등급 설문에 반영한다.
- 개인정보처리방침 링크, 광고 개인화 설정, 데이터 초기화 경로를 앱 안에서 접근 가능하게 한다.

## 스토어와 정책

| Gate       | AppsInToss                                       | Google Play                     | App Store                                     |
| ---------- | ------------------------------------------------ | ------------------------------- | --------------------------------------------- |
| 광고       | 예기치 않은 노출 금지, 선로딩, 보상 완료 후 지급 | 시작·콘텐츠 도중 방해 광고 금지 | 적절성, 닫기 가능, 개인정보 고지              |
| 빌드       | CSR/SSG, `.ait`, 시작·FPS·memory                 | target API, AAB, Play signing   | archive, TestFlight, export compliance        |
| 메타데이터 | 게임 설명, 로고, 썸네일, 스크린샷                | listing, Data safety, IARC/GRAC | listing, App Privacy, age rating, review note |
| 콘텐츠     | 사행·오해 소지 없음                              | 저작권·광고·가족 정책           | 4.2 최소 기능과 저작권                        |
| 심사 증거  | QR 실기기 영상                                   | internal/closed test 결과       | TestFlight와 review account 불필요 설명       |

현재 저장소의 Play Data safety·등급·GRAC 및 App Store privacy·등급·심사 연락처 일부는 콘솔 입력이 끝나지 않았다. 신규 게임 기능과 SDK 기준으로 다시 작성하고 실제 콘솔 저장을 확인하기 전 gate를 닫지 않는다.

정책 기준:

- [AppsInToss 게임 출시 체크리스트](https://developers-apps-in-toss.toss.im/checklist/app-game.html)
- [Google Play 광고 정책](https://support.google.com/googleplay/android-developer/answer/9857753)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

## 출시 포지셔닝과 획득

### 포지셔닝

> 매일 한 판, 낱말로 되살리는 작은 세계

스토어 소재는 `격자 전 → 단어 완성 → 길과 세계 복원`의 연속 장면을 첫 3장에 보여준다. 캐릭터 수집만 강조하거나 실제 플레이보다 큰 세계 탐험을 약속하지 않는다.

### 크리에이티브 가설

| ID     | 메시지                        | 소재                  | 성공 신호                      |
| ------ | ----------------------------- | --------------------- | ------------------------------ |
| UA-001 | 정답이 길이 된다              | 6초 전후 비교 영상    | product page→install 상대 우위 |
| UA-002 | 한국어 단서의 손맛            | 단서와 교차 연쇄 영상 | 첫 입력 도달률                 |
| UA-003 | 광고에 끊기지 않는 하루 한 판 | 차분한 완주 영상      | 리뷰 광고 불만 감소            |

- AIT는 미니앱 카드와 썸네일이 첫 복원 장면을 정확히 반영해야 한다.
- 스토어 스크린샷은 실제 release build에서 캡처하고 합성 UI를 쓰지 않는다.
- 유료 획득 확대는 D1과 콘텐츠 오류 기준을 통과한 뒤 검토한다.

## 현지화와 고객지원

- 공통 구조는 다국어 대응이지만 출시 퍼즐 콘텐츠는 `contentLocale=ko-KR` 하나다. UI catalog도 별도 번역 승인이 없어 `supportedUiLocales=[ko-KR]`로 출시한다.
- 코드, 이벤트, schema ID와 UI message ID는 영문 안정 키를 사용한다. UI catalog 누락은 runtime에서 `ko-KR` fallback하되 release gate에서는 실패다.
- Play/App Store repo-local listing은 현재 `ko-KR`만 존재한다. listing locale 확대와 국가·지역 availability는 서로 별도이며 이번 사용자 승인으로 바꾸지 않는다.
- 단서의 띄어쓰기, 외래어 표기, 복수 정답, 시대 변화는 국립국어원 기준과 편집 원칙을 기록한다.
- 오류 제보 유형은 `정답`, `단서`, `표기`, `중복`, `불쾌한 내용`, `기술 오류`로 고정한다.
- 모든 제보에는 puzzle ID와 entry ID를 자동 첨부하고 사용자가 본문 전송 여부를 선택한다.
- 치명 콘텐츠 오류는 4시간 내 비노출, 24시간 내 수정 또는 대체를 운영 목표로 한다.
- 저장 소실, 광고 보상 누락, 결제 후보 상품 문의는 별도 매크로와 escalation owner를 둔다.
- 향후 locale은 직역하지 않고 별도 word bank, clue editor, 난이도 모델, 라이선스, 콘텐츠 예산과 원어민 QA를 승인받는다.
- compact/reference/tablet에서 `ko-KR` 실제 copy와 1.35× pseudo-locale을 사용해 overflow, focus order, screen reader label, bitmap baked text 0건을 확인한다.

## 소프트론칭

### 단계

| 단계   | 대상                                                      |     기간 | 목적                    | 진입 조건                        |
| ------ | --------------------------------------------------------- | -------: | ----------------------- | -------------------------------- |
| 0 내부 | 팀·초대 30~50명                                           |      1주 | 저장, 광고, 콘텐츠 오류 | 모든 자동 gate 통과              |
| 1 제한 | AIT sandbox·검수 + Play closed + TestFlight               |      2주 | FTUE와 성능             | 치명 결함 0건                    |
| 2 확대 | Play 10% + App Store phased release, AIT는 검수 상태 유지 |      1주 | crash와 migration       | crash-free 99.5%                 |
| 3 판단 | Play 50% + App Store 단계 확대, AIT 공개 후보             | 2주 이상 | D1/D7과 경제            | 코호트 500명 확보 또는 기간 연장 |
| 4 전체 | AIT 공개 + Play 100% + App Store phased release 완료      |  승인 후 | 정식 운영               | 모든 론칭 gate 통과              |

### 지표 판정

- 24시간: cold start, crash, save, 광고 보상, 콘텐츠 오류
- 72시간: 첫 입력, FTUE 완료, 보드 완료, abandon
- 8일: D1, D7, 스트릭, 재화 source·sink
- 표본이 500명 미만이면 잔존 수치를 출시 성공으로 단정하지 않고 사용성·오류 근거와 함께 본다.
- 기존 GA4의 작은 표본은 방향성 baseline으로만 사용한다.

## 론칭 게이트

| Gate ID         | 조건                                                                    | 증거                                  | 차단 수준 |
| --------------- | ----------------------------------------------------------------------- | ------------------------------------- | --------- |
| GATE-CONTENT-01 | manual·provenance·hash 100%, 93개 수량·theme·금요일 hard 계약 일치      | staging+live schema·inventory audit   | 치명      |
| GATE-CORE-01    | core, game, bridge, golden parity 통과                                  | CI run                                | 치명      |
| GATE-MARKET-01  | AIT/Android/iOS 동일 정책                                               | 세 runtime E2E transcript             | 치명      |
| GATE-SAVE-01    | tag별 v2 migration·dual-write·leapfrog·rollback 100%                    | fixture+세 runtime                    | 치명      |
| GATE-A11Y-01    | AC-005 AIT Android·AIT iOS·Play Android·App Store iOS 완료              | 네 runtime 영상·발화 기록             | 치명      |
| GATE-I18N-01    | ko-KR launch pack·catalog, locale/profile/save 경계, pseudo-locale 통과 | schema audit+CI+세 runtime transcript | 치명      |
| GATE-BOOT-01    | OFF·cached ON·손상 chunk·offline marker에서 legacy 복구                 | 세 시장 host watchdog E2E             | 치명      |
| GATE-PERF-01    | 외부 상한과 내부 목표 충족                                              | trace report                          | 치명      |
| GATE-ADS-01     | 첫 세션 request 0, 보상 원자성                                          | SDK log                               | 치명      |
| GATE-PRIV-01    | 세 시장 데이터 고지 저장 확인                                           | 콘솔 캡처                             | 치명      |
| GATE-STORE-01   | listing·등급·심사·빌드 완료                                             | 각 콘솔 상태                          | 치명      |
| GATE-UX-01      | 첫 입력 테스트 10명 중 8명 이상                                         | usability report                      | 높음      |
| GATE-OPS-01     | monitor, alert, rollback rehearsal                                      | 운영 runbook                          | 치명      |
| GATE-OBS-01     | crash·ANR·save KPI 측정 가능                                            | source·SQL·dashboard synthetic test   | 치명      |

완료 명령의 최소 기준은 `npm run check:release-parity`, `npm run build`, `npm run check:mobile`을 함께 통과하는 것이다. 게임 전용 명령이 추가되면 같은 static gate에 포함한다.

`GATE-MARKET-01`은 fixture만으로 닫지 않는다. 동일 puzzle, config snapshot, Save v2를 AIT, Android, iOS release runtime에 주입해 최종 core state, locale-aware save envelope와 progress checksum, canonical analytics transcript, 광고 transaction 결과를 비교한다.

## 롤백과 운영

### 런타임 롤백

- `game_runtime_enabled`를 시장·버전 조건으로 끄면 legacy 화면으로 돌아가게 하고, leapfrog upgrade와 단계 배포 지표가 닫힐 때까지 legacy runtime을 제거하지 않는다.
- Save v2는 legacy key를 leapfrog upgrade 성공 전까지 보존한다. `cellValues`, `earnedHintCredits`, `hintCount`는 세 시장에 계속 projection한다. Web/AIT만 현재 읽는 `revealUsed`·`tentativeCells`는 mobile legacy reader와 write effect를 먼저 보정한 뒤 공통 projection하며, 그 전에는 mobile 신규 runtime을 켜지 않는다. 시장별 기존 mission·streak·completion·settings key도 tag fixture 기준으로 보존하고, 실제 reader가 읽지 못하는 필드만 v2 namespace에 둔다.
- 신규 런타임을 끄더라도 완료·재화 ledger를 삭제하지 않는다.
- host는 2초 안에 fetched→validated cache→bundled false 순으로 config를 확정하고, boot marker durable ack를 최대 1초 기다린 뒤에만 import한다. 5초 boot watchdog·직전 `game_boot_pending` marker로 cached ON 상태의 crash·white screen도 legacy로 복구한다. config timeout, marker write failure, 손상 chunk와 멈춘 bridge를 주입한 세 시장 release E2E가 통과하기 전 SEV-0 롤백을 약속하지 않는다.

### 콘텐츠 롤백

- manifest는 immutable pack과 `current` pointer를 분리한다.
- 오류 pack은 이전 검증 pack으로 pointer를 되돌리고 CDN cache purge 뒤 공개 URL을 재검증한다.
- 단일 퍼즐 오류는 해당 날짜를 검수된 예비 보드로 교체하고 사용자 기록은 원래 puzzle ID에 보존한다.

### 운영 대응

| 심각도 | 예시                              | 첫 행동                               | 목표 시간 |
| ------ | --------------------------------- | ------------------------------------- | --------: |
| SEV-0  | 진행 대량 소실, 잘못된 보상 결제  | rollout 중지, runtime OFF, owner 호출 |      15분 |
| SEV-1  | 실행 불가, 광고 보상 누락 다수    | 영향 시장 중지, fallback              |      30분 |
| SEV-2  | 퍼즐 단서 오류, 일부 기기 UI 차단 | 보드 비노출 또는 hotfix               |     4시간 |
| SEV-3  | 표현·연출·사소한 통계 오류        | backlog와 다음 patch                  |   2영업일 |

롤백 rehearsal은 출시 전 실제 Remote Config, Hosting pointer, Play staged rollout, App Store phased release, AIT 공개 중지 절차에서 한 번씩 수행하고 시간과 결과를 기록한다.
