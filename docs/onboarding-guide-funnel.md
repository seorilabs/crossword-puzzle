# 첫 세 단어 안내와 한 판 완주 분석

표준 쿼리는 [onboarding-guide-funnel.sql](../scripts/analytics/onboarding-guide-funnel.sql)이다. GA4 BigQuery `crossword-puzzle-79ae0.analytics_539639687.events_*`에서 고유 사용자와 퍼즐 단위로 안내 노출, 첫 입력, 세 단어 완료, 건너뛰기와 한 판 완주를 구분한다.

## 전송 계약

Web과 Android 및 iOS는 core `FIRST_WORD_GUIDE_EVENTS`의 `first_three_words_shown`, `first_three_words_complete`, `first_three_words_skip`를 사용한다. 공통 파라미터는 `puzzle_id`, `input_policy=syllable-v1`, `word_count`다. 처음 안내를 시작한 판의 진행은 다른 판을 열어도 유지된다. 안내는 매일 새로 만드는 미션이 아니며 원래 판으로 돌아와 계속할 수 있다.

앱을 다시 열면 노출 이벤트가 다시 생길 수 있으므로 원시 노출 건수를 분모로 쓰지 않는다. 세 단어 안내 완료는 전체 판 완료가 아니다. 전체 완주는 `mission_complete` 하나만 세고 `game_puzzle_complete`를 더하지 않는다. 기존 한 번 입력 안내 `onboarding_guide_*`는 새 세 단어 안내와 합치지 않는다.

## 실행과 출력

기본 구간은 최근 28일이다. 등록된 분석 identity로 아래 쿼리를 실행하며 필요하면 두 `DECLARE`의 날짜만 고정한다.

```sh
bq query --project_id=crossword-puzzle-79ae0 --location=asia-southeast3 --use_legacy_sql=false < scripts/analytics/onboarding-guide-funnel.sql
```

- `guide_funnel`: `shown_user_puzzles`가 분모다. `first_input_user_puzzles`, `guide_complete_user_puzzles`, `skipped_user_puzzles`, `mission_complete_user_puzzles`를 분자와 함께 보고 각각의 `first_input_rate`, `guide_complete_rate`, `skip_rate`, `mission_complete_rate`를 읽는다.
- `guide_complete_elapsed`: 세 단어를 끝낸 `completed_user_puzzles`, 첫 노출부터 완료까지의 `avg_seconds`, `median_seconds`다. [GA4 공식 스키마](https://support.google.com/analytics/answer/7029846)에 정의된 정수 마이크로초 시각 차이를 초로 바꾼다.
- 마지막 결과: `event_name`, `input_policy`, `word_count`, `raw_events`, `missing_puzzle_id_events`로 전송 누락을 점검한다. 이 결과만 원시 이벤트 건수이며 사용자 수가 아니다.

쿼리 계약 검사와 실제 앱의 고정 입력 이벤트는 개발 환경에서 확인했다. 새 SQL의 실제 BigQuery 실행과 새 공개 빌드의 데이터 적재는 아직 확인하지 않았다. 개발 데이터나 출시 전 0건을 새 이용자의 전환율로 해석하지 않는다.

## 관찰 기준

분자와 분모를 함께 기록하고, 안내를 끈 이용자를 노출 분모에 넣지 않는다. 이미 완주한 판을 다시 연 기록이나 첫 세 단어 완료를 새 한 판 완주로 세지 않는다. 노출군의 관찰값만으로 안내의 인과 효과나 체감 난이도 개선을 단정하지 않는다. 구버전 구간과 새 타일 입력 구간을 나누고, 첫 입력과 전체 완주가 낮은 구간의 실제 단서와 화면을 함께 확인한다.

현재 공개된 v1.2.0 관찰값은 없다. 공개 후 적재가 확인되면 기간, 마켓, 분자와 분모, 누락 비율을 연결해 기록한다.
