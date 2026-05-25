# 가로세로낱말퍼즐

Apps in Toss 프로젝트입니다.

## 기획 문서

Obsidian Vault 기준 source of truth:

```text
프로젝트/가로세로낱말퍼즐
```

- 기획서: `프로젝트/가로세로낱말퍼즐/01 기획서.md`
- 알고리즘 설계: `프로젝트/가로세로낱말퍼즐/02 알고리즘 설계.md`

## 시작하기

```bash
npm run dev
```

## 명령어

모든 명령은 repo 루트에서 실행합니다.

| 명령 | 용도 |
| --- | --- |
| `npm run dev` | 로컬 개발 서버 실행 |
| `npm run lint` | ESLint 검사 |
| `npm run build` | AppsInToss `.ait` 빌드 |
| `npm run deploy` | AppsInToss 배포 |
| `npm run wordbank:krdict` | 한국어기초사전 XML에서 퍼즐용 단어장 생성 |
| `npm run prototype:crossword` | 콘솔에서 퍼즐판 생성 알고리즘 샘플 출력 |
| `npm run batch:puzzles` | 날짜별 puzzle JSON pack 생성 |

## 퍼즐판 생성

퍼즐판 생성은 `단어장 생성 -> 단일 후보 확인 -> 날짜별 pack 생성 -> 앱에서 확인` 순서로 진행합니다.

### 1. 단어장 생성

한국어기초사전 XML을 내려받아 퍼즐용 단어장 JSON을 만듭니다.

```bash
npm run wordbank:krdict
```

기본 출력:

```text
data/lexicon/krdict-puzzle-wordbank.json
```

주요 옵션:

| 옵션 | 기본값 | 설명 |
| --- | ---: | --- |
| `--out=...` | `data/lexicon/krdict-puzzle-wordbank.json` | 출력 파일 |
| `--limit=25000` | `25000` | 최대 단어 수 |
| `--minLength=2` | `2` | 최소 글자 수 |
| `--maxLength=5` | `5` | 최대 글자 수 |
| `--maxClueLength=54` | `54` | 힌트로 쓸 뜻풀이 최대 길이 |

예시:

```bash
npm run wordbank:krdict -- --limit=5000 --maxLength=6 --out=tmp/wordbank.json
```

주의: 현재 단어장은 한국어기초사전 뜻풀이를 힌트로 사용합니다. 출시 전에는 `CC-BY-SA-2.0-KR` 출처 표시와 동일조건변경허락 의무를 검토하거나, 힌트를 자체 문장으로 재작성해야 합니다.

### 2. 단일 퍼즐판 후보 확인

콘솔에서 알고리즘이 만든 판과 지표를 바로 확인합니다.

```bash
npm run prototype:crossword -- \
  --wordbank=data/lexicon/krdict-puzzle-wordbank.json \
  --samples=1 \
  --attempts=8 \
  --size=8 \
  --words=12 \
  --beam=10 \
  --branch=10 \
  --dense=96 \
  --candidates=600 \
  --seed=20260525
```

주요 옵션:

| 옵션 | 설명 |
| --- | --- |
| `--wordbank=...` | 사용할 단어장 JSON |
| `--samples=1` | 출력할 최종 후보 수 |
| `--attempts=8` | 생성 시도 횟수 |
| `--size=8` | 퍼즐판 한 변 크기 |
| `--words=12` | 직접 배치할 최대 단어 수 |
| `--beam=10` | 유지할 중간 후보 판 수 |
| `--branch=10` | 후보 판 하나에서 확장할 배치 수 |
| `--dense=96` | 조밀 배치 후보 탐색 수 |
| `--candidates=600` | seed별 탐색 후보 단어 수 |
| `--seed=20260525` | 재현 가능한 난수 seed |

출력에서 먼저 볼 지표:

| 지표 | 의미 |
| --- | --- |
| `entries` | 최종 가로/세로 단어 수 |
| `auto` | 인접 배치로 자동 생성된 유효 단어 수 |
| `crossRatio` | 채워진 칸 중 교차 칸 비율 |
| `bboxDensity` | 글자가 들어간 최소 직사각형의 밀도 |
| `multiCrossEntries` | 2개 이상 교차하는 단어 수 |

### 3. 날짜별 puzzle pack 생성

앱이 읽는 `public/puzzles` JSON을 생성합니다.

```bash
npm run batch:puzzles -- \
  --days=3 \
  --start=2026-05-25 \
  --seed=20260525 \
  --size=8 \
  --words=12 \
  --attempts=12 \
  --beam=12 \
  --branch=12 \
  --dense=96 \
  --candidates=600 \
  --retries=10
```

생성되는 파일:

```text
public/puzzles/manifest.json
public/puzzles/YYYY-MM-DD-normal-NN.json
```

배치 옵션:

| 옵션 | 기본값 | 설명 |
| --- | ---: | --- |
| `--days=7` | `7` | 생성할 날짜 수 |
| `--start=2026-05-25` | `2026-05-25` | 시작 날짜 |
| `--seed=20260525` | `20260525` | 시작 seed |
| `--size=8` | `8` | 퍼즐판 한 변 크기 |
| `--words=12` | `12` | 직접 배치할 최대 단어 수 |
| `--attempts=30` | `30` | 날짜별 생성 시도 수 |
| `--retries=8` | `8` | 실패 시 seed를 바꿔 재시도하는 횟수 |
| `--wordbank=...` | `data/lexicon/krdict-puzzle-wordbank.json` | 사용할 단어장 |
| `--outDir=...` | `public/puzzles` | 출력 폴더 |

생성 후 `npm run dev`를 켜고 앱에서 `manifest.json`과 오늘 날짜 puzzle JSON을 확인합니다.

## 배포하기

- 앱인토스 배포 API 키는 [앱인토스 콘솔](https://apps-in-toss.toss.im/) > 워크스페이스 > API 키 > 콘솔 API 키 에서 발급받을 수 있어요.

```bash
npm run build
npm run deploy
```

## 유용한 링크

- [앱인토스 콘솔](https://apps-in-toss.toss.im/)
- [앱인토스 개발자센터](https://developers-apps-in-toss.toss.im/)
- [앱인토스 개발자 커뮤니티](https://techchat-apps-in-toss.toss.im/)

AI를 사용하시는 경우 [여기](https://developers-apps-in-toss.toss.im/development/llms.html)를 확인해보세요.
