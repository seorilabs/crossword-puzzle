# 리서치 조사서

- 제품명: 말길: 가로세로 모험 (제안명)
- 문서 상태: draft
- 소유자: Product/Game Design
- 버전/수정일: v0.2 / 2026-07-17
- Source of truth: 외부 시장, 경쟁작, 공개 리뷰에 관한 근거는 본 조사서가 소유한다. 현재 제품의 실제 동작과 3마켓 제약은 저장소 코드와 repo-local docs가 우선하며, 기존 승인 기획 의도는 Obsidian의 `프로젝트/개인/가로세로낱말퍼즐/01 기획서.md` 및 알고리즘 설계 문서가 우선한다. `DEC-015`만 2026-07-17 Obsidian source에 동기화했으며, 본 조사서의 나머지 제안은 사용자 승인 전까지 기존 계획을 덮어쓰지 않는다.
- Depends on: README.md, docs/architecture.md, docs/apps-in-toss-registration.md, Obsidian 프로젝트/가로세로낱말퍼즐
- Open blockers: BLK-RES-001, BLK-RES-002, BLK-RES-003
- 승인 근거: 부분 승인 — 2026-07-17 사용자 메시지 `구조 다국어, 출시 콘텐츠 한국어 동의.` (`DEC-015`); 그 외 결정은 사용자 승인 전

## 조사 범위

### 조사 질문

- 한국어 단서형 가로세로 퍼즐을 게임엔진 기반의 상용 게임으로 다시 설계할 때 어떤 시장 공백을 노릴 수 있는가?
- 정통 크로스워드의 풀이 신뢰성과 캐주얼 모바일 게임의 캐릭터, 세계 변화, 수집, 일일 복귀 구조를 어떻게 결합할 수 있는가?
- 경쟁작의 첫 세션, 10초 입력 루프, 3분 세션, 7일 복귀 루프에서 반복되는 강점과 이탈 원인은 무엇인가?
- 광고, 구독, 힌트 판매, 수집 경제 중 퍼즐 몰입을 훼손하는 패턴은 무엇인가?
- 현재 저장소가 제공하는 매일 한 판, 한글 교차 단서, 로컬 저장, 보상형 힌트, 3마켓 패리티를 어떤 기준으로 보존하거나 재설계해야 하는가?

### 조사 고정값

| 항목             | 범위                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 조사일           | 2026-07-17                                                                                                                                                      |
| 주 시장          | 대한민국 App Store 및 Google Play                                                                                                                               |
| 비교 시장        | 미국 중심 글로벌 App Store 및 Google Play                                                                                                                       |
| 플랫폼           | iPhone, iPad, Android 스마트폰과 태블릿                                                                                                                         |
| 직접 경쟁작      | 단서를 읽고 교차 답을 입력하거나 정통 크로스워드 경험을 핵심으로 삼는 모바일 제품 5개                                                                           |
| 인접 경쟁작      | 글자 연결, 수집, 여행, 팀 경쟁, 시즌 운영으로 단어 퍼즐을 장기 게임화한 제품 2개                                                                                |
| 현재 제품 기준선 | 날짜별 한글 퍼즐, 최대 3회 도전, 로컬 진행 저장, 기본 및 보상형 힌트, 결과 전면 광고 기본 OFF, 로그인과 IAP가 없는 현재 구현                                    |
| 근거 분류        | FACT는 공식 제품 페이지나 공식 지원 문서에서 확인한 사실, OBSERVATION은 스토어 미디어와 공개 리뷰에서 관찰한 신호, INFERENCE는 여러 근거로부터 도출한 제품 해석 |

### 접근 제한과 표본 편향

- BLK-RES-001: 경쟁작을 실제 기기에 설치해 첫 10분을 직접 조작하지 않았다. 본 문서의 FTUE와 루프 해석은 2026-07-17에 노출된 공식 스토어 설명, 미리보기 영상, 스크린샷, 업데이트 기록, 공개 리뷰를 근거로 한 INFERENCE다.
- BLK-RES-002: Apple과 Google 스토어는 전체 리뷰를 동일 조건으로 내보내지 않고 지역과 계정 상태에 따라 일부만 노출한다. 리뷰 테마는 통계적 빈도가 아니라 여러 제품에서 반복된 문제 신호로만 사용한다.
- BLK-RES-003: 제안명, 핵심 세계관, 타깃 연령, 수익화 모델, 엔진 선택은 사용자 승인 전 단계다. 본 조사서는 시장 근거와 실험 우선순위를 제공하지만 제품 결정을 승인 상태로 만들지 않는다.
- 공식 YouTube에서 최신 버전별 첫 세션 영상을 일관되게 확보하지 못했다. CodyCross의 Google Play 내장 트레일러와 각 제품의 현재 스토어 미디어를 화면 관찰의 기준으로 삼았다.
- 스토어 미디어에는 빌드 버전이 붙지 않으므로 현재 목록에 게시된 화면이 최신 바이너리와 완전히 동일하다는 보장은 없다.
- 앱 평점과 리뷰 수는 국가, 언어, 기기 필터에 따라 달라졌다. 규모 비교는 다운로드 구간과 대략적인 평가 모수만 사용한다.
- Research Gate 상태는 `desk research 완료, 직접 플레이 검증 대기`다. 실제 기기 비교 플레이와 사용자 승인 전에는 상용 기획 승인으로 간주하지 않는다.

### 현재 제품의 관측 기준선

아래 수치는 서로 다른 기간과 작은 표본의 GitHub evidence issue다. 절대 benchmark로 일반화하지 않고 문제 우선순위를 정하는 데만 쓴다.

| 근거                        | 관측                                                                                                                                      | 계획에 주는 의미                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| ISSUE-279, 2026-06-19~07-15 | 도전 시작 52명 중 첫 입력 31명, 완료 24명. 기록된 abandon 68건 중 첫 입력 전 abandon 34건. 신규 D1 10.4%, D7 1.9%                         | 첫 화면보다 첫 조작과 첫 성공을 먼저 검증해야 한다.        |
| ISSUE-264                   | 신규 84명 중 onboarding 노출 15명, 첫 입력 30명, 완료 14명. D1 4.5%, D7 0%                                                                | 기존 온보딩의 노출 자체와 세 시장 배선을 함께 고쳐야 한다. |
| ISSUE-274                   | 28일 완료 21명·42회에 비해 다음 퍼즐 CTA는 2명·3회. D1 7%, D7 0%                                                                          | 결과에서 다음 목표와 지도 진행을 직접 연결해야 한다.       |
| ISSUE-277                   | 보상형 힌트 광고 23회 중 실패 8회로 관측 실패율 35%, 최대 이용자 11명                                                                     | 광고 원자성, 선로딩, 무료 fallback이 수익화보다 선행한다.  |
| ISSUE-278                   | 43일 동안 보너스 퍼즐 이용자는 2명, 같은 분석의 완료 이용자는 24명                                                                        | 추가 보드 광고가 현재의 강한 재방문 장치라는 근거가 없다.  |
| LIVE-20260717, 13:50 KST    | 운영 84개 퍼즐의 1,831개 entry 모두 `needsManualClue=true`, theme 0개, 퍼즐당 평균 entry 21.8개. main의 normal 8×8 `maxWords=10`과 불일치 | 엔진 제작 전 운영 생성기·콘텐츠 gate를 정상화해야 한다.    |

