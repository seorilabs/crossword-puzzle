import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  languagePackSchedule,
  restoreLanguagePackState,
} from "./run-language-pack-job.mjs";
import { validateLanguagePackDirectory } from "./languagePackValidation.mjs";

export async function checkPublishedLanguagePacks({
  baseUrl,
  now = new Date(),
  fetcher = fetch,
}) {
  const outDir = await mkdtemp(
    path.join(tmpdir(), "crossword-language-health-"),
  );
  try {
    const schedule = languagePackSchedule(now);
    for (const task of schedule)
      await restoreLanguagePackState({ ...task, baseUrl, outDir, fetcher });
    const result = await validateLanguagePackDirectory({ outDir, schedule });
    for (const item of result)
      console.log(
        `[language-pack-health] PASS ${item.language} start=${item.start} days=${item.days} puzzles=${item.puzzleCount}`,
      );
    return result;
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}
