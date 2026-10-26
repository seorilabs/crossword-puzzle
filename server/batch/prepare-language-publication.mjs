import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ANSWER_REPEAT_DAYS } from "../../packages/crossword-core/src/dailyLanguage.ts";
import { shiftDateKey } from "../../packages/crossword-core/src/answerHistory.ts";
import { restoreLanguagePackState } from "./run-language-pack-job.mjs";
import { readJsonOptional } from "./puzzlePackIo.mjs";
import { validateLegacyHistory } from "./languagePackValidation.mjs";

export async function prepareLanguagePublication({
  baseUrl,
  outDir,
  bootstrap,
  wordBankPath,
  start,
  days,
  workspace,
  fetcher = fetch,
}) {
  for (const language of ["ko", "en"])
    await restoreLanguagePackState({
      language,
      baseUrl,
      outDir,
      bootstrap,
      fetcher,
    });
  const manifest = await readJsonOptional(
    path.join(outDir, "ko/manifest.json"),
  );
  const excluded = new Set();
  for (const item of manifest?.puzzles ?? []) {
    if (
      item.date < shiftDateKey(start, -ANSWER_REPEAT_DAYS) ||
      item.date > shiftDateKey(start, days - 1 + ANSWER_REPEAT_DAYS)
    )
      continue;
    const puzzle = JSON.parse(
      await readFile(path.join(outDir, "ko", item.puzzleId + ".json"), "utf8"),
    );
    for (const entry of puzzle.entries) excluded.add(entry.answer);
  }
  const bank = JSON.parse(await readFile(wordBankPath, "utf8"));
  if (!Array.isArray(bank.words)) throw new Error("Invalid legacy word bank");
  const filtered = {
    ...bank,
    words: bank.words.filter((word) => !excluded.has(word.answer)),
  };
  await mkdir(workspace, { recursive: true });
  const filteredWordBankPath = path.join(workspace, "legacy-wordbank.json");
  await writeFile(filteredWordBankPath, JSON.stringify(filtered) + "\n");
  return filteredWordBankPath;
}

// A fresh legacy batch must also be excluded when producing new Korean boards.
// Keep this as language-prior history; adding five-daily boards to legacy's
// 90-day history would change the old client's health contract.
export async function refreshKoreanLegacyHistory({ outDir }) {
  const history = validateLegacyHistory(
    JSON.parse(
      await readFile(path.join(outDir, "answer-history.json"), "utf8"),
    ),
  );
  const previous = await readJsonOptional(
    path.join(outDir, "ko/prior-answer-history.json"),
  );
  if (previous) validateLegacyHistory(previous);
  const byId = new Map();
  for (const item of [...(previous?.puzzles ?? []), ...history.puzzles])
    byId.set(item.slotId ?? item.puzzleId, item);
  await writeFile(
    path.join(outDir, "ko/prior-answer-history.json"),
    JSON.stringify({ ...history, puzzles: [...byId.values()] }) + "\n",
  );
}