### 운영 감사 재현

```bash
curl -fsSL https://crossword-puzzle-79ae0.web.app/puzzles/manifest.json \
  | jq '{generatedAt,days,keep,puzzleCount:(.puzzles|length),first:.puzzles[0],last:.puzzles[-1]}'
```

```bash
node --input-type=module -e '
const base="https://crossword-puzzle-79ae0.web.app";
const manifest=await (await fetch(`${base}/puzzles/manifest.json`)).json();
const puzzles=await Promise.all(manifest.puzzles.map(async item =>
  await (await fetch(new URL(item.path,base))).json()));
const entries=puzzles.flatMap(puzzle=>puzzle.entries);
console.log({
  puzzles:puzzles.length,
  entries:entries.length,
  manual:entries.filter(entry=>entry.clueSource==="manual").length,
  needsManual:entries.filter(entry=>entry.needsManualClue===true).length,
  difficulties:Array.from(new Set(puzzles.map(puzzle=>puzzle.difficulty))),
  themes:puzzles.filter(puzzle=>puzzle.themeTag).length
});'
```

이 snapshot은 2026-07-17 13:50 KST 관측값이다. 운영 데이터가 바뀌므로 Phase 0A와 매 release에서 다시 실행한다.

## 출처 원장

| Source ID | 유형                   | 제목/발행자                                       | URL                                                                                                                            | 게시·수정일               | 접근일     | 지역/버전            | 지지하는 주장                                                              | 신뢰도 |
| --------- | ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ---------- | -------------------- | -------------------------------------------------------------------------- | ------ |
| SRC-001   | 공식 스토어            | 모두의 가로세로 낱말퀴즈 / Apple                  | https://apps.apple.com/kr/app/id6670780540                                                                                     | 2024-10-18                | 2026-07-17 | KR iOS v1.0.3        | 수족관, 하트, 출석, 통계, 힌트, BGM, 골드 IAP, 공개 리뷰                   | 높음   |
| SRC-002   | 공식 스토어            | 모두의 가로세로 낱말퀴즈 / Google Play            | https://play.google.com/store/apps/details?id=com.durinsoft.fishcrossword&hl=ko&gl=KR                                          | 2025-10-21                | 2026-07-17 | KR Android           | 10K+ 다운로드, 광고, 레벨 테스트, 최신 Android 업데이트                    | 높음   |
| SRC-003   | 공식 스토어            | Crossword Quiz / Google Play                      | https://play.google.com/store/apps/details?id=com.mobirix.crwd&hl=ko&gl=KR                                                     | 2026-05-07                | 2026-07-17 | KR Android           | 1,000개 이상 스테이지, 7,000개 이상 단어, 16개 언어, 업적과 리더보드       | 높음   |
| SRC-004   | 공식 스토어            | Crossword Quiz / Apple                            | https://apps.apple.com/us/app/crossword-quiz/id1519942172                                                                      | 2024-05-27                | 2026-07-17 | US iOS v1.1.2        | 골드 IAP, Game Center 업적과 리더보드, 지원 언어                           | 높음   |
| SRC-005   | 공식 스토어            | CodyCross / Apple                                 | https://apps.apple.com/us/app/codycross-crossword-puzzles/id1092689152                                                         | 2026-07-12                | 2026-07-17 | US iOS v2.12.1       | 캐릭터와 월드, Library, 스트릭, 일일 모드, 구독, 최신 업데이트             | 높음   |
| SRC-006   | 공식 스토어와 트레일러 | CodyCross / Google Play                           | https://play.google.com/store/apps/details?id=com.fanatee.cody&hl=en-US&gl=US                                                  | 동적 스토어 페이지        | 2026-07-17 | US Android           | 100M+ 다운로드, 비밀 단어, 지도와 책 수집, 광고와 IAP                      | 높음   |
| SRC-007   | 공식 스토어            | Crossword Puzzle Redstone / Apple                 | https://apps.apple.com/us/app/crossword-puzzle-redstone/id957848865                                                            | 2026-06-04                | 2026-07-17 | US iOS v1.7.5        | 30,000개 이상 퍼즐, 난이도와 크기, 오프라인, 입력 보조 기능                | 높음   |
| SRC-008   | 공식 스토어            | Crossword Puzzle Redstone / Google Play           | https://play.google.com/store/apps/details?id=mobi.redstonegames.crossword.en&hl=en-US&gl=US                                   | 2026-06-03                | 2026-07-17 | US Android           | 5M+ 다운로드, 83명 저자, 광고, 평생 광고 제거 구매, 공개 리뷰              | 높음   |
| SRC-009   | 공식 스토어            | NYT Games / Apple                                 | https://apps.apple.com/us/app/nyt-games-wordle-crossword/id307569751                                                           | 2026-07-15                | 2026-07-17 | US iOS v6.34.0       | Crossword, Mini, Midi, 요일 난이도, 스트릭, 통계, 배지, 리더보드, 아카이브 | 높음   |
| SRC-010   | 공식 스토어            | NYT Games / Google Play                           | https://play.google.com/store/apps/details?id=com.nytimes.crossword&hl=en-US&gl=US                                             | 동적 스토어 페이지        | 2026-07-17 | US Android           | 멀티게임 허브, 일일 퍼즐, 구독 접근 경계                                   | 높음   |
| SRC-011   | 사용자 커뮤니티        | NYT Games 앱 충돌 보고 / Reddit                   | https://www.reddit.com/r/NYTgames/comments/1ujo11b/nyt_games_app_crashing_games_layout/                                        | 2026-06-30                | 2026-07-17 | iOS와 Android 혼합   | Crossword 도중 종료와 저장 손실 우려                                       | 중간   |
| SRC-012   | 사용자 커뮤니티        | NYT Games 무한 로딩 보고 / Reddit                 | https://www.reddit.com/r/NYTgames/comments/1usvl4d/app_not_loading_puzzles_despite_troubleshooting/                            | 2026-07-10                | 2026-07-17 | 앱과 모바일 웹       | 게임별 로딩 실패와 웹 대체 사용                                            | 중간   |
| SRC-013   | 공식 스토어            | Wordscapes / Apple                                | https://apps.apple.com/us/app/wordscapes-word-game/id1207472156                                                                | 2026-07-15                | 2026-07-17 | US iOS v3.12.70      | 글자 스와이프, 6,000개 이상 퍼즐, 시즌 이벤트, Wildlife, IAP, 공개 리뷰    | 높음   |
| SRC-014   | 공식 지원              | Wordscapes 도움말 허브 / PeopleFun                | https://peoplefun.helpshift.com/hc/en/6-wordscapes/                                                                            | 동적 지원 문서            | 2026-07-17 | 글로벌               | 팀, Wildlife, 이벤트, 계정 복구, 광고, 상점 시스템 목록                    | 높음   |
| SRC-015   | 공식 지원              | Wordscapes Daily Goals / PeopleFun                | https://peoplefun.helpshift.com/hc/en/6-wordscapes/faq/814-what-are-daily-goals/                                               | 2025-11-13 기준 상대 표기 | 2026-07-17 | 레벨 22 이후         | 일일 목표, 보상, 월간 Quest Track, 보상형 광고 교체                        | 높음   |
| SRC-016   | 공식 지원              | Wordscapes Tournaments / PeopleFun                | https://peoplefun.helpshift.com/hc/en/6-wordscapes/faq/286-what-are-wordscapes-tournaments/                                    | 동적 지원 문서            | 2026-07-17 | 레벨 65 이후         | 평일 개인전, 주말 개인전과 팀전, Crowns                                    | 높음   |
| SRC-017   | 공식 지원              | Wordscapes Wildlife / PeopleFun                   | https://peoplefun.helpshift.com/hc/en/6-wordscapes/faq/264-how-do-i-access-my-wildlife-collection/                             | 동적 지원 문서            | 2026-07-17 | 레벨 36 이후         | 동물 수집, Heart Gem, 알 구매, 보너스                                      | 높음   |
| SRC-018   | 공식 스토어            | Words of Wonders / Apple                          | https://apps.apple.com/us/app/words-of-wonders-crossword/id1369521645                                                          | 2026-07-12                | 2026-07-17 | US iOS v5.7.4        | 세계 여행, 글자 연결, 일일 챌린지, 주간 구독, 보석과 힌트                  | 높음   |
| SRC-019   | 공식 스토어            | Words of Wonders / Google Play                    | https://play.google.com/store/apps/details?id=com.fugo.wow&hl=en-US&gl=US                                                      | 2026-06-29                | 2026-07-17 | US Android           | 100M+ 다운로드, 34개 이상 언어, 광고와 IAP, 최근 리뷰                      | 높음   |
| SRC-020   | 공식 지원              | Words of Wonders 플레이 방법 / Fugo               | https://fugosupport.zendesk.com/hc/en-us/articles/19480893885073-How-to-play-the-game                                          | 2024-04-01                | 2026-07-17 | 글로벌               | 글자 스와이프, 유효 단어의 보드 배치, 레벨 완료 규칙                       | 높음   |
| SRC-021   | 공식 지원              | Words of Wonders 광고 제거 / Fugo                 | https://fugosupport.zendesk.com/hc/en-us/articles/19483246707089-Does-the-remove-ads-offer-remove-ads-permanently              | 2024-04-03                | 2026-07-17 | 글로벌               | 자동 광고 영구 제거와 선택형 보상 광고 유지                                | 높음   |
| SRC-022   | 공식 지원              | Words of Wonders 저장 / Fugo                      | https://fugosupport.zendesk.com/hc/en-us/articles/19482988689297-How-can-I-save-my-progress                                    | 2024-06-07                | 2026-07-17 | 글로벌               | 기기 자동 저장과 계정 기반 기기 간 복구                                    | 높음   |
| SRC-023   | 사용자 커뮤니티        | Redstone 테마 메타데이터 누락 사례 / Reddit       | https://www.reddit.com/r/crossword/comments/1tsk7tg/redstone_crossword_question/                                               | 2026-06-01                | 2026-07-17 | Android와 iOS 사용자 | starred entry와 원본 테마 정보 누락 문제                                   | 중간   |
| SRC-024   | 운영 데이터            | Crossword Puzzle live manifest / Firebase Hosting | https://crossword-puzzle-79ae0.web.app/puzzles/manifest.json                                                                   | 2026-07-17 생성본         | 2026-07-17 | production           | 84개 공개 puzzle의 버전, 난이도, content path와 운영 드리프트              | 높음   |
| SRC-025   | 제품 분석              | GitHub ISSUE-279 첫 입력·완료 퍼널                | https://github.com/seorilabs/crossword-puzzle/issues/279                                                                       | 2026-07                   | 2026-07-17 | GA4 2026-06-19~07-15 | 첫 입력 전 이탈, 완료, D1/D7의 작은 표본 기준선                            | 높음   |
| SRC-026   | 제품 분석              | GitHub ISSUE-264 온보딩 퍼널                      | https://github.com/seorilabs/crossword-puzzle/issues/264                                                                       | 2026-07                   | 2026-07-17 | GA4 snapshot         | onboarding 노출, 첫 입력, 완료 연결 누락                                   | 높음   |
| SRC-027   | 제품 분석              | GitHub ISSUE-274 다음 퍼즐 CTA                    | https://github.com/seorilabs/crossword-puzzle/issues/274                                                                       | 2026-07                   | 2026-07-17 | GA4 28일             | 완료 후 다음 퍼즐 전환 부족                                                | 높음   |
| SRC-028   | 제품 분석              | GitHub ISSUE-277 보상형 힌트 광고 실패            | https://github.com/seorilabs/crossword-puzzle/issues/277                                                                       | 2026-07                   | 2026-07-17 | GA4 28일             | 광고 load·show 실패와 작은 표본                                            | 높음   |
| SRC-029   | 제품 분석              | GitHub ISSUE-278 보너스 퍼즐 사용                 | https://github.com/seorilabs/crossword-puzzle/issues/278                                                                       | 2026-07                   | 2026-07-17 | GA4 43일             | 보너스 퍼즐 소비와 계측 부족                                               | 높음   |
| SRC-030   | 공식 디자인            | Game controls / Apple                             | https://developer.apple.com/design/human-interface-guidelines/game-controls                                                    | 동적 공식 문서            | 2026-07-17 | iOS/iPadOS           | 빈번한 조작 44×44pt, 상태 피드백, safe area                                | 높음   |
| SRC-031   | 공식 개발              | Accessibility in apps / Android                   | https://developer.android.com/guide/topics/ui/accessibility/apps                                                               | 2026-06-16 수정           | 2026-07-17 | Android              | 48×48dp touch target와 색·텍스트 접근성                                    | 높음   |
| SRC-032   | 공식 정책              | Ads policy / Google Play                          | https://support.google.com/googleplay/android-developer/answer/9857753                                                         | 동적 공식 정책            | 2026-07-17 | Google Play          | 예기치 않은 전면 광고와 콘텐츠 시작 광고 금지                              | 높음   |
| SRC-033   | 공식 정책              | App Review Guidelines / Apple                     | https://developer.apple.com/app-store/review/guidelines/                                                                       | 동적 공식 정책            | 2026-07-17 | App Store            | 광고, 개인정보, 최소 기능, 아동 범주 경계                                  | 높음   |
| SRC-034   | 공식 개발              | AppsInToss 게임 출시 체크리스트                   | https://developers-apps-in-toss.toss.im/checklist/app-game.html                                                                | 동적 공식 문서            | 2026-07-17 | AIT                  | 광고 선로딩·보상·pause/resume와 게임 품질 기준                             | 높음   |
| SRC-035   | 공식 개발              | AppsInToss Game Center 소개                       | https://developers-apps-in-toss.toss.im/game-center/intro.html                                                                 | 동적 공식 문서            | 2026-07-17 | AIT                  | 플레이 전 게임 프로필 요구와 점수 제출 경계                                | 높음   |
| SRC-036   | 공식 엔진              | Phaser 4.2 release / Phaser                       | https://phaser.io/news/2026/06/phaser-v4-2-0-released                                                                          | 2026-06                   | 2026-07-17 | Phaser 4.2           | 현재 Web 2D 엔진 후보의 release 근거                                       | 높음   |
| SRC-037   | 공식 엔진              | Godot release policy                              | https://docs.godotengine.org/en/stable/about/release_policy.html                                                               | 2026                      | 2026-07-17 | Godot 4.6            | 지원 branch와 release cadence                                              | 높음   |
| SRC-038   | 공식 개발              | AppsInToss Unity SDK 시작하기                     | https://developers-apps-in-toss.toss.im/unity/sdk/getting-started.html                                                         | 동적 공식 문서            | 2026-07-17 | Unity WebGL/AIT      | Unity 공식 AIT SDK와 bridge 지원                                           | 높음   |
| SRC-039   | 공식 엔진              | Phaser download archive / Phaser                  | https://phaser.io/download/archive                                                                                             | 2026-07-09                | 2026-07-17 | Phaser 4.2.1         | 수직 슬라이스에 pin할 최신 stable patch                                    | 높음   |
| SRC-040   | 공식 엔진              | Godot 4.6.3 stable / Godot                        | https://godotengine.org/download/archive/4.6.3-stable/                                                                         | 2026                      | 2026-07-17 | Godot 4.6.3          | 네이티브·Web 대안 엔진 버전                                                | 높음   |
| SRC-041   | 공식 엔진              | Unity releases / Unity                            | https://unity.com/releases/unity-6                                                                                             | 동적 공식 문서            | 2026-07-17 | Unity 6.3 LTS        | AIT 공식 SDK 후보 엔진의 LTS 기준                                          | 높음   |
| SRC-042   | 공식 개발              | AppsInToss 배포 / Toss                            | https://developers-apps-in-toss.toss.im/development/deploy.html                                                                | 동적 공식 문서            | 2026-07-17 | AIT                  | `.ait` 배포 크기와 배포 계약                                               | 높음   |
| SRC-043   | 공식 개발              | AppsInToss Unity 성능 측정 / Toss                 | https://developers-apps-in-toss.toss.im/unity/optimization/perf-measure.html                                                   | 동적 공식 문서            | 2026-07-17 | AIT Unity            | 시작, FPS, memory 측정 기준의 외부 참고선                                  | 높음   |
| SRC-044   | 공식 개발              | AppsInToss Storage / Toss                         | https://developers-apps-in-toss.toss.im/bedrock/reference/framework/%EC%A0%80%EC%9E%A5%EC%86%8C/Storage.html                   | 동적 공식 문서            | 2026-07-17 | AIT                  | 영속 저장 API와 origin 간 저장 경계                                        | 높음   |
| SRC-045   | 공식 개발              | AppsInToss WebView 속성 / Toss                    | https://developers-apps-in-toss.toss.im/bedrock/reference/framework/%EC%86%8D%EC%84%B1%20%EC%A0%9C%EC%96%B4/webview-props.html | 동적 공식 문서            | 2026-07-17 | AIT                  | back gesture와 WebView 속성 제어                                           | 높음   |
| SRC-046   | 공식 개발              | AppsInToss Safe Area / Toss                       | https://developers-apps-in-toss.toss.im/bedrock/reference/framework/%ED%99%94%EB%A9%B4%20%EC%A0%9C%EC%96%B4/safe-area.html     | 동적 공식 문서            | 2026-07-17 | AIT                  | framework X 버튼과 safe area                                               | 높음   |
| SRC-047   | 공식 개발              | AppsInToss 게임 사용자 식별키 / Toss              | https://developers-apps-in-toss.toss.im/bedrock/reference/framework/%EA%B2%8C%EC%9E%84/getUserKeyForGame.html                  | 동적 공식 문서            | 2026-07-17 | AIT                  | 게임 사용자 key와 미지원 fallback                                          | 높음   |
| SRC-048   | 공식 개발              | React Native WebView Guide                        | https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md                                         | 동적 공식 문서            | 2026-07-17 | Android/iOS          | local HTML과 platform별 asset path 제약                                    | 높음   |
| SRC-049   | 공식 정책              | Google Play WebView JS interface security         | https://support.google.com/googleplay/android-developer/answer/10768383?hl=en                                                  | 동적 공식 정책            | 2026-07-17 | Android              | 제한된 콘텐츠, bridge와 navigation 보안                                    | 높음   |
| SRC-050   | 공식 개발              | Phaser renderer lifecycle                         | https://docs.phaser.io/api-documentation/4.0.0/event/renderer-events                                                           | 동적 공식 문서            | 2026-07-17 | Phaser 4             | WebGL context loss와 restore event                                         | 높음   |
| SRC-051   | 공식 개발              | Android frame rate optimization                   | https://developer.android.com/games/optimize/framerate                                                                         | 동적 공식 문서            | 2026-07-17 | Android              | frame time P90/P99와 hitch 관측                                            | 높음   |

