# 결정 로그

- 제품명: `말길: 가로세로 모험` (제안명)
- 문서 상태: draft
- 소유자: Product Owner
- 버전/수정일: v0.2 / 2026-07-17
- Source of truth: 게임 전환 제안의 결정 상태와 blocker는 이 문서가 소유한다.
- Depends on: `00-product-brief.md`~`07-qa-launch-plan.md`
- Open blockers: 이 문서의 Blocker 원장 전체. 우선순위는 `BLK-CONTENT-001`, `BLK-ENG-001`, `BLK-SOURCE-001`, `BLK-AUDIENCE-001`, `BLK-OBS-001`
- 승인 근거: 부분 승인 — 2026-07-17 사용자 메시지 `구조 다국어, 출시 콘텐츠 한국어 동의.` (`DEC-015`); 그 외 결정은 사용자 승인 전

## 상태 정의

| 상태    | 의미                                           |
| ------- | ---------------------------------------------- |
| 고정    | 저장소 지침이나 현재 제품 계약으로 유지해야 함 |
| 제안    | 계획서에 구체안이 있으나 사용자 승인 전        |
| 검증 중 | 수직 슬라이스나 데이터 결과로 닫아야 함        |
| 기각    | 근거와 함께 범위에서 제외                      |

## 결정 원장

### DEC-001 제품 정체성

- 상태: 제안
- 날짜: 2026-07-17
- 결정: 작업명 `말길: 가로세로 모험`, 핵심 판타지 `낱말로 끊긴 길과 작은 세계를 복원`을 채택한다.
- 근거: 경쟁작은 정통 풀이, 수집 메타, 스와이프 라이브옵스로 양분되어 있고 한국어 저자형 단서와 퍼즐 topology 기반 세계 변화의 결합은 약하다.
- 영향: 단어와 교차점이 모든 핵심 연출과 지도 진행의 원인이 된다.
- 되돌림 조건: 10명 수직 슬라이스 테스트에서 6명 미만이 정답과 세계 변화의 인과를 설명한다.
- 승인자: 사용자

### DEC-002 엔진과 프레젠테이션 경계

- 상태: 제안
- 날짜: 2026-07-17
- 결정: Phaser 4.2.1을 우선 후보로 하고 React 접근성 계층과 `packages/crossword-core`를 유지한다.
- 근거: TypeScript core 직접 재사용, AIT Vite 호환, 한글 IME와 DOM 접근성이 현재 저장소의 가장 큰 제약과 맞는다.
- 영향: Android/iOS는 RN local WebView와 `game_bridge_v1`을 사용한다.
- 중단 조건: Phase 0에서 IME, screen reader, resume, 성능 중 하나의 치명 gate를 통과하지 못하면 Phaser 채택을 확정하지 않는다.
- 보정·대안: IME·screen reader 실패는 DOM semantics, focus handoff, RN host 경계를 먼저 보정해 다시 검증한다. WebView 수명주기·WebGL·시작 성능 실패가 bounded remediation 뒤에도 남을 때 Godot 4.6.3 + GDScript 수직 슬라이스를 비교하고 golden fixture로 정책 패리티를 검증한다.
- 승인자: 사용자 + Tech Lead

### DEC-003 코어와 3마켓 패리티

- 상태: 고정
- 날짜: 2026-07-17
- 결정: 기능 정책, 퍼즐 선택, Remote Config, telemetry는 `packages/crossword-core`가 먼저 소유하고 시장별 SDK는 adapter로만 분리한다.
- 근거: `AGENTS.md`, `docs/market-parity.md`
- 영향: 엔진 package에 Firebase, AdMob, AppsInToss SDK를 직접 import하지 않는다.
- 되돌림 조건: 없음. 저장소 정책 변경은 별도 사용자 지시가 필요하다.
- 승인자: Repository Owner

### DEC-004 입력 모델

