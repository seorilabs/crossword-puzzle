# 경제 콘텐츠 라이브옵스

- 제품명: `말길: 가로세로 모험` (제안명)
- 문서 상태: draft
- 소유자: Game Economy / Content Operations
- 버전/수정일: v0.2 / 2026-07-17
- Source of truth: 재화 수치, 콘텐츠 재고, 보상 일정, 수익화 카탈로그와 운영 설정은 이 문서가 소유한다.
- Depends on: `02-gdd.md`, `01-research-dossier.md`, `packages/crossword-core/src/launchConfig.ts`, `remoteconfig.template.json`
- Open blockers: `BLK-CONTENT-001`, `BLK-CAP-001`, `BLK-MON-001`, `BLK-LEGAL-001`, `BLK-I18N-001`
- 승인 근거: 부분 승인 — 2026-07-17 사용자 메시지 `구조 다국어, 출시 콘텐츠 한국어 동의.` (`DEC-015`); 그 외 결정은 사용자 승인 전

## 재화 Source와 Sink

| 재화        | 성격        | Source                                        | Sink                         | 손실 규칙           |
| ----------- | ----------- | --------------------------------------------- | ---------------------------- | ------------------- |
| 지도 조각   | 비소비 진행 | 각 보드 첫 완료 1개                           | 챕터 노드 자동 개방          | 차감 없음           |
| 기억잉크    | 소프트 재화 | 첫 완료, 주간 도전, 7일 완주                  | 길 색상, 발자국, 엽서 테두리 | 만료 없음           |
| 힌트 크레딧 | 세션 도움   | 현행 easy 2, normal 3, hard 5, 선택형 광고 +2 | 교차 후보 또는 글자 공개 1회 | 보드 종료 시 초기화 |
| 스트릭 보호 | 보호권      | 첫 7일 완료 1개, 이후 14일마다 1개            | 놓친 일일 보드 1일 보호      | 최대 2개            |

- 핵심 퍼즐, 지도 진행, 지식 카드는 결제나 광고가 없어도 모두 얻을 수 있다.
- 기억잉크는 능력치와 힌트에 쓰지 않는다. 꾸미기 선택만 넓힌다.
- 반복 완료로 재화를 무한 생성하지 않는다. 첫 완료 이후에는 기록 갱신과 숙련 배지만 준다.
- 힌트 크레딧이 0이어도 단서 다시 보기와 다음 퍼즐 진행은 막히지 않는다.

## 밸런스 모델

### 보드 보상식

첫 완료 기억잉크는 다음 식을 제안한다.

```text
reward = 10 + 2 × entry_count + min(10, 2 × longest_intersection_chain)
```

| 보드        | 단어 | 최대 연쇄 | 예상 기억잉크 |
| ----------- | ---: | --------: | ------------: |
| 첫 실행 5×5 |    4 |         2 |            22 |
| 쉬움 7×7    |    9 |         3 |            34 |
| 보통 8×8    |   10 |         4 |            38 |
| 어려움 9×9  |   13 |         5 |            46 |

힌트 사용, 오답, 완료 시간은 기본 보상을 깎지 않는다. 속도와 무힌트는 숙련 배지에만 반영해 지식 퍼즐의 압박을 낮춘다.

### 꾸미기 가격대

| 등급      | 가격 | 목표 획득 주기    | 예시                   |
| --------- | ---: | ----------------- | ---------------------- |
| 작은 변화 |  180 | 4~5회 표준 완료   | 잉크 색상 1개          |
| 중간 변화 |  360 | 8~10회 표준 완료  | 발자국·등불 세트       |
| 큰 변화   |  720 | 16~20회 표준 완료 | 애니메이션 엽서 테두리 |

첫 7일에는 작은 변화 1개를 살 수 있고, 중간 변화는 정상 플레이 기준 2주차 초반에 도달하게 한다. 모든 상품을 빠르게 소진하지는 않게 한다.

### 경제 안전 규칙