## 경쟁작 매트릭스

### 선정 제품

| ID       | 구분 | 제품                      | 시장 신호                    | 선정 이유                                                            |
| -------- | ---- | ------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| COMP-001 | 직접 | 모두의 가로세로 낱말퀴즈  | KR Google Play 10K+ 다운로드 | 한국어 단서 퍼즐과 수족관 수집을 결합한 가장 가까운 게임화 사례      |
| COMP-002 | 직접 | Crossword Quiz            | Google Play 100K+ 다운로드   | 한국 개발사의 스테이지형 다국어 단서 퍼즐, 업적과 리더보드 기준선    |
| COMP-003 | 직접 | CodyCross                 | Google Play 100M+ 다운로드   | 캐릭터, 세계, 책 수집, 일일 임무를 결합한 대규모 어드벤처형 사례     |
| COMP-004 | 직접 | Crossword Puzzle Redstone | Google Play 5M+ 다운로드     | 저자형 정통 크로스워드와 모바일 입력 품질의 기준선                   |
| COMP-005 | 직접 | NYT Games                 | US App Store 292K 평가       | 일일 의식, 요일 난이도, 스트릭, 기록, 친구 비교의 프리미엄 기준선    |
| ADJ-001  | 인접 | Wordscapes                | Google Play 100M+ 다운로드   | 코어 퍼즐 뒤에 수집, 팀, 시즌, 토너먼트를 순차 해금한 장기 운영 사례 |
| ADJ-002  | 인접 | Words of Wonders          | Google Play 100M+ 다운로드   | 여행 판타지와 글자 연결, 일일 챌린지, 구독을 결합한 글로벌 사례      |

