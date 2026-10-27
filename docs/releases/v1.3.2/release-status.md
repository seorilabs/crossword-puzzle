# v1.3.2 App Store 실행 기록

2026년 10월 27일 10:20 KST 조회에서 `1.3.2 (1003002)`는 `WAITING_FOR_REVIEW`다. 수동 공개이며 승인, 공개 전환과 새 국가 4개 추가는 아직 실행하지 않았다. 기존 한국의 `1.3.1` 공개와 무료 가격은 유지했다. 공개 완료로 판정하지 않는다.

## 고정한 대상

- 사용자 승인: 2026-10-27T00:06:46.029Z, App Store 1.3.2 공개, 한국 유지와 미국, 캐나다, 호주, 뉴질랜드 추가.
- 소스: `3c36e7e88a16ff3b12d490e4cbfb016f3ccbf7c9`, 태그 `v1.3.2`. 이후 기록 PR의 SHA로 후보를 바꾸지 않는다.
- 앱: `6777292094`, `com.seorilabs.crosswordpuzzle`, Team `HCDUXX4Z3X`.
- 버전 ID: `425b5081-813f-4369-b6af-4b79d0c90e0d`.
- 빌드 ID: `fa097088-40d4-42fa-beb7-628611cd775f`, Apple 빌드 `1003002`.
- 심사 제출 ID: `ebdce813-cbb9-4fb2-90d4-9b1508904a4d`, 제출 시각 `2026-10-27T01:19:09.03Z`.
- 원장의 Android 번호 `1001001017`은 할당만 했다. 이번 버전의 Play와 AIT 빌드, 등록정보 쓰기, 제출은 수행하지 않았다.

## 실행과 검증