- 상태: 검증 중
- 날짜: 2026-07-17
- 결정: 한글 직접 입력을 기본으로 유지하고 첫 답의 음절 탭과 쉬운 입력 모드를 보조로 제공한다. 드래그는 필수 조작으로 사용하지 않는다.
- 근거: 기존 제품의 직접 입력 가치, 현재 첫 입력 전 이탈, 장년층·접근성 요구를 함께 보존한다.
- 영향: DOM/native IME와 48dp 단어 집중 스트립이 필요하다.
- 되돌림 조건: A/B 테스트에서 다른 방식이 첫 입력 도달률을 10%p 이상 높이고 완료율을 낮추지 않는다.
- 승인자: Product + UX

### DEC-005 실패와 난이도

- 상태: 제안
- 날짜: 2026-07-17
- 결정: 현재 일일 3회 시도 상한을 신규 runtime에서 제거하고 시간 제한 없는 완료를 보장한다. 사용자 승인 전에는 현행 3회를 유지한다. 난이도는 희귀 단어보다 교차 제약과 단서 간접성으로 조정한다.
- 근거: 지식 퍼즐 신뢰와 접근성을 보존하고 현재의 세션 종료 장벽을 없앤다.
- 영향: 기존 mission의 시도 상한을 Save v2 migration에서 폐기한다.
- 되돌림 조건: 무제한 시도가 콘텐츠 소비와 광고 악용을 유의미하게 만든다는 데이터가 확인될 때 보상만 조정한다.
- 승인자: 사용자

### DEC-006 수익화 경계

- 상태: 제안
- 날짜: 2026-07-17
- 결정: 첫 세션 광고 금지, 선택형 보상 광고만 출시하고 결과 전면 광고 호출 경로, 구독·확률형·유료 힌트는 범위에서 제외한다. 기존 kill switch는 false로 유지한다.
- 근거: 경쟁작 최근 리뷰의 과도한 광고 불만과 현재 저장소의 기본 설정을 반영한다.
- 영향: 무료 대체 힌트, 광고 transaction ledger, 정확한 lifecycle 분석이 필요하다.
- 되돌림 조건: 소프트론칭 후 광고를 늘리지 않고 운영 지속성이 부족할 때 사용자 승인 아래 고정형 광고 제거·꾸미기 상품을 검토한다.
- 승인자: 사용자

### DEC-007 콘텐츠 발행 gate

- 상태: 제안
- 날짜: 2026-07-17
- 결정: 상용 게임 pack은 `needsManualClue`가 명시적 `false`인 entry 100%, fail-closed schema, 라이선스 원장, generator commit, config hash, checksum을 갖춰야 한다.
- 근거: 현행 repo 허용치는 미검수 40%이고, 2026-07-17 live manifest의 1,831개 entry 전부가 수동 검수 표시를 통과하지 못했으며 운영 난이도 프로필이 main과 달랐다. 0%는 신규 게임 목표다.
- 영향: Cloud Run 재배포와 live URL 재검증이 Phase 0A 선행 조건이다.
- 되돌림 조건: 품질 gate 자체는 낮추지 않는다. 처리량 부족 시 일정과 재고만 조정한다.
- 승인자: Product + Content + Tech

### DEC-008 저장과 전환

- 상태: 제안
- 날짜: 2026-07-17
- 결정: 기존 앱을 즉시 교체하지 않고 Save v2의 backup, checksum, idempotent migration, legacy 엽서를 제공한다.
- 근거: 스트릭과 기록을 잃는 비용이 큰 퍼즐 장르이며 현재 Web과 mobile 저장 계약에 차이가 있다.
- 영향: legacy runtime, reader, key를 leapfrog upgrade와 단계 배포 성공이 확인될 때까지 유지한다. 출시 범위에는 재설치·기기 이전 복구가 없다.
- 되돌림 조건: 없음. 데이터 보존 범위를 줄이는 변경은 별도 사용자 승인과 공지가 필요하다.
- 승인자: 사용자 + Tech Lead

### DEC-009 Game Center와 소셜