### 경험과 시스템 비교

| 제품     | 포지셔닝과 FACT                                                                                                 | 10초 루프                                                    | 3분 루프                                                         | 7일 루프                                                                                       | FTUE와 화면 관찰                                                                                                    | 경제와 수익화                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| COMP-001 | FACT: 단서형 가로세로 퍼즐을 풀어 하트를 받고 물고기와 수족관을 확장한다. 출석, 통계, 힌트, 레벨 테스트가 있다. | INFERENCE: 단서나 칸 선택, 답 입력, 교차 글자로 다음 답 추론 | INFERENCE: 한 보드의 여러 단서를 해결하고 하트 보상 획득         | INFERENCE: 출석과 하트를 누적해 물고기 수집 확장                                               | OBSERVATION: 스토어와 리뷰는 감성 음악, 글귀, 수족관을 강조한다. 첫 제어권과 첫 광고 시점은 BLK-RES-001 범위다.     | FACT: Google Play 광고, App Store 골드 IAP가 있다. 하트와 골드의 교환 관계는 공개 설명에서 확인되지 않았다. |
| COMP-002 | FACT: 1,000개 이상 스테이지와 7,000개 이상 단어, 힌트, 업적, 리더보드를 제공한다.                               | INFERENCE: 단서 확인, 제공 글자 선택, 정답 판정              | INFERENCE: 한 스테이지의 답을 채우고 다음 단계로 이동            | INFERENCE: 스테이지 진척, 업적, 리더보드가 복귀 이유이며 공개된 주간 이벤트는 확인되지 않았다. | INFERENCE: 쉬운 초기 스테이지에서 입력을 가르치는 구조로 보인다. 실제 첫 세션은 BLK-RES-001 범위다.                 | FACT: 광고와 골드 팩 IAP를 사용한다. 공개 상품에서 구독은 보이지 않는다.                                    |
| COMP-003 | FACT: 외계인 캐릭터가 지구를 배우는 이야기, 테마 보드, 비밀 단어, 월드 맵, Library, 프로필과 꾸미기를 제공한다. | INFERENCE: 단서 하나의 답 입력, 행 완성, 비밀 단어 글자 개방 | INFERENCE: 보드와 비밀 단어 완료, 지도 핀과 책 보상 진척         | FACT: Daily Streak, Today’s Password, 일일 테마 퍼즐, Mission과 이벤트, Library 수집           | OBSERVATION: 스토어 미디어는 캐릭터와 세계를 퍼즐판보다 먼저 판타지로 제시한다. 시즌별 홈 업데이트도 운영한다.      | FACT: 강제 광고와 보상 광고, Bitz IAP, 광고 제거와 추가 보상을 묶은 구독이 있다.                            |
| COMP-004 | FACT: 83명 안팎 저자의 30,000개 이상 퍼즐, Mini, Midi, 15×15, 4단계 난이도, 오프라인과 입력 보조를 제공한다.    | INFERENCE: 칸이나 단서 선택, 키보드 입력, 교차 답 확인       | INFERENCE: Mini 또는 Midi 한 판 완료, 15×15는 장기 세션          | INFERENCE: 새 퍼즐 팩과 저자별 콘텐츠 소비가 주 복귀 이유다. 캐릭터 경제는 없다.               | OBSERVATION: 격자와 단서가 화면의 주인공이며 장식보다 읽기와 입력 효율을 우선한다.                                  | FACT: 광고와 평생 광고 제거 일회성 구매를 사용하며 구독은 없다.                                             |
| COMP-005 | FACT: Crossword, Mini, Midi와 다른 일일 게임을 한 허브에 제공하며 Crossword 난이도는 요일에 따라 상승한다.      | INFERENCE: 단서 선택, 글자 또는 단어 입력, 교차 검증         | INFERENCE: Mini나 Midi 일일 승리, 기록 확인과 친구 비교          | FACT: 요일 난이도, 스트릭, 통계, 배지, 친구 리더보드, 10,000개 이상 아카이브                   | OBSERVATION: 편집형 타이포그래피와 절제된 색으로 일일 콘텐츠와 기록을 중심에 둔다. 서사형 튜토리얼은 보이지 않는다. | FACT: Games 월 구독과 아카이브 접근을 중심으로 수익화하며 스토어는 광고 포함도 표시한다.                    |
| ADJ-001  | FACT: 글자 원을 스와이프해 격자를 채우고 풍경을 진행한다.                                                       | FACT: 글자 연결, 유효 단어 즉시 배치                         | INFERENCE: 짧은 레벨 여러 개 완료, 코인과 이벤트 점수 누적       | FACT: Daily Goals, 월간 Quest, Wildlife, 평일과 주말 토너먼트, 팀과 Crowns                     | FACT: 코어 퍼즐을 먼저 제공하고 레벨 22에 일일 목표, 36 이후 Wildlife, 65 이후 토너먼트를 연다.                     | FACT: 광고, 코인, Piggy Bank, 번들, 프리미엄 이벤트 보상, 알과 Heart Gem이 있다.                            |
| ADJ-002  | FACT: 글자를 이어 격자를 채우며 세계 명소를 순회한다.                                                           | FACT: 끊지 않는 스와이프, 유효 단어의 보드 배치              | INFERENCE: 장소별 레벨을 연속 완료하고 다음 명소와 보상으로 이동 | OBSERVATION: 일일 챌린지, 이전 퍼즐, 보석, 아바타, 나비와 경쟁 보상이 반복 노출된다.           | INFERENCE: 적은 글자와 첫 명소로 바로 시작하고 난이도를 올린다. 실제 광고 노출 순서는 BLK-RES-001 범위다.           | FACT: 자동 광고, 영구 광고 제거, 보상 영상, 주 $3.99 Pro 구독, 보석과 힌트 상품이 있다.                     |