- 첫 완료 보상은 `profile_scope + content_locale + puzzle_id + reward_type`의 안정적인 grant ID로 중복 지급을 막는다. 재완료 index를 지급 키에 쓰지 않는다. 후속 locale 간 잔액 공유 여부는 두 번째 locale 승인 전에 별도 결정한다.
- Remote Config 값이 파싱되지 않으면 앱에 내장된 보수적 기본값을 쓴다.
- 재화 잔액을 음수로 만들지 않는다.
- 콘텐츠 업데이트로 가격이 바뀌어도 이미 산 꾸미기를 회수하지 않는다.
- 서버 권위 계정이 없는 출시 버전에서는 경쟁 보상을 두지 않는다.

## 보상 일정

| 시점             | 보상                     | 목적             | 표시 방식          |
| ---------------- | ------------------------ | ---------------- | ------------------ |
| 첫 단어          | 길 복원 연출             | 조작 학습        | 즉시, 숫자 없음    |
| 첫 보드          | 지도 조각 1, 기억잉크 22 | 지도와 경제 소개 | 결과 카드 1장      |
| 일일 첫 완료     | 보드 식에 따른 기억잉크  | 일일 의식        | 결과에 합산        |
| 챕터 장소 완료   | 엽서와 지식 카드         | 수집             | 세계 변화 후 표시  |
| 7일 중 5일 완료  | 기억잉크 60              | 유연한 주간 목표 | 주간 카드          |
| 주간 어려움 완료 | 기억잉크 60, 전용 엽서   | 숙련 도전        | 결과 배지          |
| 7일 연속 완료    | 스트릭 보호 1            | 손실 완화        | 보관함에 직접 적립 |

로그인 보상 팝업은 사용하지 않는다. 보상은 관련 플레이 결과 안에서만 보여준다.

## 콘텐츠 재고

### 출시 재고

아래 수량과 약 210시간의 생산 예산은 모두 출시 `contentLocale=ko-KR` 전용이다. 공통 구조의 다국어 대응은 이 재고를 여러 언어로 번역한다는 뜻이 아니다.

| 묶음          | 보드 | 예상 entry | 역할                  |
| ------------- | ---: | ---------: | --------------------- |
| 첫 실행       |    3 |         15 | 입력, 교차, 힌트 학습 |
| 챕터 1~3      |   30 |        300 | 상시 진행             |
| 일일 runway   |   42 |        420 | 6주 소프트론칭        |
| 주 2회 보너스 |   12 |        120 | 선택형 광고 후보      |
| 주간 도전     |    6 |         78 | 고난도와 이벤트       |
| 합계          |   93 |     약 933 | 출시 최소 재고        |

중복과 테마 조합을 고려해 최소 1,100개의 검수 완료 단서·답 pool을 확보한다. 현재 저장소에 수동 검수 단서가 503개 있으므로 품질 재검수와 재사용 쿨다운 기준을 만족하는 신규 원고가 최소 약 600개 더 필요하다.

후속 locale은 한국어 pool을 번역해 공유하지 않는다. 언어마다 같은 93개 수량을 자동 요구하지는 않지만, 승인된 출시 재고·원어민 편집·난이도 모델·라이선스·QA와 독립 생산 예산이 있어야 별도 pack을 연다.

### 운영 공급

- 매월 일일 보드 30개, 주 2회 보너스 8개, 주간 도전 4개를 준비한다.
- 월 180개 이상의 신규 검수 단서를 추가하고 기존 단서는 30일 뒤 다른 교차 구조에서 제한 재사용한다.
- 중복·재사용 쿨다운·난이도 분포 report는 `contentLocale`별로 계산하며 다른 언어 pool을 같은 분모로 합치지 않는다.
- 일일 보드는 최소 21일 전에 초안, 14일 전에 1차 검수, 7일 전에 최종 빌드에 들어간다.
- 시사 문제는 게시 48시간 전 사실을 다시 검증하고 장기 archive에서는 대체한다.

## 콘텐츠 생산 예산

| 작업               |        단위 예산 | 출시 93개 추정 | 소유자           |
| ------------------ | ---------------: | -------------: | ---------------- |
| 단서 작성·교정     | entry당 평균 6분 |      약 93시간 | Writer/Editor    |
| 보드 생성·선별     |      보드당 25분 |      약 39시간 | Content Designer |
| 사실·라이선스 검수 |      보드당 20분 |      약 31시간 | Editor           |
| 플레이·난이도 QA   |      보드당 20분 |      약 31시간 | QA               |
| 장면 trigger 지정  |      보드당 10분 |      약 16시간 | Game Designer    |
| 합계               |        병렬화 전 |     약 210시간 | Producer         |

