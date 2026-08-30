# 새 퍼즐 도착 푸시 Runbook (P5)

당일 3판(easy 5×5 + normal 8×8 + hard 8×8)이 자정 배치로 발행된 뒤, 사용자에게 "새 퍼즐이
도착했어요" 푸시를 **오전에 1회** 보내 재방문을 유도한다.

## 설계

- **AIT 발송 주체**: 앱인토스 스마트발송(Smart Message). AIT 앱은 FCM/자체 푸시를
  보내지 않고 `requestNotificationAgreement`로 알림 수신 동의만 수집한다
  (`src/adapters/notificationAgreement.ts`, 코어 `returnReminder.ts`). 실제 발송·
  타겟팅·유저 토큰 관리는 앱인토스 플랫폼이 담당한다.
- **Android/iOS 발송 주체**: RN 앱의 `returnReminderNotifications.ts`가 OS 로컬
  알림을 다음 날 09:00 KST에 한 번 예약한다. 서버·FCM·APNs 토큰은 사용하지 않는다.
  `return_reminder_enabled=false`면 권한 요청과 예약을 모두 건너뛴다.
- **시각 분리**: 배치는 자정(00:05 KST)에 생성한다. 푸시는 그 시각이 아니라
  **오전 08:00 KST** 스케줄 발송으로 분리한다(자정 발송 금지 — 취침 시간).
  → 배치 코드에 푸시 훅을 넣지 않고, **콘솔 스케줄 발송**으로 구성한다.
- **대상 앱**: `crossword-puzzle-game`(miniAppId 56407).

## 선행 조건

1. 앱 출시(앱정보 검토 승인 + 번들 검수 승인)로 스마트발송 가능 상태.
2. 클라이언트 알림 동의 유도 경로 확인: 퍼즐 완료 시 `maybePromptReturnReminder`가
   동의를 받는다(`src/App.tsx`). 동의 유저에게만 발송된다.
3. 검수 승인된 templateCode 확보(콘솔에서 발급). 복귀 리마인드용
   `crossword-daily-reminder`와 별도로 "새 퍼즐 도착" 템플릿을 만든다.

## 설정 단계 (콘솔 또는 apps-in-toss-console MCP)

MCP 도구: `push_template_create`, `push_target_segment_create`,
`push_send_scheduled`, `push_template_list`, `push_history_list`, `push_stats`.

1. **템플릿 생성** (`push_template_create`)
   - 제목 예: "오늘의 퍼즐 도착 🧩"
   - 본문 예: "새 가로세로 낱말 3판이 준비됐어요. 쉬움·보통·어려움 중 골라 풀어보세요!"
   - 딥링크: 앱 홈(`intoss://crossword-puzzle-game`).
2. **세그먼트 생성** (`push_target_segment_create`)
   - 알림 동의 유저 전체(또는 최근 N일 이탈자 등 재방문 유도 대상).
3. **스케줄 발송 등록** (`push_send_scheduled`)
   - 매일 08:00 KST 반복, 위 템플릿 + 세그먼트.
   - (주의) 하루 1회만. 자정 배치와 무관하게 고정 시각.
4. **검증**: `push_history_list`·`push_stats`로 발송·오픈율 확인. 발송 시각·빈도는
   GA4 시간대별 플레이 분포 재측정 후 조정(초기값 08:00은 아침 활동 밴드 근거).

## 참고 — 배치 트리거형(대안, 비권장)

배치 발행 직후 서버에서 AIT 발송 API(`sendMessage`/`sendBulkMessage`)를 호출하는
방식도 가능하나, (a) 발행이 자정이라 발송 시각과 분리해야 하고, (b) 서버에 AIT
API 키·세그먼트 관리가 필요해 복잡도가 높다. 고정 시각 스케줄 발송이 더 단순하다.

## 관련

- 기획: Obsidian `05 리팩터 기획` D1/D5
- 시간대 근거: GA4 시간대별 distinct 사용자(오후 14-17, 아침 05-08, 심야 22-23)
