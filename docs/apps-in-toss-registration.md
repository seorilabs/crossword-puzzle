# AppsInToss 앱 등록 정보

> ⚠️ 이 문서는 **비게임** 앱 `crossword-puzzle`(miniAppId 36555)의 최초 등록 기준이다.
> 게임 카테고리 재등록(`crossword-puzzle-game` / 56407, 앱 이름 "가로세로 낱말")의 확정 메타데이터·이미지·MCP 페이로드는
> [`release-assets/apps-in-toss/registration-metadata.md`](../release-assets/apps-in-toss/registration-metadata.md)를 참고한다.
> 아래 앱 내 기능·검수 메모 등은 게임 등록에도 그대로 유효하다.

## 출시 방향

- 1차 론칭 목표는 AppsInToss WebView다.
- Google Play / App Store 출시는 AIT 론칭 이후 후속 트랙으로 진행한다.
- 콘솔 등록 필드는 이 문서의 진행 blocker로 보지 않는다.
- 현재 검수 blocker는 AIT 라이브 광고 QA다. Firebase Analytics 이벤트 QA와 힌트 출처/라이선스 고지는 확인 완료했다.

## 검증 기준

| 항목                  | 확인값                                           | 근거                                                                     |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| 한국어 앱 이름        | `가로세로 낱말 퍼즐`                               | AppsInToss Console 앱 설정(SDK 3.x부터 config에서 제거), 앱 상단 제목    |
| appName               | `crossword-puzzle-game`                          | `apps-in-toss.config.ts`의 `appName` (package.json의 name과 다름)        |
| 대표 색상             | `#00A88F`                                        | `apps-in-toss.config.ts`의 `brand.primaryColor`                          |
| 앱 유형               | 게임 / 퍼즐 후보                                 | 기획서와 현재 구현이 낱말 퍼즐 앱                                        |
| 실제 구현 라우팅      | `/`, `/today`, `/history`, `/result`, `/license` | 홈, 퍼즐 풀기, 기록, 결과, 출처/라이선스 화면                            |
| 권한                  | 없음                                             | `apps-in-toss.config.ts`의 `permissions: []`                             |
| 저장 방식             | 기기 로컬 저장                                   | `localStorage`에 날짜별 미션, 퍼즐별 진행 상태, 힌트 사용/보상 횟수 저장 |
| 광고                  | 결과 전면, 힌트 보상형                           | AppsInToss 인앱 광고 2.0 ver2                                            |
| 분석                  | AppsInToss Analytics, Firebase Analytics         | 화면 진입, 힌트 사용, 광고 이벤트, 퍼즐 참여자/완료율 집계용 이벤트      |
| 로그인/결제/서버 저장 | 없음                                             | 현재 코드 기준 미구현                                                    |

검수 주의:

- `index.html`의 `<title>`은 `가로세로 낱말 퍼즐`로 맞춘다.
- `brand.icon`은 AppsInToss Console 업로드 로고 HTTPS URL로 설정했다.
- 힌트 출처/라이선스는 홈 하단 고지와 `/license` 화면에서 확인한다. 이 표시는 Remote Config로 숨기지 않는다.
- 개발용 시뮬레이터는 개발 환경에서만 `/dev/simulator`로 접근한다. 앱 내 기능 URL에는 등록하지 않는다.

## 콘솔 앱 기본정보

| 콘솔 항목          | 입력값                                                                           |
| ------------------ | -------------------------------------------------------------------------------- |
| 한국어 앱 이름     | 가로세로 낱말 퍼즐                                                                 |
| 영어 앱 이름       | Word Cross                                                                       |
| appName            | crossword-puzzle                                                                 |
| 부제               | 매일 한 판 낱말퀴즈                                                              |
| 고객 문의 이메일   | cs@seorilabs.com                                                                 |
| 고객 문의 전화번호 | 확정 필요                                                                        |
| 채팅 상담 주소     | 확정 필요                                                                        |
| 카테고리           | 게임 / 퍼즐 후보, 콘솔 실제 선택지 확인 필요                                     |
| 사용 연령/등급     | 확정 필요, 게임 등록 시 등급분류 요건 확인 필요                                  |
| 대표 색상          | #00A88F                                                                          |
| 앱 로고 URL        | https://static.toss.im/appsintoss/38345/15757b74-afc5-4f91-acc9-19602ffb73e6.png |
| 검색 키워드        | 가로세로, 낱말, 퍼즐, 퀴즈, 단어, 한글, 두뇌, 매일, crossword, word, puzzle      |