- 상태: 제안
- 날짜: 2026-07-17
- 결정: AIT Game Center와 경쟁 기능은 출시 최소 범위에서 제외한다.
- 근거: Game Center 프로필 선행 요구가 첫 입력 활성화 목표와 충돌하며 공개 JSON은 경쟁 점수의 보안 경계가 될 수 없다.
- 영향: 첫 12주는 개인 지도, 컬렉션, 주간 도전에 집중한다.
- 되돌림 조건: local-first 저장 이후 계정·서버 권위·부정행위 모델이 승인된다.
- 승인자: 사용자

### DEC-010 제작 순서

- 상태: 제안
- 날짜: 2026-07-17
- 결정: `운영 콘텐츠 정상화 → 엔진 수직 슬라이스 → 공통 shell·bridge → 제품 수직 완성 → 콘텐츠 양산 → 소프트론칭` 순서로 진행한다.
- 근거: 현재 운영 데이터 드리프트와 엔진 입력·접근성 위험을 양산 전에 제거해야 한다.
- 영향: Phase 0 gate를 통과하기 전 대량 아트와 93개 보드를 제작하지 않는다.
- 되돌림 조건: 없음. 단계 기간은 실제 처리량에 따라 조정할 수 있다.
- 승인자: 사용자 + Producer

### DEC-011 단계적 기능 해금

- 상태: 제안
- 날짜: 2026-07-17
- 결정: 첫 세션에는 퍼즐과 세계 변화만 보이고, 오늘의 보드, 컬렉션, 주간 도전 순으로 기능을 연다.
- 근거: 경쟁작의 단계적 해금은 첫 화면 과부하를 줄이며 현재 제품은 첫 입력 전 이탈이 크다.
- 영향: 메뉴와 알림 badge를 첫 실행에 한꺼번에 노출하지 않는다.
- 되돌림 조건: 사용성 테스트에서 단계 해금이 다음 목표 이해를 낮추거나 핵심 시작률을 개선하지 못한다.
- 승인자: Product + UX

### DEC-012 접근성 계약

- 상태: 고정
- 날짜: 2026-07-17
- 결정: 축소 격자를 유일한 터치 경로로 사용하지 않고 48dp 단어 집중 입력, 단서 목록, VoiceOver/TalkBack 탐색을 제공한다.
- 근거: Apple 44×44pt와 Android 48×48dp 기준을 8×8·9×9 Compact 격자만으로 충족할 수 없다.
- 영향: 선택한 engine canvas 외부에 접근성 semantics와 한글 입력 계층이 필요하다.
- 되돌림 조건: 접근성 범위를 줄이지 않는다. 렌더링 기술은 같은 결과를 만족하는 범위에서 바꿀 수 있다.
- 승인자: Product + UX + QA

### DEC-013 힌트 기본값

- 상태: 검증 중
- 날짜: 2026-07-17
- 결정: 사용자 승인 전에는 현재 easy 2, normal 3, hard 5를 유지한다. 모든 난이도 3개 단일화는 첫 입력·완료·힌트 소진 데이터를 비교한 뒤 판단한다.
- 근거: 현재 core와 Remote Config가 난이도별 값을 이미 소유하며 임의 단일화는 기존 밸런스를 바꾼다.
- 영향: 신규 runtime은 세 난이도 key를 모두 읽고 세 시장 normalized config가 같아야 한다.
- 되돌림 조건: flat 3이 어느 난이도에서도 완료율을 낮추거나 광고 의존을 10%p 이상 올리면 현행값을 유지한다.
- 승인자: 사용자 + Game Design

### DEC-014 복귀 알림 패리티

- 상태: 제안
- 날짜: 2026-07-17
- 결정: 현재 AIT만 구현된 `return_reminder_enabled=true` 동의 유도는 신규 runtime에서 세 시장 adapter가 준비될 때까지 기본 OFF로 둔다.
- 근거: 한 시장만 첫 완료 뒤 권한 흐름이 달라지는 현재 패리티 부채를 신규 runtime에 승계하지 않는다.
- 영향: Android·iOS notification adapter, 카피, privacy가 승인된 뒤 동일 core prompt 정책으로 다시 켠다.
- 되돌림 조건: 세 시장 adapter와 E2E가 먼저 통과하면 출시 시점부터 동일하게 ON할 수 있다.
- 승인자: 사용자 + Product + Privacy