첫 2주 동안 10개 보드를 실제 처리해 단위 시간을 다시 측정한다. 처리량이 가정보다 낮으면 출시 일정을 조정하고 `needsManualClue` 허용치를 올리지 않는다.

### 발행 하드 게이트

1. `needsManualClue` 필드가 존재하고 값이 명시적 `false`인 entry 100%
2. 자기참조 단서 0개
3. 출처, 라이선스, 검수자, 검수일 100%
4. 격자 slot과 entry 일치 100%
5. `clueSource` allowlist, generator commit, config hash, content checksum 필수
6. 동일 답·유사 단서 30일 쿨다운 통과
7. 공개 후 운영 manifest 재다운로드 검증
8. 출시 pack 수량은 첫 실행 3, 챕터 30, 일일 42, 보너스 12, 주간 도전 6과 정확히 일치
9. 일일 42개는 비어 있지 않은 `themeId`를 가진 6개 주간 테마×7일로 구성하고, 각 금요일 6개는 `difficulty=hard`
10. 첫 실행 3개는 `easy`, 주간 도전 6개는 `hard`이며 챕터·보너스의 난이도 분포 report를 함께 승인
11. 출시 manifest와 모든 pack의 `contentLocale`·route·라이선스 원장이 `ko-KR`로 일치하고 다른 언어 entry가 섞이지 않음
12. `ko-KR/v1` profile, `answerCells`, `releaseTimeZone=Asia/Seoul`과 locale 포함 checksum 검증 통과

2026-07-17 운영 manifest 감사에서는 84개 퍼즐, 1,831개 entry가 모두 `needsManualClue=true`였고 테마 퍼즐이 0개였다. 현재 main의 발행 허용치는 40%이고 수동 검수 단서는 503개뿐이므로 main 재배포만으로 목표 0% pack을 만들 수 없다. 검수 후보 전용 생성기, fail-closed schema, staging 반복 검증, Cloud Run image digest 배포, 공개 데이터 재관측 순으로 정상화한다.

## 수익화 카탈로그

| 항목               | 출시 상태 제안 | 가격·보상                       | 노출 계약                              |
| ------------------ | -------------- | ------------------------------- | -------------------------------------- |
| 보상형 힌트        | 사용           | 광고 완료 시 힌트 +2            | 사용자가 힌트 화면에서 요청            |
| 보상형 보너스 보드 | 주 2회 후보    | 검수된 추가 보드 1개            | 공급 재고가 있을 때만 완료 뒤 선택     |
| 결과 전면 광고     | 범위 제외      | 보상 없음                       | 별도 데이터와 사용자 승인 전 호출 금지 |
| 영구 광고 제거     | 후보           | 스토어 가격 사용자 승인 후 입력 | 주간 콘텐츠 생산성 입증 뒤 검토        |
| 꾸미기 팩          | 후보           | 고정형 non-consumable           | 확률과 성능 효과 없음                  |
| 구독               | 제외           | 없음                            | 정기 신규 콘텐츠 SLA 확보 전 금지      |
| 유료 힌트 재화     | 제외           | 없음                            | 퍼즐 진행 paywall 방지                 |

광고 SDK가 실패하면 빈 화면을 띄우지 않고 원래 퍼즐로 돌아온다. `load_failed` 또는 `timeout`일 때만 보드당 1회, local day 최대 2회의 무료 힌트 1개를 fallback transaction으로 지급한다. 사용자 취소에는 지급하지 않는다. 모든 지급은 transaction ID로 중복을 막고 Remote Config kill switch로 끌 수 있다. 정상 보상은 callback 이전에 지급하지 않으며, callback 이후 앱이 종료되어도 local pending journal에서 복구한다.

## 라이브옵스 캘린더