### 제품별 강점, 문제, 우리에게 주는 의미

| 제품     | OBSERVATION: 강점                                                                            | OBSERVATION: 리뷰 문제                                                                                                       | INFERENCE: 우리에게 주는 의미                                                                 |
| -------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| COMP-001 | 어려운 사자성어, 교차 글자를 통한 자기 힌트, 음악과 글귀, 물고기 수집이 긍정적으로 언급된다. | 공개 리뷰 표본이 작고 업데이트가 오답과 오타 수정에 집중된다.                                                                | 한국 시장에서도 퍼즐 밖의 감성 메타가 받아들여지지만 콘텐츠 검수와 장기 운영 규모가 병목이다. |
| COMP-002 | 대량 스테이지, 다국어, 업적과 리더보드로 단순한 진행 목표를 제공한다.                        | 오래된 리뷰에서 같은 글자가 여러 개일 때 올바른 철자도 오답 처리되는 입력 문제가 반복됐다. 현재 재현 여부는 확인하지 않았다. | 한국어 IME, 중복 자모, 자동 이동, 정답 판정은 연출보다 먼저 결정적 테스트로 잠가야 한다.      |
| COMP-003 | 캐릭터, 지도, 책 수집, 꾸미기, 스트릭이 장기 플레이 이유를 만든다.                           | 2026 리뷰에서 매 라운드 광고, 긴 종료 절차, 광고로 인한 보상 손실, 난이도 급변과 생소한 단서가 반복된다.                     | 세계와 수집은 유효하지만 퍼즐 흐름을 끊는 광고와 무작위 보상은 배제해야 한다.                 |
| COMP-004 | 퍼즐 양, 저자 선택, 난이도, 오프라인, 입력 보조가 정통 풀이 신뢰를 만든다.                   | 미국 문화 편향, 부정확하거나 생소한 단서, 광고 제거 가격, 원본 테마 메타데이터 누락이 지적된다.                              | 게임엔진을 쓰더라도 격자 읽기, 단서 전환, 메타데이터 보존은 이 기준선보다 나빠지면 안 된다.   |
| COMP-005 | 하루 하나의 권위 있는 퍼즐, 요일 난이도, 스트릭과 기록이 생활 의식을 만든다.                 | 2026-06 충돌과 저장 손실, 2026-07 게임별 무한 로딩이 보고됐고 공식 업데이트가 Crossword 충돌 수정을 명시했다.                | 스트릭을 도입하면 저장, 동기화, 복구, 고객지원까지 제품 계약에 포함해야 한다.                 |
| ADJ-001  | 메타를 22, 36, 65레벨에 순차 해금해 첫 세션 과부하를 줄이고 팀과 주간 경쟁으로 확장한다.     | 과다 광고, 광고 제거 신뢰, 반복 단어, 계정 복구, 다크 모드 부재가 최근 리뷰에 보인다.                                        | 단계적 해금은 채택하되 Wildlife와 같은 분리형 경제를 그대로 쌓지 않는다.                      |
| ADJ-002  | 여행 테마, 즉시 입력, 일일 챌린지, 수집과 다국어 규모가 접근성을 높인다.                     | 레벨마다 광고, 닫히지 않는 광고, 장기 난이도 정체, 단어 정의와 복습 부재, 생성형처럼 보이는 비주얼 불만이 보인다.            | 배경이 장식에 그치지 않고 정답 때문에 실제로 복구되거나 변화해야 엔진 전환의 가치가 생긴다.   |

