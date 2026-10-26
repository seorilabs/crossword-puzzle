# 한국어와 영어 일일 퍼즐 자료

사용자 승인 계획: [한국어와 영어 하루 다섯 판](../../docs/design/2026-10-26-bilingual-five-daily/design.md). 운영 배포와 마켓 제출은 별도이며 이 자료 추가로 공개 상태를 바꾸지 않는다.

- 영어 원문 후보 3,500개를 읽고 검수했다. 유지 및 편집한 3,238개를 `en-wordbank.json`에 보관하며 제외한 262개는 발행 후보에서 제거했다. 현재 의미 ID는 편집한 단서의 뜻과 연결된다. WordNet에 해당 의미가 없는 직접 작성 단서는 `original` 출처로 분리하고 현재 WordNet 의미 ID를 두지 않는다.
- 한국어 기존 원본 `krdict-puzzle-wordbank.json`은 유지한다. 추가 후보 2,939개를 읽고 원문 그대로 승인한 2,585개를 `ko-daily-clues.json`에 연결했다. 기존 503개와 합쳐 3,088개이며 편집 제안 334개는 적용하지 않았다. 거절 20개는 새 생성에서 제외한다.
- 영어 후보 선별은 wordfreq 3.1.1의 빈도와 WordNet 3.0의 단어 및 뜻풀이를 사용했다. 빈도만으로 단서를 통과시키지 않았다. 대문자 정규화, 미국식 의미 선택, 짧은 단서 편집을 적용했다. 원본과 편집 문구, 의미 ID, 판정 및 시점은 검수 원본에 보존한다.
- WordNet 이용 조건은 `WORDNET-LICENSE.txt`, wordfreq의 저작권과 하위 자료 고지는 `WORDFREQ-NOTICE.md`, 코드 라이선스는 `WORDFREQ-LICENSE.txt`에 있다. 빈도 자료와 후보 선별 결과에는 `CC-BY-SA-4.0.txt`를 적용한다. 한국어 자료는 기존 CC BY-SA 2.0 KR 조건을 유지한다. 이 데이터 조건이 앱 코드의 라이선스를 바꾸지는 않는다.
- `data/puzzles/daily-board-templates.json`은 자체 생성한 8×8 구조다. 정답이나 외부 퍼즐을 복제하지 않으며 연결성, 언어별 단어 수, 교차 칸 55%와 두 번 이상 교차하는 단어 65% 조건으로 선택했다. 구조에 들어갈 정답은 생성 시점의 최근 14일 이력을 배제한 뒤 채운다.

검수 원본과 입력 사본, 실패 원본 및 직접 읽은 결과는 NAS1dual의 아래 경로에 있고 `manifest.json`의 크기와 SHA-256으로 복사 검증했다.

`/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-26-bilingual-five-daily-847d6d6/content-review/`