영문 등록정보와 이미지 원본은 [PR #458](https://github.com/seorilabs/crossword-puzzle/pull/458), 공개 범위와 테스트 계획은 [PR #459](https://github.com/seorilabs/crossword-puzzle/pull/459)로 병합했다. 실제 등록은 한국어와 en-US, en-CA, en-AU 4개 언어다. 뉴질랜드는 Apple의 언어 매핑에 따라 en-AU를 사용한다. 영어 이미지 18장과 보존한 한국어 6장은 모두 처리 완료이며 순서, 원본 체크섬과 표시 이미지를 대조했다. 각 언어의 소개, 부제, 개인정보처리방침, 지원 URL, 출시노트와 심사 연락처를 제출 직전에 재조회했다.

같은 후보에서 독립 개발 환경 L3를 실행했다. 자동 검사 1,185개, 실제 입력 30판, 광고 경계 18개, 기존 생성물 300판의 현재 기준 검사, 서비스 경로 4개와 기존 발행 14판 보존 검사를 통과했다. 1.3.2에서 300판을 새로 생성했다는 뜻은 아니다. 게임 화면과 SDK 코드는 바꾸지 않았으며 기존 화면 검수 1회 실패, 2회 실패, 3회 통과 기록을 보존했다. 새 화면 검수 4회를 수행하지 않았다.

중앙 `a43f2c401855f23171a4a759beb277950928505e`의 App Store 빌드 전, 배포 전, 출시 전 검사를 실제 실행했다. 제출 직전 `2026-10-27T01:18:27.648789Z`에도 `before-release`의 비어 있지 않은 성공 출력과 `ok: true`를 확인했다. 이전 `/tmp` 경로의 실행 없이 종료한 검사와 구분한다. 근거 유효기간은 `2026-11-03T00:18:56.664154Z`까지이며 이후 공개를 진행할 때에는 개발 실행 근거를 갱신하고 중앙 검사도 다시 통과해야 한다.

[기존 archive workflow](https://github.com/seorilabs/crossword-puzzle/actions/runs/40427022085)를 `upload=false`로 실행해 원본 archive를 내려받았다. 실제 archive의 버전, 빌드, bundle ID, 배포 인증서, provisioning profile, entitlement, 아이콘, 최종 Info.plist와 개인정보 manifest를 포함한 41개 정적 검사를 독립 실행했다. 같은 archive를 기존 등록 서명으로 export하고 업로드했다. 재빌드와 두 번째 업로드는 하지 않았다.

`xcodebuild`의 실제 export와 upload는 종료 코드 0이다. 그 뒤 자체 불변 검사 한 건은 종료 코드 1이었다. Xcode가 archive 최상위 Info.plist에 `Distributions` 이력을 추가했기 때문이다. 원본 판정은 보존했고 독립 재검사에서 기존 최상위 값, 나머지 66개 파일의 내용과 모드, 앱 본문과 서명이 같음을 확인했다. export 이후 archive 전체가 그대로라고 기록하지 않는다. 원본 ZIP은 바뀌지 않았다.

Apple API에서 빌드 `VALID`, `APP_STORE_ELIGIBLE`, 암호화 신고 `false`를 확인했다. 기존 TestFlight 내부 그룹 `b0587880-a87c-46df-abf7-050d1090d09d`에 대상 빌드가 포함되고 `IN_BETA_TESTING`이다. 등록된 릴리스 스킬의 Discord `release-ops` 경로로 내부 테스트 링크와 현재 상태를 알렸다. 사용자 빌드 확인은 진행 조건으로 두지 않았다.

심사 항목 하나가 위 버전과 빌드에 연결됐고, 버전과 제출 모두 `WAITING_FOR_REVIEW`, 공개 방식 `MANUAL`임을 API로 재조회했다. 국가 변경은 하지 않았으며 한국만 판매 중이다. 한국과 새 국가 4개의 현재 가격과 예약 가격은 모두 0이다. 연령은 4+, 콘텐츠 권리 신고와 심사 연락처를 보존했다. App Privacy 기존 8개 신고는 SDK, 수집과 추적 코드 변경 없이 이어받았다. 전체 Console 설문을 새로 읽거나 저장했다고 기록하지 않는다.

실제 기기 조회, 설치와 실행, 실제 광고 SDK 노출은 미실행이다. 개발 환경의 대체 실행과 App Store 조회가 해당 근거를 대신하지 않는다. 현재 빌드의 운영 이벤트 수신도 아직 관찰하지 못했다.

추가 Play 준비 검사는 7개 실패했다. [PR #460](https://github.com/seorilabs/crossword-puzzle/pull/460)에서 이전 통과 표기를 철회했으며 App Store 결과에 합치지 않는다. 원래 v1.3.1의 Play 확인과 AIT 동의 등 미응답 상태는 별도로 남아 있다.

## 보관 위치

원본 archive ZIP은 112,959,064바이트, SHA-256 `150f6acdc742df2785f3ec1923f2679f844ab8b60e13e9bebbe55447b423a059`이다. NAS 사본을 직접 읽어 크기와 해시를 대조했고 ZIP 내부 목록, CRC와 각 파일 내용 해시도 대조했다. archive 검증 목록의 SHA-256은 `de4d9971c45958997899b69dd7e56f9b97a26c3c280fc466cd1a55a316099fe6`, 제출 검증 목록은 `516d8fa38b758138cc2cf916fcfe1be4cb51adfb9a6ee46a83d87c6150b98b2a`다.

- archive: `/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-27/3c36e7e/app-store-artifact-20261027T012239Z/VERIFIED.json`
- 제출 원시 응답과 실행 로그: `/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-27/3c36e7e/app-store-submission-20261027T012239Z/VERIFIED.json`
- 독립 L3: `/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-27/3c36e7e/independent-l3-20261027T001704Z/VERIFIED-MANIFEST.json`
- 등록정보와 이미지 적용: `/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-27/app-store-v1.3.2/metadata-applied-20261027T004448Z/VERIFIED.json`
- archive 정적 검사: `/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-27/3c36e7e/archive-static-20261027T005528Z/VERIFIED-MANIFEST.json`
- export 후 독립 확인: `/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-27/3c36e7e/post-export-static-20261027T010710Z/VERIFIED-MANIFEST.json`

## 남은 단계

Apple 심사 승인 뒤 정확한 `1.3.2 (1003002)`를 수동 공개한다. 영문 버전의 실제 공개를 확인한 뒤 한국을 유지하면서 USA, CAN, AUS, NZL 네 나라만 추가한다. 변경 전후 국가 목록과 무료 가격을 다시 읽고 승인 국가 외 변경이 없음을 확인한다. 이후 5개국 공개 상품 페이지에서 버전과 등록정보를 읽는다. 추가 사용자 승인은 필요하지 않다.

장기 심사를 재개할 때에는 실제 버전, 빌드, 제출 ID와 심사 상태부터 다시 조회한다. 현재 세션에 범용 반복 실행 도구가 없어 자동 공개 감시는 설정하지 않았다. 승인이나 공개가 확인되지 않은 상태를 완료로 표시하지 않는다. `launch_ledger.py check`는 현재 공개 목표 미완료로 종료 코드 1이며 승인, 공개, 공개 조회와 운영 이벤트 수신을 미확인으로 남긴다.