## 리뷰와 플레이어 문제 종합

리뷰 표본은 스토어가 공개한 일부와 최신 커뮤니티 사례다. 아래 빈도는 리뷰 개수의 시장 통계가 아니라 7개 제품 가운데 같은 테마가 확인된 제품 수다.

| Theme ID | 근거                                                                                                                                    |              빈도/표본 |    심각도 | 현재 버전 확인                                                                                           | 기회/비기회                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------: | --------: | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| REV-001  | 광고가 퍼즐 사이, 첫 화면, 보상 수령을 끊고 종료 버튼을 여러 번 요구함. SRC-005, SRC-006, SRC-008, SRC-013, SRC-018, SRC-019            |      4/7 제품에서 반복 |      높음 | CodyCross, Wordscapes, Words of Wonders는 2026 리뷰 포함. Redstone은 공식 개발자 답변으로 광고 정책 확인 | 첫 세션 강제 광고 금지, 보상형 힌트만 명시적 선택, 광고 실패 시 진행과 보상 보존            |
| REV-002  | 오답, 오타, 생소한 단서, 누락 단어, 지역 문화 편향, 원본 테마 정보 손실. SRC-001, SRC-003, SRC-006, SRC-008, SRC-013, SRC-019, SRC-023  |      6/7 제품에서 신호 |      높음 | 일부 오래된 Mobirix 리뷰는 실제 기기 재검증 대상. 나머지는 최신 스토어 설명과 2025-2026 리뷰 포함        | 한국어 저자 검수, 출처와 정의, 이의 제보, 메타데이터 보존을 핵심 차별점으로 둠              |
| REV-003  | 스트릭 오류, 저장 손실, 계정 복구, 로딩 실패가 장기 플레이 가치를 훼손함. SRC-005, SRC-008, SRC-009, SRC-011, SRC-012, SRC-013, SRC-022 |      5/7 제품에서 신호 | 매우 높음 | NYT는 2026 공식 충돌 수정과 동시기 사용자 보고가 교차 확인됨                                             | 출시에는 local 자동 저장·중단 복귀·마이그레이션을 두고, 기기 이전은 cloud save 승인 뒤 제공 |
| REV-004  | 분리된 수집 경제와 무작위 보상이 퍼즐 실력보다 상점과 반복 노동을 강조함. SRC-005, SRC-013, SRC-014, SRC-017, SRC-018                   |      3/7 제품에서 신호 |      중간 | 시스템 존재는 최신 공식 문서로 확인, 플레이어 감정은 제한된 리뷰 표본                                    | 수집 보상은 정답, 지식, 에피소드 복원과 직접 연결하고 확률형 핵심 보상을 두지 않음          |
| REV-005  | 초반이 지나치게 쉽거나 후반 난이도가 희귀 단어와 반복에 의존함. SRC-001, SRC-006, SRC-008, SRC-013, SRC-019                             |      5/7 제품에서 신호 |      중간 | 2025-2026 리뷰 포함                                                                                      | 교차 제약, 테마 추론, 힌트 단계, 숙련도 기반 추천으로 난이도를 구성                         |
| REV-006  | 플레이어는 두뇌 운동, 학습, 휴식, 짧은 일일 성취를 핵심 가치로 표현함. SRC-001, SRC-003, SRC-005, SRC-007, SRC-009, SRC-013, SRC-018    | 7/7 제품에서 긍정 신호 | 제품 기회 | 스토어 포지셔닝과 다수 공개 리뷰에서 반복                                                                | 빠른 성취와 지식 발견을 유지하고 과도한 타이머와 패배 압박을 기본값으로 쓰지 않음           |
| REV-007  | 장년층과 장기 이용자는 광고 종료, 작은 글자, 기기 변경, 스트릭 손실에 특히 민감함. SRC-005, SRC-008, SRC-009, SRC-011, SRC-013          | 5/7 제품에서 정성 신호 |      높음 | 연령별 정량 표본은 확보하지 못함                                                                         | 큰 글자, 색상 외 피드백, 한 손 입력, 타이머 없는 모드, 복구 가능한 진행을 기본 계약으로 둠  |

