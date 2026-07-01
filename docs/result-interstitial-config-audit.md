# result_interstitial 설정·실노출 정합 감사

## 목적

결과 전면광고(result_interstitial)가 Remote Config `result_interstitial_ads_enabled`(기본 `false`)를 따라 **실제로 노출/계측되지 않는지** 를 데이터로 감사한다. [#98](https://github.com/seorilabs/crossword-puzzle/issues/98)의 baseline은 config=false인데도 데이터에 result_interstitial 이벤트가 6명·83건(last_day `20260617`) 관측된 불일치였다. 본 쿼리는 이 불일치가 해소됐는지(= cutoff 이후 0건)를 확정하고, 향후 재발 시 즉시 가시화하는 **상시 정합 감사** 수단이다. 행동 변경 없는 **계측 전용** 작업이다.

## 배경 (코드 점검 결과)

- **현재 빌드에는 result interstitial 호출부가 없다.** 노출 함수(`src/adapters/appsInTossAds.ts`의 `showResultInterstitialAd`, `apps/mobile/mobileAds.ts`의 `showInterstitialAd`)는 정의만 있고 어떤 화면에서도 호출되지 않는다.
- **parity 게이트가 회귀를 차단한다.** `scripts/check-release-parity.mjs`가 앱 화면 코드에 `showResultInterstitialAd`/`showInterstitialAd` 호출이 들어가면 실패시킨다. 즉 코드 동작은 `result_interstitial_ads_enabled=false` 와 정합한다.
- **이벤트 emit 없음.** `result_interstitial_ad_request` / `_event` / `_result` 는 현재 코드 어디에서도 emit되지 않는다(계약 문서 `docs/firebase-analytics-remote-config.md`에만 존재).
- 따라서 baseline의 83건은 **호출부 제거 이전 구버전 잔존 빌드의 이력**으로 판단된다. 본 감사 쿼리가 그 가설을 데이터로 확정한다.

향후 result interstitial을 실제로 노출시키는 시점에는 (1) `resultInterstitialAdsEnabled` 게이팅과 (2) config 값을 이벤트 파라미터로 함께 로깅하는 것을 동시에 도입한다. 구체적 착수 항목은 아래 [향후 도입 체크리스트](#향후-도입-체크리스트-result_interstitial-실노출-시)로 분리해 추적한다. 그 전까지 config 준수의 검증 수단은 본 감사 쿼리다.

## 향후 도입 체크리스트 (result_interstitial 실노출 시)

result interstitial을 실제 노출로 전환할 때, "재발 시 즉시 가시화"를 유지하려면 게이팅·로깅·정합 게이트·계약 문서를 **한 PR에서 동시에** 맞춰야 한다. 정합화 PR의 출발선으로 아래 항목을 사용한다.

- [ ] **게이팅 도입** — 결과 화면 진입에서 노출 함수(웹 `showResultInterstitialAd` @ `src/adapters/appsInTossAds.ts`, 모바일 `showInterstitialAd` @ `apps/mobile/mobileAds.ts`)를 호출하기 직전에 `launchConfig.resultInterstitialAdsEnabled`(Remote Config `result_interstitial_ads_enabled`, 기본 `false`)를 평가해 `true`일 때만 호출한다. 평가 지점을 웹/모바일 양쪽에 배선한다.
- [ ] **config 값 파라미터 로깅** — `result_interstitial_ad_request`(및 `_event`/`_result`) emit 시 파라미터에 평가된 `config_value`(게이팅에 사용한 enabled 값)와 `source`(호출 화면/트리거 식별자)를 함께 포함한다. 이벤트명·파라미터 키는 영문 원문 유지.
- [ ] **parity 게이트 갱신** — `scripts/check-release-parity.mjs`가 현재 호출을 회귀로 차단한다(웹 `assertNotIncludes(webApp, "showResultInterstitialAd", …)`, 모바일 `assertNotIncludes(mobileApp, "showInterstitialAd", …)`). 노출 도입 시 이 규칙을 "호출 금지 → 게이팅 경유 호출 허용/정합"으로 갱신해 웹·모바일 노출 동선이 어긋나지 않게 한다.
- [ ] **텔레메트리 계약 문서 동기화** — `docs/firebase-analytics-remote-config.md`의 config 표(`result_interstitial_ads_enabled`)와 이벤트 표(`result_interstitial_ad_request`/`_event`/`_result`)에 활성 상태·신규 파라미터(`config_value`/`source`)를 반영한다.
- [ ] **감사 기준 갱신** — 본 문서의 `compliance_cutoff`/`verdict` 해석을 "노출 도입 이후"에 맞게 갱신한다(도입 이후 이벤트는 잔존 위반이 아니라 정상 노출이므로, 판정 기준을 config 값 기준 정합 검증으로 전환).

## 표준 쿼리

| 항목 | 쿼리 | 산출 |
| --- | --- | --- |
| result_interstitial 정합 감사 | [`scripts/analytics/result-interstitial-config-audit.sql`](../scripts/analytics/result-interstitial-config-audit.sql) | 일자별·stage별 건수, cutoff 이후 잔존 여부, 준수 판정(verdict) |

광고 퍼널 전반(rewarded 포함)은 [`scripts/analytics/ad-funnel.sql`](../scripts/analytics/ad-funnel.sql)로 별도 산출한다. 본 쿼리는 result_interstitial 의 **config 준수 여부**에만 초점을 둔다.

소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`

## 실행

```bash
bq query \
  --project_id=crossword-puzzle-79ae0 \
  --location=asia-southeast3 \
  --use_legacy_sql=false \
  < scripts/analytics/result-interstitial-config-audit.sql
```

구간·기준일을 고정하려면 SQL 상단 세 `DECLARE` 줄의 `DEFAULT`만 바꾼다. `compliance_cutoff`(기본 `20260617`)를 **초과한** 이벤트가 1건이라도 있으면 위반으로 본다. 구버전 잔존 빌드가 완전히 빠진 시점을 알면 그 날짜로 올린다.

## 출력 스키마

### 결과 1: `result_interstitial_daily`

| 컬럼 | 의미 |
| --- | --- |
| `event_date` | GA4 이벤트 날짜(YYYYMMDD) |
| `stage` | 단계(`request`/`event`/`result`) |
| `event_count` / `users` | 해당 일자·단계 이벤트 수 / distinct user 수 |
| `after_cutoff` | `compliance_cutoff` 초과 여부(true면 잔존 의심) |

### 결과 2: `config_compliance_summary`

| 컬럼 | 의미 |
| --- | --- |
| `compliance_cutoff_date` | 준수 판정 기준일 |
| `total_events` / `total_users` | 구간 전체 이벤트 수 / user 수 |
| `first_seen_date` / `last_seen_date` | 최초/최종 출현 일자 |
| `events_after_cutoff` / `users_after_cutoff` | cutoff 초과 잔존 이벤트 / user 수 |
| `verdict` | `COMPLIANT`(cutoff 이후 0건) 또는 `VIOLATION` |

## 판정 가이드

- **DoD 충족(준수)**: `config_compliance_summary.verdict = 'COMPLIANT'`(= `events_after_cutoff = 0`). config=false일 때 result_interstitial 이벤트가 발생하지 않음을 데이터로 확인한 것이다. `last_seen_date <= compliance_cutoff`이면 baseline 83건이 구버전 잔존 이력이라는 가설이 데이터로 확정된다.
- **위반(재오픈)**: `verdict = 'VIOLATION'`이면 cutoff 이후에도 이벤트가 관측된 것이다. 구버전 잔존이 아니라 **활성 노출/계측 경로가 있다는 의미**이므로, 게이팅 누락 지점을 찾아 `resultInterstitialAdsEnabled` 게이팅 + config 값 동시 로깅을 도입하는 별도 PR로 정합화한다.
- **소표본 주의**: 신규 코호트가 작아 일자별 건수는 노이즈가 크다. 절대 잔존 여부(0 vs 1+)가 1차 판정 기준이다.