### DEC-015 다국어 구조와 출시 콘텐츠 언어

- 상태: 고정
- 날짜: 2026-07-17
- 결정: 공통 구조는 `uiLocale`과 `contentLocale`을 분리하는 다국어 대응형으로 만들고, 최초 출시 콘텐츠 pack은 `ko-KR`만 제공한다. 출시 UI catalog도 추가 번역·검수 승인이 있기 전에는 `ko-KR`만 포함한다.
- 근거: 사용자 메시지 `구조 다국어, 출시 콘텐츠 한국어 동의.` 현재 제품의 한국어 콘텐츠 신뢰를 지키면서 후속 언어가 코어 재작성 없이 독립 pack으로 추가될 수 있어야 한다.
- 영향: core에 locale별 `LanguageProfile` port를 두고, content schema·저장 namespace·분석·asset/copy·QA를 locale-aware로 만든다. 언어 선택 UI는 두 번째 완성 catalog가 생길 때까지 숨긴다.
- 금지: 다른 언어 콘텐츠를 한국어의 직역으로 만들거나, content pack 누락 시 다른 언어 정답·단서를 조용히 섞지 않는다.
- 확장 조건: 새 `contentLocale`은 별도 word bank, 원어민 단서 편집, 난이도 모델, 라이선스, 전체 콘텐츠 예산과 실기기 QA가 승인된 뒤 추가한다.
- 승인자: 사용자 (2026-07-17)

### DEC-016 normal 단어 난이도 상한

- 상태: 검증 중
- 날짜: 2026-07-19
- 결정: `normal` 보드는 `easy`와 `normal` 어휘만 사용하며, 후보 풀이 부족해도 `hard` 어휘로 자동 보강하지 않는다. `hard` 난도는 단어 희귀도보다 격자 크기·교차 제약·단서 간접성으로 구분한다.
- 근거: 첫 25판 편집 pre-screen에서 normal 보드에 전문·비일상 어휘가 집중된 결함이 확인됐고, GDD의 "희귀 단어 수로 난이도를 올리지 않는다" 원칙과 충돌했다.
- 영향: 공통 core의 난이도 프로파일과 출시 90판의 생성기 report·독립 validator가 같은 상한을 fail-closed 검증한다. AIT·Android·iOS는 동일 콘텐츠 계약을 사용한다. 2시간 운영 배치의 실제 단어 선택에도 상한은 적용되지만, 기존 84개 rolling pack을 새 정책으로 오표기하지 않는 per-item cutover evidence는 `BLK-CONTENT-002`로 분리한다.
- 검증 조건: 새 generator identity로 90판을 완주하고, normal 70판의 모든 실제 entry가 `easy|normal`이며 사람 검수의 `difficultyFit=true`를 받아야 한다. 운영 배치는 cutover 이후 신규 item을 strict 검증하고 기존 item이 84개 retention에서 자연 퇴출되는 migration을 별도 통과해야 한다.
- 되돌림 조건: 90판 생성 중 normal 풀이 구조적으로 고갈되면 hard 어휘를 섞지 않고 wordbank 보강 또는 배치 탐색 정책을 먼저 수정한다.
- 승인자: 기존 GDD 난이도 원칙의 구현 상세(Content + QA); 90판 검수 전 최종 확정 금지

## Blocker 원장

