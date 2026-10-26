# v1.3.1 공개 출시 진행 기록

소스는 `5910893f4b5615bd588763ebc49a45910d540432`, 태그는 `v1.3.1`이다. Android versionCode `1001001016`, Apple build `1003001`은 중앙 원장에서 발급했다. 국가와 가격은 기존 설정을 유지한다.

| 대상 | 실제 상태 | 남은 단계 |
| --- | --- | --- |
| 서비스 | 언어별 공급 공개, 최초 KO 10판과 EN 25판 manifest HTTP 200, 수동과 자정 이후 정기 작업 성공 | 이후 정기 작업과 공급 상태 관찰 |
| App Store | 1.3.1 build 1003001, TestFlight 내부 배포와 App Review `WAITING_FOR_REVIEW` | Apple 승인, MANUAL 공개와 실제 공개 확인 |
| Google Play | 서명 AAB 준비, 인증서와 실제 manifest 검증, 업로드 미실행 | 본인확인 상태 미확인에 대한 사용자 답변, 내부 업로드, 등록정보와 프로덕션 심사 |
| AppsInToss | 정확한 .ait 테스트 배포와 등록정보 임시저장 완료, `isTested: false`, 미제출 | 사용자 법적 확인, 기기 사용 승인과 실제 Toss 테스트, 검토 요청 및 공개 |

App Review 제출 ID는 `a15715e5-19d2-4e3f-bbbd-0c662b81a546`, 제출 시각은 `2026-10-26T15:43:08.73Z`다. version ID `7e66e636-6247-485e-aed8-017669781ff9`와 build ID `bc9cf2ab-243a-4932-a610-654129668cd9`의 관계를 GET으로 확인했다. 활성 `ko` 문구와 여섯 스크린샷을 제공자 원본과 대조했다. KOR, 4+, 연락처와 MANUAL 방식을 유지했다. archive 실물은 CI가 보관하지 않아 독립 바이트 검사를 하지 못했고, 실제 CI 최종 Info.plist 대조와 서명 및 포장 출력, 같은 ASC 빌드의 VALID와 암호화 예외 미사용을 구분해 기록했다.

AIT는 GAME 56407, workspace 38345, appName `crossword-puzzle-game`, versionName `20261027-23`, deployment ID `01a178c3-6ae2-7f52-975a-eee366ac7284`다. 실파일 SHA-256 `34273d26a164a864c42dc8da0a81f1c5fb5b8b1a921e4fb295ee370a754b515a`가 canonical memo와 일치한다. 새 문구와 네 이미지는 임시저장 및 GET, 실제 이미지 검수를 마쳤다. 기존 등급 원문을 전송했으나 제공자는 draft의 contentRatings를 `NONE`에서 빈 배열로 정규화했다. 연령과 나머지 등급 필드 및 공개 원본을 바꾸지 않았고 새 등급을 선택하지 않았다.

## 확인을 기다리는 사항

- Play 소유 계정 SeoriLabs 개인 `7593567020638200144`와 게시 권한은 확인했다. 콘솔에서 본인확인 완료 상태를 읽지 못해 스킬 요건상 mutation을 보류했다. 이 상태를 기록한 채 기존 앱의 출시를 계속할지, 사용자가 완료를 직접 확인했는지 질문했다. Google의 계정 거절로 단정하지 않는다.
- AIT의 필수 확인 다섯 개에는 인허가와 등록 및 신고 완료, 위반 시 파트너사 책임 및 토스 손해보상이 포함된다. 이전 광고 수수료 동의와 별도로 질문했고 체크하지 않았다.
- AIT는 ‘테스트를 먼저 진행한 후 검토를 요청해 주세요’와 QR을 통한 Toss 앱 진입을 요구한다. Android 실기기 한 대에서 기존 Toss 앱으로 최대 15분과 두 번 이내의 진입, 영어 한 판, 완료 후 광고 또는 건너뛰기, 재실행 복원과 해당 화면 및 로그 수집을 별도로 요청했다. 승인 전 기기 조회를 하지 않았으며 설치, 삭제와 초기화를 요청하지 않았다. 테스트 진행 기록은 추가될 수 있다. 답변은 아직 없다.

## 검증과 원본

실제 제품 L3의 자동 1,185개, 실제 입력 30판과 광고 18개 경계, 300판 현재 정책 검사, 실제 발행 14판 full job 두 번 재실행 보존과 빌드는 통과했다. 기존 UI 검수 세 회의 실패와 통과, SHA와 시각은 원형 그대로 보존했고 새 UI 회차는 시작하지 않았다. 실제 광고 SDK와 기기 실행은 미실행이다. 광고 지면 세 개와 운영 Remote Config를 연결했으며 실제 게재로 표현하지 않는다.

중앙 검사 호출 오류와 정정은 [정정 기록](central-gate-correction.md)에 남겼다. 최초 로컬 종료 코드 0은 실제 실행이 아니었고 통과 주장을 철회했다. 수정한 UTC Z 표기로 실제 중앙 검사 12개를 통과했다. 이 시각을 서버 배포 전으로 소급하지 않는다.

- [고정 태그와 출시 자료](https://github.com/seorilabs/crossword-puzzle/releases/tag/v1.3.1)
- [보존 수정 PR](https://github.com/seorilabs/crossword-puzzle/pull/456)
- [현재 원장](../../../release/market-launch-state.json)
- 실제 L3 원본: `/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-26/5910893/independent-l3-20261026T144903Z/VERIFIED-MANIFEST.json`
- 정정과 실제 중앙 실행: `/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-27/5910893/central-verification-correction-20261026T151242Z/correction-ready-nas.json`
- 서명 AAB와 CI 및 ASC 정적 확인: `/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-27/5910893/release-artifact-static-20261026T153438Z/VERIFIED-ARTIFACT-MANIFEST.json`

테스트 링크는 `seorilabs-release-run`에 따라 등록된 Discord release-ops 웹훅으로 안내했다. Python 기본 User-Agent의 HTTP 403을 진단한 뒤 같은 기존 웹훅에 식별 가능한 User-Agent로 요청해 성공했다. 웹훅 URL과 토큰은 기록하지 않았다.

정기 운영도 확인했다. 2026-10-27 KST 00:05의 `generator-z9bzc`는 `2026-10-26T15:11:58.170893Z`에 성공했고, 00:40의 `health-5755h`도 `15:40:24.369927Z`에 성공했다. 두 작업은 공개한 `fdbc20a...` 이미지를 유지했다. 한국 자정 이후 현재 한국어 날짜와 미국 및 한국과 키리티마티의 영어 현지 날짜에 각각 다섯 판이 있는 것을 HTTP로 확인했다.

운영 전환과 최초 및 정정된 Release 첨부, 테스트 알림과 자정 이후 작업 원본: `/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-27/5910893/runtime-and-release-ops-20261026T1600Z/VERIFIED.json`. 운영 Remote Config는 최종 GET에서도 버전10이고 새 지면 세 값이 일치했으며 조건부 덮어쓰기는 없었다. Android와 iOS 실행 기본값은 빈 문자열이며 운영 Remote Config를 읽는다. 지면 ID를 JS 기본값으로 내장한 것으로 표시하지 않는다.
