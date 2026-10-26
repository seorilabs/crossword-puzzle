import { readFile } from "node:fs/promises";
import path from "node:path";
import { DAILY_PUZZLE_COUNT } from "../../packages/crossword-core/src/dailyLanguage.ts";
import {
  isValidDateKey,
  parseAnswerHistory,
  shiftDateKey,
} from "../../packages/crossword-core/src/answerHistory.ts";
import { validateLanguagePuzzle } from "./generate-language-packs.mjs";

export function validateLegacyHistory(history) {
  const parsed = parseAnswerHistory(history);
  if (
    !parsed ||
    parsed.droppedEntryCount ||
    history.puzzles.some(
      (item) =>
        !item.answers.length ||
        item.answers.some(
          (answer) => typeof answer !== "string" || !answer.trim(),
        ),
    )
  )
    throw new Error("Invalid legacy answer history");
  return history;
}
export function validateLanguageManifest(manifest, language) {
  if (manifest?.language !== language || !Array.isArray(manifest.puzzles))
    throw new Error("Invalid published language manifest");
  const identities = new Set();
  for (const item of manifest.puzzles) {
    if (
      !isValidDateKey(item.date) ||
      !Number.isInteger(item.dailySequence) ||
      item.dailySequence < 1 ||
      item.dailySequence > DAILY_PUZZLE_COUNT ||
      item.language !== language ||
      item.puzzleId !==
        `${language}-${item.date.replaceAll("-", "")}-${item.dailySequence}` ||
      item.path !== `/puzzles/${language}/${item.puzzleId}.json` ||
      identities.has(item.puzzleId)
    )
      throw new Error("Invalid published identity");
    identities.add(item.puzzleId);
  }
  if (
    manifest.priorAnswerHistoryPath &&
    manifest.priorAnswerHistoryPath !==
      `/puzzles/${language}/prior-answer-history.json`
  )
    throw new Error("Invalid prior answer history path");
}
export async function validateLanguagePackDirectory({ outDir, schedule }) {
  const summaries = [];
  for (const task of schedule) {
    const root = path.join(outDir, task.language);
    const manifest = JSON.parse(
      await readFile(path.join(root, "manifest.json"), "utf8"),
    );
    validateLanguageManifest(manifest, task.language);
    const puzzles = [];
    for (const item of manifest.puzzles) {
      const puzzle = JSON.parse(
        await readFile(path.join(root, item.puzzleId + ".json"), "utf8"),
      );
      if (
        puzzle.puzzleId !== item.puzzleId ||
        puzzle.language !== task.language ||
        puzzle.date !== item.date ||
        puzzle.dailySequence !== item.dailySequence
      )
        throw new Error("Published identity mismatch: " + item.puzzleId);
      puzzles.push(puzzle);
    }
    const prior = manifest.priorAnswerHistoryPath
      ? validateLegacyHistory(
          JSON.parse(
            await readFile(
              path.join(root, "prior-answer-history.json"),
              "utf8",
            ),
          ),
        ).puzzles.map((item) => ({
          language: task.language,
          date: item.date,
          entries: item.answers.map((answer) => ({ answer })),
        }))
      : [];
    const byDate = new Map();
    for (const puzzle of puzzles) {
      const failures = validateLanguagePuzzle(puzzle, [
        ...puzzles.filter((other) => other.puzzleId !== puzzle.puzzleId),
        ...prior,
      ]);
      if (failures.length)
        throw new Error(
          `Language pack ${puzzle.puzzleId} failed: ${failures.join(",")}`,
        );
      byDate.set(puzzle.date, (byDate.get(puzzle.date) ?? 0) + 1);
    }
    for (const [date, count] of byDate)
      if (count !== DAILY_PUZZLE_COUNT)
        throw new Error(
          `Incomplete ${task.language} date ${date}: ${count}/${DAILY_PUZZLE_COUNT}`,
        );
    for (let day = 0; day < task.days; day++) {
      const date = shiftDateKey(task.start, day);
      if (byDate.get(date) !== DAILY_PUZZLE_COUNT)
        throw new Error(`Missing ${task.language} supply for ${date}`);
    }
    summaries.push({
      language: task.language,
      start: task.start,
      days: task.days,
      puzzleCount: puzzles.length,
    });
  }
  return summaries;
}