### 한 줄 설명

```text
여러 낱말이 교차하는 한글 가로세로 퍼즐을 매일 한 판 풉니다.
```

### 상세 설명 입력문

```text
가로세로 낱말 퍼즐은 여러 한글 낱말이 서로 글자를 공유하며 교차하는 날짜별 퍼즐을 제공하는 앱입니다.

사용자가 앱을 열면 홈 화면 상단의 날짜 카드를 좌우로 넘겨 이전 날짜 퍼즐을 선택하고, 선택한 낱말 미션의 남은 도전 횟수, 진행률, 대표 단서를 확인합니다. `미션 시작`을 누르면 퍼즐 풀기 화면으로 이동하고, 날짜별로 최대 3번까지 도전할 수 있습니다. 이미 시작한 미션은 남은 도전 횟수를 추가로 쓰지 않고 이어 풀 수 있습니다.

퍼즐판의 칸이나 힌트 목록을 누르면 해당 가로 또는 세로 단어가 선택되고, 사용자는 힌트를 읽은 뒤 정답을 입력합니다. 막히는 경우 기본 제공 힌트로 선택한 단어의 다음 글자를 확인할 수 있고, 기본 힌트를 모두 사용하면 보상형 광고를 본 뒤 추가 힌트를 받을 수 있습니다. 풀이가 끝나면 결과 화면에서 완료 단어 수, 사용한 힌트 횟수, 남은 도전 횟수를 확인합니다.

날짜별 미션 상태, 퍼즐 진행 상태, 힌트 사용/보상 횟수는 사용자의 기기에 저장됩니다. 로그인, 결제, 서버 저장, 민감정보 수집은 사용하지 않습니다. 서비스 개선과 광고 QA를 위해 화면 진입, 힌트 사용, 광고 로드/보상 이벤트를 분석 도구로 기록합니다. 퍼즐별 참여자/완료율은 사용자별 진행 정보를 노출하지 않고 시작/완료 이벤트를 집계한 숫자만 표시합니다. 정답 후보는 공공/오픈 사전 데이터를 바탕으로 확인하고, 기존 신문, 앱, 블로그, 출판물의 퍼즐 문제나 격자를 복제하지 않습니다.
```

## 출시 검토 요청

### 출시노트

```text
가로세로 낱말 퍼즐은 홈 화면 상단의 날짜 카드에서 퍼즐을 선택해 날짜별 최대 3번까지 한글 낱말 퍼즐에 도전하는 앱입니다. 사용자는 퍼즐판 칸이나 힌트 목록을 눌러 단어를 선택하고, 정답을 입력하거나 힌트를 확인할 수 있습니다. 기본 힌트를 모두 사용하면 보상형 광고를 보고 추가 힌트를 받을 수 있습니다. 날짜별 미션 상태, 풀이 진행 상태, 힌트 사용/보상 횟수는 기기 로컬 저장소에 저장됩니다. 로그인, 결제, 서버 저장, 민감정보 수집은 없습니다.
```

### 앱 내 기능

현재 코드 기준으로 실제 열리는 주요 사용자용 기능만 등록한다. 출처/라이선스 화면(`/license`)은 홈에서 접근 가능한 고지 화면이므로 앱 내 기능 딥링크 등록 대상에서 제외한다. 개발용 `/dev/simulator`도 제외한다.

| 한국어 기능 이름 | 영어 기능 이름 | 이동 URL                            | 검증 메모                                      |
| ---------------- | -------------- | ----------------------------------- | ---------------------------------------------- |
| 미션             | Mission        | `intoss://crossword-puzzle/`        | 홈 화면에서 날짜별 미션과 도전 횟수를 확인한다 |
| 퍼즐 풀기        | Play Puzzle    | `intoss://crossword-puzzle/today`   | 선택한 날짜의 퍼즐 풀이 화면이 열린다          |
| 기록             | History        | `intoss://crossword-puzzle/history` | 선택한 날짜의 미션 진행/완료 기록을 확인한다   |

