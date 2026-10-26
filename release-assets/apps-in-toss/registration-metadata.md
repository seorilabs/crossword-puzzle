# AppsInToss 게임 등록 메타데이터

2026-10-26 공개 상태를 확인한 기존 게임의 v1.3.0 교체 원본입니다. 새 앱 등록과 기존 비게임 종료는 이번 작업에 포함하지 않습니다.

| 항목 | 값 |
| --- | --- |
| 워크스페이스 | 38345 |
| 게임 miniAppId | 56407 |
| appName | crossword-puzzle-game |
| 한국어 이름 | 가로세로 낱말 |
| 영어 이름 | Word Cross |
| 한 줄 설명 | 한국어와 쉬운 영어로 하루 다섯 판씩 |

## 상세 설명

단서를 읽고 글자 타일을 놓아 가로세로 낱말을 완성해요.

한국어와 쉬운 미국식 영어 퍼즐을 언어별로 하루 다섯 판씩 제공해요. 한국어는 한국 시간 자정에, 영어는 기기의 현지 날짜에 맞춰 새 퍼즐이 열려요.

홈에서 오늘의 진행을 확인하고, 미완료 퍼즐을 이어 풀 수 있어요. 한 판을 끝내면 결과를 확인하고 다음 판으로 넘어가요. 다섯 판을 모두 풀면 오늘의 완료 기록이 남아요.

설정에서 한국어와 영어를 바꿀 수 있어요. 풀이 진행과 완료 기록은 언어별로 기기에 저장돼요.

앱에는 광고가 포함돼요. 광고가 준비된 경우 완료 결과에서 다음 판이나 홈으로 이동할 때 전면광고가 표시될 수 있어요.

## 이미지

아이콘은 기존 600×600 원본을 유지합니다. 썸네일과 세로 화면 3장은 실제 v1.3.0 개발 실행 화면으로 교체합니다. 외부 공급자 SDK와 기기 실행을 촬영한 자산으로 해석하지 않습니다.

- 썸네일: `crossword-puzzle-game-thumbnail-1932x828.png`
- 세로 화면: `screenshots/`의 start, play, result 636×1048 원본
- 촬영과 해시: `docs/releases/v1.3.0/store-assets.md`

## 반영 상태

작성 시점에는 운영 메타데이터를 아직 저장하지 않았습니다. 현재 게임은 v1.2.0 공개 상태이며, v1.3.0 업로드와 심사, 승인을 각 단계에서 별도로 확인합니다. 기존 등급, 연락처, 이름, 카테고리와 계정은 변경하지 않습니다.


## 기존 등록에서 보존할 값

2026-10-26 공급자 GET에서 확인했다. 새 앱을 만들지 않고 현재 게임의 문구와 이미지 필드만 갱신한다.

| 항목 | 현재 값과 처리 |
| --- | --- |
| 카테고리 | 게임 5, 퍼즐 3844, subCategory 없음 |
| 사용 연령 | minAge 14, maxAge 99 유지 |
| 게임 등급 | 현재 `gameInfo.gameRating` 원본을 그대로 보존. 새 등급 blocker로 바꾸거나 재신청하지 않음 |
| 기존 등급 근거 링크 | https://apps.apple.com/kr/app/가로세로-퍼즐/id6777292094 유지 |
| 순위 표시 | scoreUnit `점`, scoreUnitEnglish `points`, sortOrder `DESC` 유지 |
| 아이콘과 연락처 | 현재 운영값 유지 |

검색 키워드는 현재 공급자 값을 유지한다.

```json
["가로세로", "낱말퍼즐", "십자말풀이", "크로스워드", "낱말게임", "단어게임", "두뇌게임", "한글퍼즐", "어휘력", "매일퍼즐"]
```

새 이미지의 입력 매핑은 다음과 같다. 업로드 후 반환된 URL만 imageUrl과 horizontalThumbnailUri에 넣는다.

| 로컬 파일 | imageType | orientation | displayOrder | backgroundColor | backgroundTheme |
| --- | --- | --- | ---: | --- | --- |
| `crossword-puzzle-game-thumbnail-1932x828.png` | THUMBNAIL | HORIZONTAL | 0 | #F5F5F5 | LIGHT |
| `screenshots/crossword-puzzle-game-start-636x1048.png` | PREVIEW | VERTICAL | 1 | #F5F5F5 | LIGHT |
| `screenshots/crossword-puzzle-game-play-636x1048.png` | PREVIEW | VERTICAL | 2 | #F5F5F5 | LIGHT |
| `screenshots/crossword-puzzle-game-result-636x1048.png` | PREVIEW | VERTICAL | 3 | #F5F5F5 | LIGHT |

배경색은 새 PNG 좌측 상단의 실제 RGB 값이다. 실제 renderer 캡처이므로 새 네 장의 isAiGenerated는 false다. 현재 등급 값은 증적의 개인정보 가림 문자열을 복사하지 않고 저장 직전 공급자 GET 원본에서 보존한다. 현재 공급자 원본은 NAS의 public-market-readback-20261026T1156Z, 새 이미지 출처는 store-assets.md에 기록했다.
