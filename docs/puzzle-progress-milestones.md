# 진행 마일스톤 도달률 모니터링 (puzzle_progress)

## 목적

부분 완료 보상·진행 가시화(#86)와 `puzzle_progress` 마일스톤 이벤트의 효과를 재측정한다. 진행 마일스톤(25/50/75%) **도달률**과 **마일스톤 → 완료 전환**을 난이도별로 산출해 "어디까지 채우고 멈추는지"와 완료 기여를 본다. 행동 변경 없는 **계측 전용** 작업이다.

- 표준 쿼리: [`scripts/analytics/puzzle-progress-milestones.sql`](../scripts/analytics/puzzle-progress-milestones.sql)
- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`

## emit 배선 확인 (코드 점검 결과)

`puzzle_progress` emit은 현재 코드에 **정상 배선되어 있다**:

- Web `src/App.tsx`와 RN `apps/mobile/App.tsx`에서 진행률이 새 마일스톤을 넘을 때마다 `puzzle_progress`와 `game_progress`를 같이 emit한다. 두 표면 모두 `milestone`, `progress_percent`, `completed_word_count`, `word_count`, `attempt_number`, `elapsed_seconds`, `hint_count`, `remaining_attempts`와 공통 퍼즐 파라미터를 사용한다.
- 마일스톤 임계값은 `packages/crossword-core/src/uiPolicy.ts`의 `PUZZLE_PROGRESS_MILESTONES = [25, 50, 75]`. 100%는 `mission_complete`가 별도로 다루므로 `puzzle_progress`에 `milestone=100`은 emit되지 않는다(중복 방지).
- RN의 이어풀기 첫 스냅샷은 baseline으로만 저장해, 이미 지난 마일스톤을 재발화하지 않는다.

따라서 baseline의 `puzzle_progress` 데이터 0건은 emit 누락이 아니라 **릴리스/데이터 적재 지연**(#86 머지 6/23, 데이터 구간 ~6/24)으로 보인다. 데이터가 쌓이면 아래 쿼리로 재측정한다.

## 실행

```bash
bq query \
  --project_id=crossword-puzzle-79ae0 \
  --location=asia-southeast3 \
  --use_legacy_sql=false \
  < scripts/analytics/puzzle-progress-milestones.sql
```

기본값은 최근 28일 롤링 구간이며, 구간을 고정하려면 SQL 상단 두 `DECLARE` 줄의 `DEFAULT`만 바꾼다(예: `'20260603'` ~ `'20260624'`). named-parameter 변형은 `docs/retention-cohort.md`와 동일한 방식으로 적용할 수 있다.

## 출력 스키마

| 컬럼                | 의미                                                          |
| ------------------- | ------------------------------------------------------------ |
| `difficulty`        | 난이도(easy/normal/…)                                        |
| `starters`          | 시작자 수(`attempt_start` 보유 distinct user), 도달률 분모   |
| `reached_25_users`  | 25% 마일스톤 도달 user 수                                    |
| `reached_50_users`  | 50% 마일스톤 도달 user 수                                    |
| `reached_75_users`  | 75% 마일스톤 도달 user 수                                    |
| `completed_users`   | 완료(`mission_complete`) user 수 (= 100% 도달)              |
| `reach_25_rate`     | 25% 도달률 = `reached_25_users / starters`                  |
| `reach_50_rate`     | 50% 도달률                                                   |
| `reach_75_rate`     | 75% 도달률                                                   |
| `complete_rate`     | 완료율 = `completed_users / starters`                       |
| `complete_given_75` | 75% 도달자의 완료 전환 = `완료∩75 / 75`                      |
| `complete_given_50` | 50% 도달자의 완료 전환                                       |
| `complete_given_25` | 25% 도달자의 완료 전환                                       |

`reach_25 ≥ reach_50 ≥ reach_75 ≥ complete` 가 정상 형태다(누적 funnel). `complete_given_75`가 높고 `reach_75_rate`가 낮으면 "끝물에서 못 가는" 게 아니라 "75%까지 도달 자체가 적다"는 신호다.

## 추이 기록 (정기 갱신)

| 산출일(KST) | 구간(from~to) | difficulty | starters | reach25 | reach50 | reach75 | complete | 비고 |
| ----------- | ------------- | ---------- | -------- | ------- | ------- | ------- | -------- | ---- |
| _측정 후 기입_ | 2026-06-03~2026-06-24 | normal | _기입_ | _기입_ | _기입_ | _기입_ | _기입_ | #86 baseline 재측정 |

> 표본이 작으면 비율과 함께 분자/분모(user 수)를 같이 적는다.

## 후속

마일스톤별 도달률·완료 전환이 안정 산출되면, 이탈이 집중되는 구간(예: 50→75 급감)을 식별해 해당 구간의 진행 보상/난이도 보조를 강화하는 후속 개선 이슈를 연다.
