// 주제(테마) 태깅 후처리 스크립트(#236).
//
// data/lexicon/puzzle-word-filter.json 의 themeCategories(카테고리별 키워드 규칙)를
// 읽어, 커밋된 단어장(krdict-puzzle-wordbank.json)의 각 단어에 themeTags 를 결정적으로
// 부여한다. 매칭 규칙은 공유 코어(assignThemeTags)에 위임해 생성기/앱과 동일 결과를
// 보장하고, 규칙 자체는 필터 파일에 커밋되므로 재현 가능하다(수동 일회성 편집 아님).
//
// 전체 재빌드(build-krdict-wordbank)도 동일한 themeCategories 규칙을 적용하므로,
// 이 스크립트는 네트워크 없이 커밋된 단어장에만 규칙을 재적용하는 오프라인 경로다.
// idempotent 하며 재실행 시 결과가 동일하다.
//
// 사용법: node scripts/build-theme-tags.mjs [--wordbank=path] [--filter=path] [--dry]

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { assignThemeTags } from "../packages/crossword-core/src/themeTags.ts";

const DEFAULTS = {
  wordbank: "data/lexicon/krdict-puzzle-wordbank.json",
  filter: "data/lexicon/puzzle-word-filter.json",
  dry: false,
};

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (key === "wordbank" && value) options.wordbank = value;
    if (key === "filter" && value) options.filter = value;
    if (key === "dry") options.dry = true;
  }
  return options;
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const wordbankPath = path.resolve(options.wordbank);
  const filterPath = path.resolve(options.filter);

  const filter = JSON.parse(await readFile(filterPath, "utf8"));
  const categories = filter.themeCategories ?? [];
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error(
      `No themeCategories defined in ${options.filter}; nothing to tag.`,
    );
  }

  const wordbank = JSON.parse(await readFile(wordbankPath, "utf8"));
  const words = wordbank.words;
  if (!Array.isArray(words)) {
    throw new Error(`Invalid wordbank format: ${options.wordbank}`);
  }

  const perCategory = new Map(categories.map((category) => [category.id, 0]));
  let taggedWords = 0;
  let changed = 0;

  for (const word of words) {
    const tags = assignThemeTags(word, categories);
    const previous = Array.isArray(word.themeTags) ? word.themeTags : [];
    if (!arraysEqual(previous, tags)) {
      changed += 1;
    }
    word.themeTags = tags;
    if (tags.length > 0) {
      taggedWords += 1;
      for (const tag of tags) {
        perCategory.set(tag, (perCategory.get(tag) ?? 0) + 1);
      }
    }
  }

  // 커버리지 리포트.
  console.log(`themeCategories: ${categories.length}`);
  for (const category of categories) {
    console.log(
      `  - ${category.id} (${category.label}): ${perCategory.get(category.id) ?? 0} words`,
    );
  }
  console.log(`tagged words (>=1 tag): ${taggedWords} / ${words.length}`);
  console.log(`words with changed themeTags: ${changed}`);

  if (options.dry) {
    console.log("dry run: no files written.");
    return;
  }

  await writeFile(wordbankPath, `${JSON.stringify(wordbank, null, 2)}\n`);
  console.log(`wrote ${options.wordbank}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
