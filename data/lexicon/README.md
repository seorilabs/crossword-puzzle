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
