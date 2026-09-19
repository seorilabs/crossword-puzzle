# AppsInToss 게임 등록 메타데이터 (crossword-puzzle-game)

기존 비게임 `crossword-puzzle`(36555)을 게임 카테고리로 재등록하기 위한 콘솔 입력값 모음이다.
등급분류 완료 후 이 값 + `release-assets/apps-in-toss/`의 이미지로 MCP 등록을 진행한다.

## 식별자

| 항목 | 값 |
| ---- | -- |
| workspaceId | `38345` |
| miniAppId (신규 게임) | `56407` |
| appName | `crossword-puzzle-game` |
| 기존 비게임(대체 대상) | `crossword-puzzle` / miniAppId `36555` (게임 출시·안정화 후 종료 권장) |

## 기본 정보

| 콘솔 항목 | 입력값 | 비고 |
| --------- | ------ | ---- |
| 한국어 앱 이름 (10자 이내) | `가로세로 낱말` | 6자. 기존 "가로세로 낱말 퍼즐"과 불일치 → 중복 이름 충돌 회피 |
| 영어 앱 이름 (15자 이내) | `Word Cross` | 10자 |
| 부제 (20자 이내) | `매일 한 판으로 어휘력·집중력 UP` | 사용자 가치 강조 |
| 카테고리 | 게임(id `5`) > 퍼즐(id `3844`) | `subCategoryIds: []` (게임 그룹은 서브카테고리 없음) |
| 사용 연령/등급 | 등급분류 결과에 따름 | 전체이용가 예상 시 `minAge 14 / maxAge 99`(형제 게임 기준) |
| 대표 색상 | `#00A88F` | `apps-in-toss.config.ts brand.primaryColor` |
| CS 이메일 | (자동) | MCP는 요청 멤버 콘솔 계정 이메일로 자동 설정 |

### 한 줄 설명(부제) 대안
- `하루 5분 교차 낱말로 어휘력 키우기`
- `매일 새 퍼즐, 어휘력이 자라요`

### 앱 이름 대안(모두 충돌 회피·10자 이내)
- `매일 낱말 퍼즐`(7) · `가로세로 한글퍼즐`(8) · `낱말 크로스`(5)

## 상세설명

```text
가로세로 낱말은 여러 한글 낱말이 글자를 공유하며 교차하는, 날짜별 가로세로 퍼즐을 매일 한 판씩 즐기는 게임입니다.

홈 화면 상단의 날짜 카드를 넘겨 오늘 또는 지난 날짜의 퍼즐을 고르고, 선택한 미션의 남은 도전 횟수와 진행률, 대표 단서를 확인합니다. '미션 시작'을 누르면 퍼즐판이 열리고, 날짜마다 최대 3번까지 도전할 수 있습니다. 이미 시작한 미션은 남은 도전 횟수를 더 쓰지 않고 이어서 풀 수 있습니다.

퍼즐판의 칸이나 단서 목록을 누르면 해당 가로·세로 낱말이 선택됩니다. 단서를 읽고 정답을 입력하다 막히면 기본 힌트로 다음 글자를 확인할 수 있고, 기본 힌트를 모두 쓰면 보상형 광고를 본 뒤 추가 힌트를 받습니다. 풀이를 마치면 결과 화면에서 완료한 낱말 수, 사용한 힌트, 남은 도전 횟수를 한눈에 확인합니다.

교차하는 낱말을 하나씩 채우며 어휘력과 집중력을 키우고, 매일 새로운 한 판으로 가벼운 두뇌 운동 습관을 만들 수 있습니다.

날짜별 미션 상태, 퍼즐 진행 상태, 힌트 사용/보상 횟수는 기기에 저장됩니다. 로그인, 결제, 서버 저장, 민감정보 수집은 없습니다. 일부 힌트 뜻풀이는 국립국어원 한국어기초사전(CC-BY-SA-2.0-KR)을 바탕으로 구성했으며, 출처와 라이선스는 앱 내에서 상시 확인할 수 있습니다.
```

## 검색 키워드 (우선순위 순)

```json
["가로세로","낱말퍼즐","십자말풀이","크로스워드","낱말게임","단어게임","두뇌게임","한글퍼즐","어휘력","매일퍼즐"]
```

추가 후보(교체/여유 시): `낱말`, `십자말`, `단어퍼즐`, `낱말퀴즈`, `퍼즐게임`, `캐주얼게임`, `한글`, `퀴즈` · 영어(후순위) `crossword`, `word puzzle`

## 이미지

`release-assets/apps-in-toss/README.md` 참고. 콘솔 매핑 요약:

| 이미지 | 규격 | 콘솔/ MCP |
| ------ | ---- | --------- |
| `crossword-puzzle-game-icon-600.png` | 600×600 | `iconUri` |
| `crossword-puzzle-game-thumbnail-1932x828.png` | 1932×828 | `THUMBNAIL·HORIZONTAL` + `gameInfo.horizontalThumbnailUri` / bg `#FB6547` LIGHT |
| `screenshots/…-start·play·result-636x1048.png` | 636×1048 ×3 | `PREVIEW·VERTICAL` / bg `#FFFFFF` LIGHT |

## 게임 등급 (blocker)

- 게임 등록은 `gameInfo.gameRating` 필수. MCP는 **증명서 방식만** 제출 가능, 스토어 링크 방식은 콘솔 웹 전용.
- crossword-puzzle은 애플/구글 미출시라 스토어 링크 없음 → **콘솔 웹에서 자체등급분류(전체이용가 예상)를 먼저 등록**해 `gameInfo` 확보 후, 나머지는 MCP로 등록.

## MCP 등록 페이로드 스켈레톤 (등급 확보 후)

```jsonc
{
  "workspaceId": 38345,
  "request": {
    "miniApp": {
      "miniAppId": 56407,
      "appName": "crossword-puzzle-game",
      "title": "가로세로 낱말",
      "titleEn": "Word Cross",
      "description": "매일 한 판으로 어휘력·집중력 UP",
      "detailDescription": "<위 상세설명>",
      "iconUri": "<업로드 후 static.toss.im URL>",
      "minAge": 14, "maxAge": 99,
      "status": "PREPARE",
      "gameInfo": { /* 콘솔 웹 등급분류로 채워진 값 */ },
      "images": [
        { "imageType": "THUMBNAIL", "orientation": "HORIZONTAL", "backgroundColor": "#FB6547", "backgroundTheme": "LIGHT", "imageUrl": "<썸네일 URL>" },
        { "imageType": "PREVIEW", "orientation": "VERTICAL", "backgroundColor": "#FFFFFF", "backgroundTheme": "LIGHT", "imageUrl": "<start URL>" },
        { "imageType": "PREVIEW", "orientation": "VERTICAL", "backgroundColor": "#FFFFFF", "backgroundTheme": "LIGHT", "imageUrl": "<play URL>" },
        { "imageType": "PREVIEW", "orientation": "VERTICAL", "backgroundColor": "#FFFFFF", "backgroundTheme": "LIGHT", "imageUrl": "<result URL>" }
      ]
    },
    "impression": {
      "categoryIds": [5, 3844],
      "subCategoryIds": [],
      "keywordList": ["가로세로","낱말퍼즐","십자말풀이","크로스워드","낱말게임","단어게임","두뇌게임","한글퍼즐","어휘력","매일퍼즐"]
    }
  }
}
```

> 카테고리 id(5=게임, 3844=퍼즐)는 형제 게임 등록값 기준. 등록 직전 콘솔에서 재확인한다.
