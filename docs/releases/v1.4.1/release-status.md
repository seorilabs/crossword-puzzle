# v1.4.1 실행 상태

세 마켓 전체 공개는 미완료다. 앱인토스의 새 코드 버전은 공개됐고 등록정보 개정은 별도 심사 중이다. Google Play와 App Store는 심사 상태를 확인했다. 아래 시각은 UTC다.

| 마켓 | 후보와 빌드 | 실제 확인 상태 | 남은 단계 |
|---|---|---|---|
| AppsInToss | v1.4.1, 20261031-24 | 07:24 모든 사용자 공개, 08:08 현재 출시됨 재확인 | 등록정보 개정 심사 완료, 공개 후 이벤트 관측 |
| Google Play | 1.4.1, 1001001019 | 내부 배포와 원본 해시 일치, 게시 개요의 프로덕션 전체 출시 변경 검토 중 | 승인 후 자동 공개, 한국 공개 버전 확인 |
| App Store | 1.4.1, 1004001 | 08:08 WAITING_FOR_REVIEW, MANUAL | 승인 후 수동 공개, 기존 5개국 공개 버전 확인 |

## 후보와 승인

후보는 `171d4f18726df918bf3be62c97d881e60d83610d`, 태그는 `v1.4.1`이다. [PR #465](https://github.com/seorilabs/crossword-puzzle/pull/465), [#466](https://github.com/seorilabs/crossword-puzzle/pull/466), [#467](https://github.com/seorilabs/crossword-puzzle/pull/467), [#468](https://github.com/seorilabs/crossword-puzzle/pull/468)을 병합했다. [태그 발급 실행](https://github.com/seorilabs/crossword-puzzle/actions/runs/41178998072)의 실제 receipt가 Android `1001001019`, Apple `1004001`을 할당했다.

원래 승인 범위는 세 마켓 공개와 Play 전체 출시다. 추가 검수 승인 04:27:21.944의 최대 4회와 06:43:15.981의 최대 6회를 각각 보존했다. 5회차가 통과해 6회차는 실행하지 않았다. `v1.4.0`은 이전 실패 후보에 발급된 태그로 보존했으며 해당 버전의 마켓 빌드와 업로드는 0회다. 태그를 이동하거나 번호를 재사용하지 않았다.

## 구현과 검수

진행 중인 판, 오늘 미완료 판, 최근 지난 미완료 판 순서로 이어 푼다. 언어별 하루 다섯 판과 기존 색상을 유지하며 홈의 큰 버튼과 결과 아래 고정 버튼으로 다음 판을 시작한다. 선택한 판만 내려받고 원본 캐시를 우선 사용한다. 완료와 활동일, 지난 판과 오늘 순위의 구분을 유지한다.

일반 전면광고는 첫 세션부터 실제 풀이 90초 이후 완료 구간에서 확인한다. 광고 종료 후 최소 90초, 세션 3회, UTC 하루 10회, 30분 비활동의 세션 구분을 적용한다. 완료 저장, 요약과 사전 안내, 준비된 광고, 다음 버튼 활성화 순서다. 미준비와 실패는 기다리지 않고 진행하며 결과 재방문과 늦은 콜백의 중복 노출을 막는다.

최종 후보의 자동 검사 1,206개와 typecheck, lint, release parity, build, mobile 검사를 통과했다. 독립 5회차는 앱 동선 154개, UI 16종의 기능과 화면, 서비스 4개, 정적 검사 8개, 같은 다섯 판의 네트워크 비교 6조합을 통과했다. 원본 화면 406장, 고유 원본 219장과 비교 시트 40개를 직접 검토했다.

| 회차 | 원래 후보 | 원래 판정과 처리 |
|---|---|---|
| 1 | 73e5d495 | 소진과 빈 목록 안내 실패, 후속 수정과 재현 확인 |
| 2 | 7759e9fa | 광고 닫힘 기록 저장 실패 후 간격 위반, 저장 예약과 복구 수정 |
| 3 | 1ca1d3b2 | 미사용 폴백의 503이 캐시 복원 차단, PR #467로 수정 |
| 4 | e615e3bd | 오프라인 마지막 캐시 완료를 전체 완료로 안내, PR #468로 수정 |
| 5 | 171d4f18 | 전체 통과, 이전 4회 실패의 실제 해결과 화면 확인 |

과거 회차의 후보, 시각, 실패 판정과 원본 해시는 바꾸지 않았다. 최종 실행 4개는 모두 후보 171d4f18이며 정상 검수 이력과 두 추가 승인을 사용했다. 중단이나 이력 복구로 바꾸지 않았다. 중앙 검증기 `fa99bfe0078e2cee0b91cac94fe7023ca8ff702a`의 실제 함수에서 3마켓과 3단계 9개의 `ok:true`를 확인했고, 각 작업 직전 해당 단계도 다시 확인했다. 근거 만료는 `2026-11-07T07:00:15.526593Z`이며 만료 뒤에는 실제 실행 근거를 갱신해야 한다.

실제 기기 사용, 공개 채널에서의 네이티브 실행과 실제 광고 SDK 노출은 0회다. SDK 경계 대체 실행과 콘솔 조회를 해당 증거로 세지 않는다.

## 마켓별 실행

AppsInToss의 대상은 워크스페이스 38345, 게임 56407, `crossword-puzzle-game`이다. [빌드와 비공개 업로드](https://github.com/seorilabs/crossword-puzzle/actions/runs/41179260766)의 `.ait`는 1,366,883바이트이며 SHA-256은 `41bf21ebce1c778da3ac54c40c450a6b7087991cd473b6a526d8b006791a9a20`이다. 컨테이너, SDK 3.4.1, 빈 권한, 실제 번들의 버전과 배포 주소를 확인했고 콘솔 메모의 소스와 해시가 일치했다. 코드 심사 승인 후 07:24 전체 사용자 출시를 실행하고 현재 출시됨을 다시 읽었다. 설명과 스크린샷 세 장은 원본 해시와 일치하며 등록정보 개정은 별도 검토 중이다. QR 테스트 창을 연 것을 실제 앱 실행으로 세지 않았고 테스트 푸시는 보내지 않았다.

Google Play의 [서명 AAB 빌드](https://github.com/seorilabs/crossword-puzzle/actions/runs/41179256764)는 기존 Cloud Build 실행 `50c7f26b-f642-4032-8e18-0f55a812b78e`에서 성공했다. AAB는 48,214,720바이트, SHA-256 `783be8db58c9c029ecdabd5ffc82b2b0049d3486e903c715fb8cfcb21cb20fb5`이며 실제 package, 버전, target SDK 36, Firebase와 AdMob 앱 ID를 검사했다. 서명 인증서는 Play 콘솔 DER 사본과 바이트가 같고 jarsigner 검증을 통과했다. 로컬 keystore나 key.properties를 만들지 않았다. 같은 AAB를 내부 배포하고 제공자 bundle 해시를 대조했다.

등록정보만 임시 보관하려던 edit는 제공자가 `changesNotSentForReview=true`를 거절해 삭제됐고 기존 등록정보 보존을 다시 확인했다. 자동으로 매개변수를 빼서 재시도하지 않았다. 서명과 내부 배포 확인 뒤 새 edit `00428938531143580045`에서 두 언어, 스크린샷 14장과 정확한 1001001019의 프로덕션 전체 출시를 함께 제출했다. API 등록값과 게시 개요의 검토 중 상태를 각각 읽었다. 국가 KR, 무료 가격, 연락처, 아이콘과 feature graphic은 유지했다. 관리형 게시는 사용 중지 상태다. 사전 출시 보고서는 현재 없으며 기기 검수 통과로 대체하지 않았다.

App Store의 [기존 archive 경로](https://github.com/seorilabs/crossword-puzzle/actions/runs/41179258696)를 build-only로 실행했다. 원본 ZIP은 112,968,588바이트, SHA-256 `fc878cb299eb32c21873a8007d47e826c2d2ccdc65fbb181064d7ebc7f56e9c5`이다. 실제 archive의 1.4.1과 1004001, bundle ID, 배포 인증서와 profile, entitlement, 암호화 false, 개인정보 manifest와 아이콘을 확인했다. 등록된 인증서와 바이트가 같으며 새 자격증명을 만들지 않았다. 같은 archive를 export하고 upload했고 종료 코드 0, 제공자 `VALID`와 기존 내부 그룹 포함을 확인했다.

export 전 원본 ZIP의 67개 파일 내용이 같았으며 실행 비트 6개만 복원했다. export 후 Xcode가 archive 최상위 Info.plist에 Distributions 이력만 추가했다. 앱과 나머지 66개 파일, 원본 ZIP은 바뀌지 않았다. archive 전체가 export 뒤에도 그대로라고 기록하지 않는다.

Apple 버전 ID는 `054bcbe3-425e-43a2-8de4-6d7ecb6c72de`, 빌드 ID는 `63711877-22c7-42f5-accd-fabc5a775d7c`, 심사 ID는 `6b30c698-f563-4079-acde-969384413a4a`다. ko, en-US, en-CA, en-AU의 최종 소개, 출시노트, 심사 노트와 24개 스크린샷의 처리, 체크섬과 순서를 읽고 이 빌드를 선택해 제출했다. 다른 열린 제출을 재사용하지 않았다. 현재 WAITING_FOR_REVIEW와 MANUAL이다. 기존 KOR, USA, CAN, AUS, NZL의 무료 배포를 유지한다.

## 비용과 공개 후 관측

실제 생성, Cloud Run 사양, 예약 작업과 데이터베이스 규모를 바꾸지 않았다. 공개 목록은 한국어 35개, 영어 50개이며 오늘은 언어별 다섯 판이다. 기존 발행분을 재사용하고 전체 지난 판을 내려받지 않는다.

같은 다섯 판과 재실행 없는 조건에서 AIT 요청은 32개에서 6개로, RN의 두 플랫폼은 17개에서 6개로 줄었다. 비교에 사용한 퍼즐 본문의 해시 집합이 같으며 새 본문 합계는 한국어 23,991바이트, 영어 21,728바이트다. JSON UTF-8 본문 비교이며 압축, 헤더, 실제 광고 SDK 트래픽과 전체 이용량 증가에 따른 전송비를 포함하지 않는다. 전송비의 절대 불변을 보장하지 않는다.

Remote Config는 기존 값과 ETag를 보존해 완료 광고 키 다섯 개만 버전 11로 반영했고 제공자를 다시 읽어 확인했다. 첫 대기와 간격은 90,000ms, 세션 상한 3, 일 상한 10이다.

07:49 BigQuery 조회는 성공했으나 마지막 일일 테이블은 events_20261030이고 당일과 intraday 테이블은 없었다. 새 버전의 누락과 중복, 광고 노출을 아직 평가할 수 없다. 이를 실패 0회나 수신 성공으로 표시하지 않는다. [연속 플레이 SQL](../../../scripts/analytics/continuous-play.sql)은 완료 뒤 10분 안의 다른 판 시작률과 완료 0판인 세션을 포함한 세션당 완료 판 수를 시장과 버전별로 비교한다. 당일 export가 생기면 v1.4.1과 직전 공개 버전을 같은 UTC 기간으로 비교하고, 버전과 시장이 없는 데이터는 미확인으로 분리한다. [광고 집계](../../../scripts/analytics/ad-funnel.sql)와 [설정 감사](../../../scripts/analytics/result-interstitial-config-audit.sql)에서 요청, 표시, 실제 노출과 미준비, 간격, 상한, 실패를 구분한다.

## 보관과 후속 단계

NAS의 실제 SMB 연결을 확인하고 스트림 복사 뒤 사본에서 크기와 SHA-256을 읽었다. 원본 ZIP과 내부 AAB, AIT 및 iOS 파일, AIT 내부 항목까지 목록, CRC, 크기와 각 파일 해시를 대조했다. 이미 검증한 동일 원본은 해시로 기존 위치를 참조하며 복제하지 않았다.

- 최종 검수: `/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-31/171d4f18726df918bf3be62c97d881e60d83610d/continuous-play-v141-20261031T051027Z/passed-round5/TRANSFER-VERIFIED.json`, SHA-256 `f521ae3e36fd885c1e5ab9b75cadf73724dd44b714af5485b2b1b5781e7057b0`
- 배포 원본과 운영 기록: `/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-31/171d4f18726df918bf3be62c97d881e60d83610d/continuous-play-v141-20261031T051027Z/market-artifacts-and-submission-081011Z/ARTIFACTS-COMPLETION-VERIFIED.json`, SHA-256 `34fa449e090606f3a1133990ce5607f04a6d1901e0b881e7bd7b600afc2a0efa`
- 배포 원본 489개와 재사용 49개, 압축 161,340,494바이트의 검증 목록: `TRANSFER-VERIFIED.json`, SHA-256 `bd061c3b552a59abee6c830c714a6579b3b62a1cbe32ce0c321df9981be01fce`
- 내부 ZIP 검증: `NESTED-ZIP-READBACK-VERIFIED.json`, SHA-256 `7c62d1966c9b4a7462df77abf24ecfc2cb6f82908275c38ee97bf6ba4a985f8e`

Google 승인이 확인되면 자동 공개 상태와 한국 공개 상품의 1.4.1을 읽는다. Apple 승인이 확인되면 같은 버전과 빌드의 MANUAL 공개를 실행하고 5개국 무료 공개 버전을 확인한다. 앱인토스 등록정보 개정 승인과 표시 내용도 별도로 확인한다. 공개 범위는 이미 승인됐으므로 추가 출시 승인은 필요하지 않다.

심사와 당일 export는 외부 대기 상태다. 범용 자동 감시를 설정하지 않았으며 이를 설정했다고 보고하지 않는다. 세 마켓 공개와 남은 관측이 끝나지 않아 원장 전체 완료 검사는 미통과다.