| 주기    | 콘텐츠         | 운영 행동                           | 지표                      |
| ------- | -------------- | ----------------------------------- | ------------------------- |
| 매일    | 오늘의 보드    | KST 00:00 공개, 00:10 manifest 관측 | 시작, 첫 입력, 완료, 오류 |
| 매주 월 | 주간 테마 공개 | 7개 일일 보드 예고                  | D1, 주간 활성, 테마 선택  |
| 매주 금 | 어려움 보드    | 보상과 오류 제보 집중 모니터링      | 완료, 힌트, abandon       |
| 격주    | 꾸미기 1종     | 경제 잔액 분포 확인 후 추가         | 획득률, 적용률            |
| 매월    | 챕터 장면 1개  | 새 단서 pool과 license audit        | D30, 콘텐츠 소비 속도     |

첫 12주는 대규모 이벤트보다 콘텐츠 신뢰와 FTUE 개선에 집중한다. 소셜 경쟁은 저장 동기화와 부정행위 경계가 준비된 뒤 별도 gate로 연다.

## 시뮬레이션 증거

### 7일 정상 이용자

- 보통 보드 5개 × 38 = 190
- 쉬움 보드 2개 × 34 = 68
- 주간 5일 완료 = 60
- 합계 = 기억잉크 318

작은 꾸미기 1개를 사고 138이 남는다. 2주차 초반에 중간 꾸미기 하나를 살 수 있어 첫 선택은 빠르지만 전체 카탈로그는 남는다.

### 30일 정상 이용자

- 일일 평균 38 × 30 = 1,140
- 주간 도전 4회 × 60 = 240
- 주간 5일 완료 4회 × 60 = 240
- 합계 = 기억잉크 1,620

중간 꾸미기 2개와 큰 꾸미기 1개를 사면 180이 남는다. 출시 카탈로그를 작은 4개, 중간 4개, 큰 4개로 두면 30일에 전부 소진되지 않는다.

### 스트레스 사례

- 광고 callback 2회: transaction 중복 제거로 힌트 +2만 지급
- 오프라인 완료 후 재접속: local pending journal을 재처리하고 기억잉크를 한 번만 지급. 출시 최소 범위에는 server 동기화가 없음
- 가격 하향: 기존 구매자는 차액 보상 없이 소유권 유지, 경제 공지에 변경 사유 표시
- 30일 매일 플레이: 필수 진행에는 기억잉크가 필요하지 않아 재화 인플레이션이 난이도를 깨뜨리지 않음

Phase 2에는 이 식을 같은 입력 seed로 10,000명·90일 Monte Carlo 테스트하는 `scripts/simulate-game-economy.mjs`를 추가한다. 코드가 생기기 전에는 위 산술 시나리오를 승인 근거로만 사용한다.

## 원격 설정

기존 키는 유지하고 새 키는 `packages/crossword-core/src/launchConfig.ts`에 먼저 추가한 뒤 AIT와 mobile adapter가 같은 contract test를 통과해야 한다.

### 기존 28개 키 수명주기

| 키 또는 그룹                                                                                                    | 현행 기본    | 신규 runtime 처리                       | reader·migration                            |
| --------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------- | ------------------------------------------- |
| `default_hint_credits`, `_easy`, `_hard`                                                                        | 3/2/5        | DEC-013 전까지 유지                     | 세 시장 reader 필수                         |
| `rewarded_hint_credits`                                                                                         | 2            | 유지                                    | 세 시장 reader 필수                         |
| `visible_puzzle_count`                                                                                          | 7            | 지도 최근 보드 수로 유지                | 이름 유지                                   |
| `puzzle_generation_interval_hours`, `puzzle_keep_count`                                                         | 2/84         | legacy pack 운영용                      | 신규 game-content reader는 사용하지 않음    |
| `daily_attempt_limit`                                                                                           | 3            | DEC-005 승인 전 유지, 승인 후 deprecate | legacy Save와 이벤트에 값 보존              |
| `rewarded_extra_attempt_enabled`, `_daily_cap`                                                                  | false/1      | DEC-005 승인 시 deprecate               | legacy runtime만 읽음                       |
| `rewarded_hint_ads_enabled`                                                                                     | true         | 유지                                    | 세 시장 reader 필수                         |
| `rewarded_bonus_puzzle_ads_enabled`                                                                             | true         | 검수 재고 없으면 false                  | 세 시장 reader 필수                         |
| `result_interstitial_ads_enabled`                                                                               | false        | false 유지, 신규 runtime 미호출         | reader는 kill switch로만 유지               |
| `return_reminder_enabled`                                                                                       | true         | 신규 runtime 기본 false 제안            | 세 시장 notification adapter 완성 후 재승인 |
| `first_run_auto_start_enabled`                                                                                  | true         | 유지                                    | AIT·Android·iOS 모두 구현                   |
| `stuck_hint_idle_ms`, `stuck_hint_wrong_idle_ms`, `stuck_hint_wrong_cell_threshold`                             | 20000/5000/2 | 유지                                    | mobile 누락 reader 추가                     |
| `stuck_hint_max_prompts_per_attempt`, `stuck_hint_max_dismissals`, `stuck_hint_dismiss_backoff_factor`          | 3/2/2        | 유지                                    | mobile 누락 reader 추가                     |
| `check_highlight_ms`                                                                                            | 2500         | 유지                                    | mobile 누락 reader 추가                     |
| `leaderboard_enabled`                                                                                           | false        | false 유지                              | DEC-009 기간에는 UI 미노출                  |
| `leaderboard_score_completed_word`, `_remaining_attempt`, `_hint`, `_time_bonus_base`, `_time_decay_per_second` | core 현행값  | 보존하되 미사용                         | leaderboard 승인 전 경제에 영향 없음        |

