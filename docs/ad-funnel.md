# 완료 전면광고와 연속 플레이 측정

현재 광고는 `completion_interstitial` 일반 전면광고다. 힌트 보상형과 `result_interstitial_ad_*`는 구버전 이력으로만 분석한다. 신규판은 언어별 하루 5판이며 지난 미완료 판으로 이어진다.

완료 저장 후 결과 요약과 사전 안내를 그리고 준비된 광고만 검사한다. 다음 판 버튼이 활성화된 후 광고를 띄우지 않는다. 첫 세션부터 실제 전경 풀이 90초 이후, 이전 광고 닫힘 후 최소 90초, 세션 3회와 UTC 하루 10회다. 30분 비활동으로 새 세션을 시작한다. 언어를 바꾸거나 앱을 다시 열어도 이력은 유지한다.

| 이벤트 | 의미 |
| --- | --- |
| `ad_opportunity` | 새로 완료하고 저장한 판의 검사. 재방문은 제외 |
| `ad_requested` | 이미 준비된 광고의 SDK 표시 호출 |
| `ad_shown` | AIT `show`, 네이티브 `OPENED` 콜백, 표시 횟수 상한 기준 |
| `ad_impression` | AIT SDK `impression` 또는 네이티브 AdMob/Firebase 자동 노출 이벤트 |
| `ad_closed` | 닫힘 콜백, 다음 간격 시작 |
| `ad_failed` | 준비된 광고의 표시 실패 |
| `ad_skipped_unready` | 준비되지 않아 즉시 진행 |
| `ad_skipped_initial_wait`, `ad_skipped_interval` | 최초 실제 플레이 시간 또는 닫힘 간격 부족 |
| `ad_skipped_session_cap`, `ad_skipped_daily_cap` | 상한 도달 |
| `ad_skipped_disabled`, `ad_skipped_storage` | 원격 비활성 또는 광고 이력을 안전하게 저장할 수 없음 |

앱 이벤트에는 `placement=completion_interstitial`, `ad_policy_version=2`, `puzzle_id`, `content_language`, `ui_language`, `daily_sequence`, `market`, `release_version`이 붙는다. SDK 자동 `ad_impression`은 앱의 퍼즐 맥락이 없을 수 있어 마켓과 버전별로 따로 집계한다. SDK 화면 열림을 수익 발생으로 합성하지 않는다. AIT와 Firebase 팬아웃을 합치지 않고 BigQuery의 Firebase 스트림을 사용한다.

- [광고 집계](../scripts/analytics/ad-funnel.sql)는 표시 요청, 화면 표시, 실제 노출, 닫힘, 실패와 건너뛰기를 분리한다. 실패율 분모는 표시 요청이며 미준비와 정책 제한은 실패가 아니다.
- [정합 감사](../scripts/analytics/result-interstitial-config-audit.sql)는 같은 사용자, 퍼즐, 버전의 중복 표시를 찾는다. 화면 재방문과 홈 이동에 표시가 있으면 원시 시각을 조사한다.
- [연속 플레이 비교](../scripts/analytics/continuous-play.sql)는 완료 후 10분 안에 다른 판을 시작한 비율과 세션당 완료 수를 마켓, 언어, 버전별로 비교한다. 중복 완료는 사용자, 세션, 퍼즐로 제거하며 지난 판과 오늘 판을 섞어 일일 진행률로 해석하지 않는다.

출시 후 24시간은 누락과 중복을, 7일과 28일에는 이전 버전과 다음 판 시작률 및 세션당 완료 수를 비교한다. 배포 직후 표본 0은 정상 동작 증거가 아니다. 전송량은 같은 언어와 완료 판 수의 HTTP 요청 수, JSON 응답 바이트로 비교한다. 생성 횟수, Cloud Run과 예약 작업은 바꾸지 않는다.

광고 배치는 [Google 권고](https://support.google.com/admob/answer/6201350?hl=en), AIT 이벤트는 [토스 SDK 정의](https://developers-apps-in-toss.toss.im/documentation/common/monetization/iaa/interstitial-rewarded-ad)에 따른다. 개발 SDK 대체 실행은 실제 노출이나 수익 증거가 아니다.