## 기회와 위험

| Opportunity/Risk                        | Evidence                                                                                            | 우리 대응                                                                                                                      | 검증 비용 | 우선순위 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------- | -------- |
| OPP-001 한국어 단서형 어드벤처 공백     | COMP-001은 수족관 메타가 있으나 규모가 작고, 글로벌 대형 제품은 영어권 또는 글자 연결형에 치우친다. | 한글 교차 단서의 지식 발견을 유지하면서 정답으로 길, 장소, 인물이 복구되는 세계를 제안한다.                                    | 중간      | 최고     |
| OPP-002 정답의 즉시 세계 인과           | CodyCross와 여행형 제품은 세계를 보여주지만 퍼즐 결과와 배경 변화의 직접 인과는 약하다.             | 단어 하나를 완성할 때 0.3초 내 타일 반응, 2초 내 세계 오브젝트 변화, 다음 단서 목표를 연결한다.                                | 중간      | 최고     |
| OPP-003 신뢰 가능한 한국어 지식         | REV-002가 6개 제품에서 나타난다. 현재 저장소도 사전 기반 힌트와 출처 계약을 이미 보유한다.          | 정답, 자체 단서, 짧은 해설, 출처, 신고와 수정 이력을 콘텐츠 단위로 관리한다.                                                   | 높음      | 최고     |
| OPP-004 단계적 메타 해금                | Wordscapes는 코어, Daily Goals, Wildlife, 토너먼트를 레벨 단계로 분리한다.                          | 첫 5분에는 풀이와 세계 변화만 노출하고 수집, 일일 도전, 비동기 소셜을 후속 단계로 연다.                                        | 낮음      | 높음     |
| OPP-005 공정한 광고 경험                | REV-001은 대형 F2P 단어 게임의 반복 불만이다. 현재 앱은 보상형 힌트 계약을 이미 가진다.             | 첫 세션과 퍼즐 도중 강제 광고를 배제하고 결과 전면 광고는 별도 승인 전 범위에서 제외한다. 광고 제거 기간은 구매 전에 명시한다. | 낮음      | 높음     |
| OPP-006 짧은 일일 의식                  | NYT의 일일 퍼즐, 요일 난이도, 스트릭은 콘텐츠 수보다 강한 복귀 이유를 만든다.                       | 일일 에피소드, 주간 테마 길, 놓친 날 복구를 결합하되 스트릭 손실로 처벌하지 않는다.                                            | 중간      | 높음     |
| RISK-001 콘텐츠 생산 병목               | 모두의 가로세로 업데이트와 여러 경쟁작 리뷰가 오답과 단서 품질 문제를 반복한다.                     | 출시 재고와 주간 생산량을 분리하고 자동 검증 뒤 사람 편집과 기기 QA를 통과한 퍼즐만 배포한다.                                  | 높음      | 최고     |
| RISK-002 엔진 연출이 풀이를 방해        | 정통 제품은 격자와 입력 효율을 강점으로 삼고, 캐주얼 제품은 팝업과 메타 과부하 불만이 크다.         | 격자 가독성, 키보드, 단서 전환을 고정 우선순위로 두고 모션 축소와 연출 건너뛰기를 제공한다.                                    | 중간      | 최고     |
| RISK-003 저장과 스트릭 신뢰 붕괴        | REV-003과 최신 NYT 장애 사례가 장기 이용자의 손실 감정을 보여준다.                                  | 코어 진행은 로컬에서 즉시 저장하고 클라우드 동기화 도입 시 충돌, 마이그레이션, 복구 도구를 함께 출시한다.                      | 높음      | 최고     |
| RISK-004 3마켓 기능 분기                | 현재 저장소는 AIT, Android, iOS의 제품 정책 패리티를 요구한다.                                      | 규칙과 이벤트 계약은 packages/crossword-core에 두고 엔진과 마켓 SDK 차이는 adapter로 격리한다.                                 | 높음      | 높음     |
| RISK-005 분리형 수집 경제의 정체성 훼손 | CodyCross, Wordscapes, Words of Wonders에서 퍼즐 밖 보상과 광고가 핵심 경험을 덮는 리뷰가 보인다.   | 수집물은 단어 지식과 세계 에피소드에만 연결하고 별도 확률형 핵심 루프를 배제한다.                                              | 낮음      | 높음     |
| RISK-006 운영 콘텐츠와 코드 드리프트    | SRC-024의 공개 pack은 main의 수동 단서·난이도 계약과 일치하지 않는다.                               | Cloud Run image와 설정 hash를 갱신하고 live manifest 재검증을 release gate로 만든다.                                           | 중간      | 최고     |
| RISK-007 축소 격자의 접근성             | SRC-030, SRC-031의 touch target을 8×8·9×9 칸만으로 충족하기 어렵다.                                 | 48dp 단어 집중 입력, 단서 목록 탐색, 확대·스냅을 동등한 경로로 제공한다.                                                       | 중간      | 최고     |
| RISK-008 첫 플레이 전 부가 기능 마찰    | SRC-035의 Game Center profile 요구는 현재 첫 입력 활성화 문제와 충돌한다.                           | Game Center와 경쟁은 첫 12주 범위에서 제외하고 개인 진행을 먼저 검증한다.                                                      | 낮음      | 높음     |

## 검증할 가설

모든 수치는 외부 벤치마크가 아닌 소프트론칭 전 제품 가설이다. 표본과 성공 기준은 Discovery Gate에서 재검토한다.

