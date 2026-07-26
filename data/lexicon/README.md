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
정답을 부분 문자열로 포함하지 않아야 한다(자기참조 금지). 한국어기초사전
뜻풀이는 워드뱅크 생성 단계의 구조 필터와 앱 내 출처·라이선스 고지를 전제로
기본 사용하며, `needsManualClue`는 발행 차단이 아닌 후속 자체 문장 편집 상태다.

적용:

```sh
npm run clues:apply
```

커버리지 리포트(파일 변경 없음): 발행 퍼즐 디렉터리의 퍼즐을 난이도·주제별로 묶어
미검수(needsManualClue) 비율을 집계한다. 기본 허용 상한은 100%이므로 이 리포트는
티어(easy/hard)·주제(food/animal/nature/body)별 자체 문장 편집 우선순위를
확인할 때 쓴다. 더 낮은 상한을 명시하는 별도 검수 정책에서는 실패 게이트로도
재사용할 수 있다.

```sh
npm run clues:apply -- --report                 # public/puzzles 대상
npm run clues:apply -- --report --puzzlesDir=... # 임의 생성 팩 디렉터리 대상
```