| ID               | 질문 또는 증거             | 닫는 조건                                                                              | 소유자          |
| ---------------- | -------------------------- | -------------------------------------------------------------------------------------- | --------------- |
| BLK-NAME-001     | 작업명 사용 가능성         | 상표·스토어 중복 조사와 사용자 승인                                                    | Product         |
| BLK-ENG-001      | Phaser 세 시장 적합성      | Phase 0 성능·IME·접근성·복귀 통과                                                      | Tech            |
| BLK-INPUT-001    | 직접 입력과 쉬운 입력 비중 | 10명 테스트와 A/B 결과                                                                 | UX              |
| BLK-CONTENT-001  | live pack 무결성           | 검수 후보 생성기·fail-closed schema·image digest·live audit                            | Content/Ops     |
| BLK-CONTENT-002  | 배치 난이도 evidence       | per-item cutover 봉인·신규 item strict 검증·기존 84개 무중단 자연 퇴출                 | Content/Ops     |
| BLK-MON-001      | 출시 수익화 범위           | 카탈로그와 노출 정책 사용자 승인                                                       | Product         |
| BLK-CAP-001      | 93개 보드 생산성           | 2주간 10개 보드 처리량 측정                                                            | Producer        |
| BLK-A11Y-001     | 엔진과 WebView 접근성      | AC-005 실기기 완료 영상                                                                | UX/QA           |
| BLK-BRIDGE-001   | RN local WebView 안정성    | resume·광고·저장 20회 반복 통과                                                        | Client          |
| BLK-ART-001      | 종이 세계 스타일           | style frame 3종과 무음 인과 테스트 승인                                                | Art             |
| BLK-CHAR-001     | 안내자 `마루`              | silhouette·상표 유사성 승인                                                            | Art/Product     |
| BLK-AUDIO-001    | 음악·효과음 방향           | 15분 피로도 테스트                                                                     | Audio           |
| BLK-LICENSE-001  | 아트·폰트·음원 권리        | asset manifest 권리 원장 완성                                                          | Producer        |
| BLK-LEGAL-001    | 사전 데이터 파생물 범위    | CC BY-SA 표시·동일조건 법무 검토                                                       | Legal           |
| BLK-PRIVACY-001  | SDK 데이터 고지            | 세 시장 데이터 맵과 정책 승인                                                          | Privacy         |
| BLK-STORE-001    | 실제 콘솔 메타데이터       | AIT·Play·App Store 저장 상태 캡처                                                      | Release         |
| BLK-SOURCE-001   | 기존 Obsidian 기획 매핑    | `DEC-015` 동기화 완료, 나머지 유지·변경 항목 승인·동기화                               | Product         |
| BLK-AUDIENCE-001 | 연령·타깃·등급             | release SDK report와 세 시장 콘솔 입력                                                 | Product/Release |
| BLK-ORIENT-001   | tablet landscape 후보      | native 설정·IME·광고·복귀·스토어 소재 통과                                             | UX/Client       |
| BLK-OBS-001      | crash·ANR·save KPI 분모    | 시장별 source·v2 event·BigQuery SQL·alert 검증                                         | Tech/Analytics  |
| BLK-RES-001      | 경쟁작 직접 조작 근거      | 대표 5개 제품의 첫 10분 설치 플레이 기록                                               | Research        |
| BLK-RES-002      | 공개 리뷰 표본 편향        | 정량으로 쓰지 않고 반복 theme로만 사용                                                 | Research        |
| BLK-RES-003      | 제품 제안 승인             | DEC-001·002·006 사용자 승인                                                            | Product         |
| BLK-I18N-001     | 다국어 구조 구현           | locale registry·LanguageProfile·content/save namespace·pseudo-locale·3마켓 parity 통과 | Client/Content  |

## 다음 승인 묶음

사용자가 먼저 승인할 항목은 다음 여섯 가지다.

`DEC-015`의 다국어 대응 구조와 한국어 출시 콘텐츠는 2026-07-17 승인되어 이 묶음에서 제외한다.

1. DEC-001의 세계 복원 콘셉트와 작업명 방향
2. DEC-002의 Phaser 우선 수직 슬라이스
3. DEC-005의 일일 시도 상한 제거
4. DEC-006의 첫 세션 무광고·선택형 보상 광고 경계
5. DEC-007의 수동 검수 100% 발행 gate와 DEC-013의 힌트 현행값 유지
6. DEC-014의 신규 runtime 복귀 알림 기본 OFF

승인 뒤에도 문서 상태는 승인 범위와 날짜가 기록될 때만 `approved`로 바꾼다.
