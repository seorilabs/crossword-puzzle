# Crossword Lexicon

`krdict-puzzle-wordbank.json` is generated from the Korean Learners' Dictionary XML
provided by the National Institute of Korean Language and mirrored by
`spellcheck-ko/korean-dict-nikl-krdict`.

The generated wordbank includes only Hangul noun answers and short definitions suitable
for puzzle clues. Pronunciation audio and external multimedia links are intentionally
excluded.

License metadata is embedded in the JSON output. Because the source is distributed under
CC BY-SA 2.0 KR, review attribution and share-alike obligations before using dictionary
definitions in a production release.

Regenerate:

```sh
npm run wordbank:krdict
```

## 검수 단서(manual-clues)와 커버리지 리포트

`manual-clues.json` 은 검수 완료(큐레이션) 단서 모음(`answer -> 단서`)이다. 단서는
정답을 부분 문자열로 포함하지 않아야 하며(자기참조 금지), 발행 게이트
(`needsManualClue` 비율 ≤ 40%)를 충족하도록 워드뱅크·발행 퍼즐에 적용한다.

적용:

```sh
npm run clues:apply
```

커버리지 리포트(파일 변경 없음): 발행 퍼즐 디렉터리의 퍼즐을 난이도·주제별로 묶어
미검수(needsManualClue) 비율을 집계하고, 게이트를 넘는 그룹이 있으면 종료 코드 1로
실패한다. 티어(easy/hard)·주제(food/animal/nature/body) 팩의 발행 게이트 통과 여부를
빠르게 확인할 때 쓴다.

```sh
npm run clues:apply -- --report                 # public/puzzles 대상
npm run clues:apply -- --report --puzzlesDir=... # 임의 생성 팩 디렉터리 대상
```