| Hypothesis ID | 가설                                                                                     | 선행 근거                   | Prototype/Experiment                                                         | 성공                                                                       | 중단                                                                  | 기한                |
| ------------- | ---------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------- |
| HYP-001       | 플레이어는 5초 안에 단어를 풀어 길과 세계를 되살리는 판타지를 이해한다.                  | OPP-001, OPP-002            | 고충실도 메인 플레이 화면 2안과 기존 격자 화면 1안을 12명에게 무작위 노출    | 12명 중 9명 이상이 단어 풀이와 세계 복원을 함께 설명                       | 12명 중 6명 이하만 핵심 판타지를 설명하거나 장식형 학습 앱으로만 인식 | Discovery Gate      |
| HYP-002       | 정답 직후 세계 변화는 입력 속도를 해치지 않고 다음 단서 선택 의욕을 높인다.              | COMP-003, OPP-002, RISK-002 | 동일 퍼즐에 즉시 세계 반응 버전과 정적 버전을 적용한 교차 플레이테스트       | 세계 반응 버전 선호 70% 이상, 중앙 풀이시간 악화 5% 이내, 오입력 증가 없음 | 선호 50% 미만 또는 중앙 풀이시간 10% 이상 악화                        | Vertical Slice Gate |
| HYP-003       | 첫 세션 강제 광고를 없애도 보상형 힌트의 가치를 이해하고 자발적으로 선택한다.            | REV-001, OPP-005            | 첫 5분 무광고 FTUE 뒤 막힘 상황에서 무료 힌트와 선택형 보상 광고를 단계 노출 | FTUE 완료 75% 이상, 광고를 보지 않아도 진행 가능하다고 답한 비율 90% 이상  | FTUE 완료 60% 미만 또는 광고가 필수라고 오해한 비율 20% 초과          | Core Gate           |
| HYP-004       | 코어, 수집, 일일 도전의 순차 해금이 첫 세션 메뉴 과부하를 줄인다.                        | ADJ-001, OPP-004            | 모든 메뉴 노출 버전과 3단계 해금 버전의 첫 10분 과제 비교                    | 단계 해금 버전의 홈 오탭 30% 감소, 핵심 퍼즐 시작률 80% 이상               | 핵심 퍼즐 시작률 차이가 없고 복귀 의도도 개선되지 않음                | Vertical Slice Gate |
| HYP-005       | 짧은 해설과 출처는 정답 신뢰와 학습 가치를 높인다.                                       | REV-002, REV-006, OPP-003   | 퍼즐 종료 후 해설 카드 유무를 교차 비교하고 24시간 뒤 단어 회상 측정         | 해설 카드 확인 60% 이상, 신뢰도 평균 5점 척도 4.0 이상                     | 카드 확인 30% 미만 또는 다음 퍼즐 진입을 10초 이상 지연               | Core Gate           |
| HYP-006       | 처벌형 스트릭보다 복구 가능한 주간 길 지도가 복귀 의도를 유지한다.                       | COMP-005, REV-003, OPP-006  | 7일 캘린더 스트릭과 주간 길 복원 두 콘셉트의 선호 및 상실 감정 조사          | 주간 길 선호 60% 이상, 하루 누락 후 복귀 의도 70% 이상                     | 스트릭 대비 복귀 의도 개선이 없고 목표 이해도가 낮음                  | Discovery Gate      |
| HYP-007       | 초반 난이도 진단과 교차 기반 힌트가 희귀 단어 남발 없이 숙련자와 초보자를 함께 수용한다. | COMP-001, REV-005           | 3분 진단 퍼즐 뒤 난이도 추천, 힌트 단계별 노출, 완주율과 막힘 시간 측정      | 추천 난이도 수락 70% 이상, 초보와 숙련 코호트 모두 완주율 65% 이상         | 어느 코호트든 완주율 45% 미만 또는 힌트 의존 70% 초과                 | Core Gate           |

## 결정 반영

아래 항목 중 `제안`은 조사 근거에서 나온 안으로 사용자 승인 전에는 승인된 제품 결정이 아니다. `고정`은 이 저장소의 3마켓 패리티 또는 접근성 품질 계약이라 이번 기획에서 선택적으로 해제하지 않는다.

| Decision ID | 상태           | GDD 반영 위치                                                                                            | 근거                                     | 버린 대안                                                                    | 재검토 Gate                                             |
| ----------- | -------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| DEC-001     | 사용자 승인 전 | 02-gdd.md의 코어 루프와 규칙                                                                             | OPP-001, OPP-002, HYP-001                | 기존 앱의 격자와 결과 화면만 시각적으로 교체하는 안                          | Discovery Gate에서 핵심 판타지 이해 확인                |
| DEC-006     | 사용자 승인 전 | 02-gdd.md의 수익화, 05-economy-content-liveops.md의 광고 카탈로그                                        | REV-001, OPP-005, HYP-003                | 첫 퍼즐 전후에 빈도 제한 없는 전면 광고를 두는 안                            | 광고 퍼널 실험과 첫 세션 완주율 확인                    |
| DEC-011     | 사용자 승인 전 | 02-gdd.md의 진행과 온보딩, 03-ui-ux-spec.md의 내비게이션                                                 | ADJ-001, OPP-004, HYP-004                | 첫 실행부터 수집, 상점, 이벤트, 랭킹을 모두 노출하는 안                      | 첫 10분 과제 테스트                                     |
| DEC-007     | 사용자 승인 전 | 02-gdd.md의 콘텐츠, 05-economy-content-liveops.md의 콘텐츠 생산                                          | REV-002, OPP-003, RISK-001, HYP-005      | 사전 뜻풀이를 편집 없이 그대로 노출하거나 생성 결과를 무검수 배포하는 안     | 콘텐츠 샘플 100문항 이중 검수                           |
| DEC-008     | 사용자 승인 전 | 02-gdd.md의 저장과 리셋 계약, 06-technical-production-plan.md의 저장 마이그레이션                        | REV-003, RISK-003                        | 저장 변환·rollback 없이 새 runtime으로 즉시 교체하는 안                      | process kill, leapfrog upgrade, runtime rollback 테스트 |
| DEC-003     | 고정           | 06-technical-production-plan.md의 아키텍처와 플랫폼 연동                                                 | 현재 repo 3마켓 패리티 계약, RISK-004    | AIT, Android, iOS에서 서로 다른 퍼즐 정책과 보상 규칙을 운영하는 안          | Core Gate에서 공통 도메인 테스트와 3마켓 빌드 경계 검증 |
| DEC-012     | 고정           | 03-ui-ux-spec.md의 접근성, 07-qa-launch-plan.md의 UX QA                                                  | REV-006, REV-007, SRC-030, SRC-031       | 작은 글자와 시간 경쟁을 기본값으로 고정하는 안                               | 대표 기기와 장년층 포함 사용성 테스트                   |
| DEC-015     | 사용자 승인    | 00-product-brief.md의 범위, 06-technical-production-plan.md의 locale 구조, 07-qa-launch-plan.md의 현지화 | COMP-002, ADJ-002, 현재 한국어 제품 계약 | 현재 코어를 한국어 전용으로 고정하거나 영문 콘텐츠를 직역해 동시 출시하는 안 | 한국어 출시 gate와 future locale fixture를 분리 검증    |