현재 mobile reader가 읽지 않는 난이도별 힌트, 시도, 막힘 도움, 강조, leaderboard 키는 신규 runtime 전환 전에 모두 파싱해야 한다. 동일 config snapshot을 세 runtime에 넣어 normalized 결과를 비교하고, deprecate 키도 legacy client가 남아 있는 동안 Remote Config template에서 삭제하지 않는다.

### 실행값과 신규 키 제안

| Key                                 |             제안 기본값 | 범위                | 안전 범위           |
| ----------------------------------- | ----------------------: | ------------------- | ------------------- |
| `default_hint_credits`              |                       3 | normal 시작 힌트    | 1~5                 |
| `default_hint_credits_easy`         |                       2 | easy 시작 힌트      | 1~5                 |
| `default_hint_credits_hard`         |                       5 | hard 시작 힌트      | 1~7                 |
| `rewarded_hint_credits`             |                       2 | 광고 보상           | 1~3                 |
| `rewarded_hint_ads_enabled`         |                    true | 보상 광고           | boolean             |
| `rewarded_bonus_puzzle_ads_enabled` |                    true | 보너스 보드         | boolean             |
| `result_interstitial_ads_enabled`   |                   false | 결과 전면 광고      | 초기에는 false 고정 |
| `game_runtime_enabled`              |                   false | 신규 엔진 진입      | 시장·버전별 boolean |
| `memory_ink_base`                   |                      10 | 완료 보상           | 6~16                |
| `memory_ink_per_entry`              |                       2 | 단어 가중           | 1~3                 |
| `memory_ink_chain_cap`              |                      10 | 연쇄 상한           | 6~14                |
| `ftue_input_variant`                | `direct_with_tap_intro` | 입력 실험           | allowlist enum      |
| `world_restore_motion_level`        |                  `full` | 연출 강도           | full/reduced        |
| `ad_failure_fallback_enabled`       |                    true | 기술 실패 무료 힌트 | boolean             |
| `ad_failure_fallback_daily_cap`     |                       2 | local day 지급 상한 | 0~2                 |

`game_runtime_enabled`는 엔진 내부가 아니라 경량 host shell이 신규 game chunk import 전에 해석한다. bundled 안전 기본값은 `false`다. host는 시장·버전별 fetched/cached snapshot과 직전 미완료 boot marker를 확인해 legacy 또는 신규 runtime을 선택하고, 신규 runtime의 import·bridge·첫 interactive ack가 5초 안에 끝나지 않으면 같은 세션에서 legacy로 되돌린다. 따라서 cached ON이나 pre-boot white screen도 원격 OFF와 boot watchdog 중 하나로 복구할 수 있어야 한다.

Remote Config는 보안, 정답, 라이선스 판정, 이미 지급된 재화의 취소에 쓰지 않는다. fetch 실패 시 앱 번들 기본값으로 동일하게 동작한다.
