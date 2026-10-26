# 언어별 하루 다섯 판 공급

한국어 기존 `/puzzles/manifest.json`은 구버전 클라이언트가 사용한다. 새 클라이언트는 `/puzzles/ko/manifest.json`과 `/puzzles/en/manifest.json`을 읽는다. 언어 없는 저장과 퍼즐은 한국어로 해석한다. 영어 공급 오류에 한국어를 대신 표시하지 않는다.

## 로컬 생성

저장소 루트에서 Node 24로 실행한다. 다음 명령은 파일만 만들며 공개하지 않는다.

```sh
npm run batch:languages -- --language=ko --start=2026-10-26 --days=30 --outDir=/tmp/crossword-language-check
npm run batch:languages -- --language=en --start=2026-10-26 --days=30 --outDir=/tmp/crossword-language-check
python3 qa/validate_language_supply.py --help
```

두 언어 각각 하루 5판, 한국어18~22단어, 영어12~18단어다. 교차 칸55%, 두 번 이상 교차하는 단어65%, 연결성, 같은 날 및14일 정답 중복 금지를 낮추지 않는다. 기존 발행 슬롯은 정답, 단서와 manifest bytes를 재생성으로 바꾸지 않는다. 과거 빈 슬롯을 채울 때는 이미 생성된 미래14일까지도 대조해 뒤 날짜의 반복 규칙을 지킨다. 단어가 부족하거나 탐색이 실패하면 작업이 실패한다.

`generate-language-packs.mjs`는 검증된8×8 모양에서 교차 제약을 전파하고 가능한 후보가 적은 단어부터 채운다. 한국어의 동일 음절 및 두 글자 조각 제한은 유지하고 영어에는 적용하지 않는다. `scripts/build-daily-board-templates.py OUTPUT.json`으로3,102개 모양을 재현할 수 있다.

## 예약 작업과 발행 경계

`npm run job:language-packs`는 기존 manifest와 퍼즐을 내려받아 복원한 뒤 생성한다. 기존 공급을 읽지 못하면 실패한다. 최초 경로만 명시적 bootstrap을 허용한다. 한국어 bootstrap에는 기존 정답 이력이 필요하다. 이력은 새 manifest가 가리키는 `prior-answer-history.json`으로 유지한다.

한국어는 KST 오늘부터 내일까지 준비한다. 영어는 UTC 전날부터3일 뒤까지 준비해 UTC-12부터UTC+14까지의 현지 오늘과 미래2일을 포함한다. 공개 시각은 파일의 발행 정보이며 실제 선택은 사용자 날짜와 일일 순번으로 한다. 클라이언트는 미래 판을 숨기고 같은 언어, 날짜와 순번에 동일 ID를 사용한다. 시간대 이동으로 과거 날짜에 돌아와도 완료 저장의 ID가 같아 중복 지급하지 않는다.

이 명령에는 배포가 없다. 운영에 적용하려면 기존 Cloud Run, Hosting 발행 작업의 별도 승인 아래 언어별 manifest와 해당 JSON 전체를 포함해 발행해야 한다. 기존 한국어 공급도 함께 보존해야 한다. 이번 작업은 예약, Hosting, Remote Config를 운영에 반영하지 않았다.

## 어휘와 라이선스

[콘텐츠 검수 기록](../data/lexicon/daily-content-review.md)에 후보 수, 원문 해시, 검수와 출처를 기록한다. 영어 후보 생성에는 WordNet3.0 및 wordfreq3.1.1이 필요하다. 원문 후보와 두 독립 검수 기록을 `apply-language-clue-review.py --bank RAW --english REPORT1 REPORT2 --output OUTPUT.json`에 전달하면 승인된3,238개만 출력한다. 전체 라이선스와 수정 이력을 보존하며 앱의 정보 화면에서도 전문을 제공한다.
