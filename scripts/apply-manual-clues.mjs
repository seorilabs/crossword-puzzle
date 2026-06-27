import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  applyManualClues,
  isSelfReferentialClue,
} from "../packages/crossword-core/src/clueCuration.ts";

// 검수 단서(manual-clues.json)를 워드뱅크와 발행 퍼즐 엔트리에 적용한다.
// 워드뱅크 word.clue / 퍼즐 entry.clue 를 검수 단서로 바꾸고
// clueSource="manual", needsManualClue=false 로 표기한다(생성기는 이를 그대로 전달).

const DEFAULT_OPTIONS = {
  cluesPath: "data/lexicon/manual-clues.json",
  wordBankPath: "data/lexicon/krdict-puzzle-wordbank.json",
  puzzlesDir: "public/puzzles",
};

const SKIP_PUZZLE_FILES = new Set(["manifest.json", "generation-report.json"]);

function parseArgs(argv) {
  const options = { ...DEFAULT_OPTIONS };

  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (key === "clues" && value) options.cluesPath = value;
    if (key === "wordbank" && value) options.wordBankPath = value;
    if (key === "puzzlesDir" && value) options.puzzlesDir = value;
  }

  return options;
}

function loadClueMap(raw) {
  // "_" 로 시작하는 메타 키(_comment 등)는 제외한다.
  const clues = {};
  for (const [answer, clue] of Object.entries(raw)) {
    if (answer.startsWith("_")) {
      continue;
    }
    if (typeof clue !== "string" || clue.trim().length === 0) {
      throw new Error(`Empty clue for answer "${answer}"`);
    }
    clues[answer] = clue;
  }
  return clues;
}

function assertNoSelfReference(clues) {
  const offenders = Object.entries(clues).filter(([answer, clue]) =>
    isSelfReferentialClue(answer, clue),
  );

  if (offenders.length > 0) {
    const detail = offenders
      .map(([answer, clue]) => `  ${answer} ⊆ "${clue}"`)
      .join("\n");
    throw new Error(`Self-referential curated clue(s):\n${detail}`);
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function applyToWordBank(wordBankPath, clues) {
  const parsed = await readJson(wordBankPath);
  const words = Array.isArray(parsed) ? parsed : parsed.words;

  if (!Array.isArray(words)) {
    throw new Error(`Invalid wordbank format: ${wordBankPath}`);
  }

  const { items, applied } = applyManualClues(words, clues);

  if (Array.isArray(parsed)) {
    await writeJson(wordBankPath, items);
  } else {
    await writeJson(wordBankPath, { ...parsed, words: items });
  }

  console.log(`wordbank: applied ${applied} curated clue(s) -> ${wordBankPath}`);
  return new Set(words.filter((word) => clues[word.answer] != null).map((word) => word.answer));
}

async function applyToPuzzles(puzzlesDir, clues) {
  const files = (await readdir(puzzlesDir)).filter(
    (file) => file.endsWith(".json") && !SKIP_PUZZLE_FILES.has(file),
  );
  const touchedAnswers = new Set();
  let totalApplied = 0;

  for (const file of files) {
    const filePath = path.join(puzzlesDir, file);
    const puzzle = await readJson(filePath);

    if (!Array.isArray(puzzle.entries)) {
      continue;
    }

    const { items, applied } = applyManualClues(puzzle.entries, clues);

    if (applied > 0) {
      await writeJson(filePath, { ...puzzle, entries: items });
      totalApplied += applied;
      for (const entry of items) {
        if (clues[entry.answer] != null) {
          touchedAnswers.add(entry.answer);
        }
      }
      console.log(`puzzle ${file}: applied ${applied} curated clue(s)`);
    }
  }

  console.log(`puzzles: applied ${totalApplied} curated clue(s) total`);
  return touchedAnswers;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const raw = await readJson(path.resolve(options.cluesPath));
  const clues = loadClueMap(raw);
  assertNoSelfReference(clues);

  console.log(`Loaded ${Object.keys(clues).length} curated clue(s) from ${options.cluesPath}`);

  const wordBankAnswers = await applyToWordBank(
    path.resolve(options.wordBankPath),
    clues,
  );
  const puzzleAnswers = await applyToPuzzles(
    path.resolve(options.puzzlesDir),
    clues,
  );

  const unused = Object.keys(clues).filter(
    (answer) => !wordBankAnswers.has(answer) && !puzzleAnswers.has(answer),
  );
  if (unused.length > 0) {
    console.warn(
      `Warning: ${unused.length} curated clue(s) matched no wordbank/puzzle answer: ${unused.join(", ")}`,
    );
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