기능명 검토:

- 한국어 기능 이름은 10자 이하.
- 영어 기능 이름은 15자 이하.
- 특수문자와 이모지 없음.
- 이동 URL은 현재 구현된 사용자용 경로만 사용.

## 이미지 준비

| 항목       | 파일                                                      | 규격             | 상태   |
| ---------- | --------------------------------------------------------- | ---------------- | ------ |
| 앱 로고    | `public/crossword-puzzle-icon-600.png`                    | `600 x 600` PNG  | 생성됨 |
| 썸네일     | `public/crossword-puzzle-thumbnail-1932x828.png`          | `1932 x 828` PNG | 생성됨 |
| 스크린샷 1 | `public/screenshots/crossword-puzzle-start-636x1048.png`  | `636 x 1048` PNG | 생성됨 |
| 스크린샷 2 | `public/screenshots/crossword-puzzle-main-636x1048.png`   | `636 x 1048` PNG | 생성됨 |
| 스크린샷 3 | `public/screenshots/crossword-puzzle-result-636x1048.png` | `636 x 1048` PNG | 생성됨 |

편집용 원본:

- `public/crossword-puzzle-icon-600.svg`
- `public/crossword-puzzle-thumbnail-1932x828.svg`

## 제작 방향

- 한국어 앱 이름: `가로세로 낱말 퍼즐`
- appName: `crossword-puzzle`
- 대표 색상: `#00A88F`
- 핵심 화면: 날짜별 한글 가로세로 퍼즐, 상단 날짜 카드, 힌트 확인, 교차 정답 타일
- 로고: 초록 배경 위에 한글 낱말이 교차하는 퍼즐판 심볼
- 썸네일: 실제 퍼즐 데이터의 8x8 보드와 힌트-정답 교차 흐름을 와이드 화면에 구성

## 검수 메모

- 로고와 썸네일은 Toss 제공 아이콘, 이미지 리소스, 외부 저작물 없이 자체 SVG로 제작했다.
- 세로 스크린샷 3장은 로컬 앱을 실행해 실제 UI에서 캡처했다.
- 앱 아이콘과 표시 이름은 SDK 3.x에서 config 필드(`brand.icon`, `brand.displayName`)가 제거돼 AppsInToss Console 앱 설정이 정본이다. 저장소에는 값을 두지 않는다.
- 현재 퍼즐 힌트는 한국어기초사전 뜻풀이 기반이다. 앱 홈과 `/license` 화면에서 출처와 `CC-BY-SA-2.0-KR` 조건을 상시 표시한다. 검수 대상 문장은 `docs/hint-license-review.md`에 정리했다.
- 광고 그룹 ID는 힌트 보상형 `ait.v2.live.bf12924f4bf84b74`를 사용한다. (결과 전면 광고 `ait.v2.live.a1439d344fa34821`는 광고 힌트 한정 리팩터에서 제거됨)
- 보상형 광고 힌트는 `userEarnedReward` 이벤트 수신 즉시 지급한다. `dismissed`는 광고 닫힘 이벤트일 뿐 보상 지급 근거로 쓰지 않는다.
- Firebase Analytics / Remote Config 설정과 QA는 `docs/firebase-analytics-remote-config.md`를 기준으로 한다. Firebase Web app 값은 GitHub Variables에 등록해 AIT 배포 워크플로에서 읽는다.
- 퍼즐별 참여자/완료율은 `docs/puzzle-completion-stats.md`의 공개 JSON 계약과 Remote Config gate를 기준으로 한다.

## 남은 QA

- AIT 라이브 광고 로드/보상/전면 노출 QA
- Firebase Analytics 이벤트 수집 QA: 완료
- 참여자/완료율 집계 JSON 최초 생성 후 Remote Config gate 전환 QA
