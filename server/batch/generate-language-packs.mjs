import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fillCrosswordTemplate } from "./fillCrosswordTemplate.mjs";
import {
  languagePolicy,
  DAILY_PUZZLE_COUNT,
  ANSWER_REPEAT_DAYS,
} from "../../packages/crossword-core/src/dailyLanguage.ts";

const read = async (file) => {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
};
const datePlus = (date, n) =>
  new Date(Date.parse(date + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export function validateLanguagePuzzle(puzzle, history = []) {
  const policy = languagePolicy(puzzle.language),
    [min, max] = policy.words;
  const errors = [];
  if (puzzle.entries.length < min || puzzle.entries.length > max)
    errors.push("word-count");
  if (
    puzzle.gridSize !== 8 ||
    puzzle.grid.length !== 8 ||
    puzzle.grid.some((row) => row.length !== 8)
  )
    errors.push("grid-size");
  const answers = puzzle.entries.map((e) => e.answer);
  if (new Set(answers).size !== answers.length) errors.push("duplicate-answer");
  if (
    puzzle.entries.some(
      (e) => !e.clue?.trim() || !e.clueSource || e.needsManualClue,
    )
  )
    errors.push("clue");
  if (puzzle.language === "en" && answers.some((a) => !/^[A-Z]{2,8}$/.test(a)))
    errors.push("alphabet");
  const cells = new Map();
  puzzle.entries.forEach((e, i) =>
    [...e.answer].forEach((letter, j) => {
      const row = e.row + (e.direction === "down" ? j : 0),
        col = e.col + (e.direction === "across" ? j : 0),
        key = `${row},${col}`;
      if (puzzle.grid[row]?.[col] !== letter) errors.push("answer-grid");
      cells.set(key, [...(cells.get(key) ?? []), i]);
    }),
  );
  const graph = puzzle.entries.map(() => new Set());
  for (const ids of cells.values())
    for (const a of ids) for (const b of ids) if (a !== b) graph[a].add(b);
  const visited = new Set(),
    stack = graph.length ? [0] : [];
  while (stack.length) {
    const i = stack.pop();
    if (visited.has(i)) continue;
    visited.add(i);
    stack.push(...graph[i]);
  }
  if (visited.size !== puzzle.entries.length) errors.push("connected");
  const cross = [...cells.values()].filter((ids) => ids.length > 1).length;
  const multi = graph.filter(
    (_, i) =>
      [...cells.values()].filter((ids) => ids.length > 1 && ids.includes(i))
        .length >= 2,
  ).length;
  if (cross / cells.size < policy.minCrossRatio) errors.push("cross-ratio");
  if (multi / puzzle.entries.length < policy.minMultiCrossRatio)
    errors.push("multi-cross-ratio");
  const recent = new Set(
    history
      .filter(
        (p) =>
          p.language === puzzle.language &&
          p.date >= datePlus(puzzle.date, -ANSWER_REPEAT_DAYS) &&
          p.date <= datePlus(puzzle.date, ANSWER_REPEAT_DAYS),
      )
      .flatMap((p) => p.entries.map((e) => e.answer)),
  );
  if (answers.some((a) => recent.has(a))) errors.push("14-day-repeat");
  return [...new Set(errors)];
}
export async function generateLanguagePacks({
  language,
  start,
  days = 1,
  outDir,
  retries = 3000,
  seed = 20261026,
  onProgress = console.log,
}) {
  if (!["ko", "en"].includes(language)) throw new Error("Invalid language");
  if (
    !Number.isInteger(days) ||
    days < 1 ||
    days > 31 ||
    !Number.isInteger(retries) ||
    retries < 1 ||
    retries > 5000 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    datePlus(start, 0) !== start
  )
    throw new Error("Invalid generation schedule");
  const templates = (
    await read("data/puzzles/daily-board-templates.json")
  ).filter((t) => t.language === language);
  const bank = await read(
    language === "en"
      ? "data/lexicon/en-wordbank.json"
      : "data/lexicon/krdict-puzzle-wordbank.json",
  );
  if (language === "ko") {
    const review = await read("data/lexicon/ko-daily-clues.json");
    const approved = new Map(review.approved.map((w) => [w.answer, w]));
    bank.words = bank.words
      .filter((w) => !review.excluded.includes(w.answer))
      .map((w) =>
        approved.has(w.answer)
          ? { ...w, clue: approved.get(w.answer).clue, needsManualClue: false }
          : w,
      );
  }
  if (language === "en" && !bank.metadata.curation?.reviewed)
    throw new Error("English publication requires reviewed clues");
  const words = bank.words.filter(
    (w) => w.allowForPuzzle !== false && !w.needsManualClue && w.clue?.trim(),
  );
  if (language === "en" && words.length < 2500)
    throw new Error("English requires 2500 candidates");
  const root = path.resolve(outDir, language);
  await mkdir(root, { recursive: true });
  const previous = await read(path.join(root, "manifest.json"));
  const prior = await read(path.join(root, "prior-answer-history.json"));
  const history = (prior?.puzzles ?? []).map((p) => ({
    language,
    date: p.date,
    entries: p.answers.map((answer) => ({ answer })),
    legacyHistory: true,
  }));
  for (const row of previous?.puzzles ?? []) {
    const p = await read(path.join(root, path.basename(row.path)));
    if (!p) throw new Error("Missing published puzzle " + row.puzzleId);
    history.push(p);
  }
  for (let day = 0; day < days; day++)
    for (let seq = 1; seq <= DAILY_PUZZLE_COUNT; seq++) {
      const date = datePlus(start, day),
        id = `${language}-${date.replaceAll("-", "")}-${seq}`;
      if (history.some((p) => p.puzzleId === id)) continue;
      const recent = new Set(
        history
          .filter(
            (p) =>
              p.date >= datePlus(date, -ANSWER_REPEAT_DAYS) &&
              p.date <= datePlus(date, ANSWER_REPEAT_DAYS),
          )
          .flatMap((p) => p.entries.map((e) => e.answer)),
      );
      const eligible = words.filter((w) => !recent.has(w.answer));

      let puzzle, failure;
      for (let retry = 0; retry < retries && !puzzle; retry++) {
        const mask =
          templates[(day * 5 + seq + retry * 67) % templates.length].mask;
        const filled = fillCrosswordTemplate(
          mask,
          eligible,
          language,
          seed + day * 5003 + seq * 137 + retry * 7727,
        );
        if (!filled) continue;
        const candidate = {
          ...filled,
          language,
          dailySequence: seq,
          puzzleId: id,
          alias: id,
          date,
          difficulty: "hard",
          gridSize: 8,
          packId: `${language}-daily-v1`,
          slotId: id,
          publishedAt: new Date().toISOString(),
        };
        const errors = validateLanguagePuzzle(candidate, history);
        if (!errors.length) puzzle = candidate;
        else failure = errors.join(",");
      }
      if (!puzzle)
        throw new Error(
          `Generation failed ${id}: ${failure ?? "no qualifying board"}; thresholds unchanged`,
        );
      await writeFile(
        path.join(root, id + ".json"),
        JSON.stringify(puzzle) + "\n",
      );
      history.push(puzzle);
      // Commit each accepted slot so interrupted/repeated runs retain all published identities.
      const manifest = {
        language,
        ...(prior
          ? {
              priorAnswerHistoryPath: `/puzzles/${language}/prior-answer-history.json`,
            }
          : {}),
        generatedAt: new Date().toISOString(),
        policy: {
          version: 1,
          dailyCount: DAILY_PUZZLE_COUNT,
          answerHistoryDays: ANSWER_REPEAT_DAYS,
        },
        wordBank: bank.metadata,
        puzzles: history
          .filter((p) => !p.legacyHistory)
          .map((p) => ({
            puzzleId: p.puzzleId,
            language,
            dailySequence: p.dailySequence,
            date: p.date,
            path: `/puzzles/${language}/${p.puzzleId}.json`,
            publishedAt: p.publishedAt,
            packId: p.packId,
            slotId: p.slotId,
            difficulty: p.difficulty,
            metrics: p.metrics,
          })),
      };
      await writeFile(
        path.join(root, "manifest.json"),
        JSON.stringify(manifest, null, 2) + "\n",
      );
      onProgress(
        `${id} ${puzzle.entries.length} words cross=${puzzle.metrics.crossRatio}`,
      );
    }
  return history;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = Object.fromEntries(
    process.argv.slice(2).map((x) => x.replace(/^--/, "").split("=")),
  );
  await generateLanguagePacks({
    language: args.language,
    start: args.start,
    days: Number(args.days ?? 1),
    outDir: args.outDir ?? "public/puzzles",
    retries: Number(args.retries ?? 3000),
  });
}
