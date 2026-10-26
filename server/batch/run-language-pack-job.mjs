import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateLanguagePacks } from "./generate-language-packs.mjs";
import { withCacheBust } from "./puzzlePackIo.mjs";
import {
  validateLanguageManifest,
  validateLegacyHistory,
} from "./languagePackValidation.mjs";
import { contentDate } from "../../packages/crossword-core/src/dailyLanguage.ts";
const plus = (date, n) =>
  new Date(Date.parse(date + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export function languagePackSchedule(now = new Date()) {
  const utc = now.toISOString().slice(0, 10);
  return [
    { language: "ko", start: contentDate("ko", now), days: 2 },
    { language: "en", start: plus(utc, -1), days: 5 },
  ];
}
export async function restoreLanguagePackState({
  language,
  baseUrl,
  outDir,
  bootstrap = false,
  fetcher = fetch,
}) {
  const root = path.resolve(outDir, language);
  await mkdir(root, { recursive: true });
  const manifestUrl = new URL(
    `/puzzles/${language}/manifest.json`,
    baseUrl,
  ).toString();
  const fresh = (url) =>
    fetcher(withCacheBust(url, "languageState").toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  const response = await fresh(manifestUrl);
  if (response.status === 404 && bootstrap) {
    if (language === "ko") {
      const prior = await fresh(
        new URL("/puzzles/answer-history.json", baseUrl).toString(),
      );
      if (!prior.ok)
        throw new Error(
          "Korean bootstrap requires published legacy answer history",
        );
      const history = await prior.json();
      validateLegacyHistory(history);
      await writeFile(
        path.join(root, "prior-answer-history.json"),
        JSON.stringify(history) + "\n",
      );
    }
    return;
  }
  if (!response.ok)
    throw new Error(
      `Cannot restore published ${language} manifest: ${response.status}`,
    );
  const manifestText = await response.text();
  const manifest = JSON.parse(manifestText);
  validateLanguageManifest(manifest, language);
  if (manifest.priorAnswerHistoryPath) {
    const prior = await fresh(
      new URL(manifest.priorAnswerHistoryPath, baseUrl).toString(),
    );
    if (!prior.ok) throw new Error("Cannot restore prior answer history");
    await writeFile(
      path.join(root, "prior-answer-history.json"),
      JSON.stringify(validateLegacyHistory(await prior.json())) + "\n",
    );
  }
  for (const item of manifest.puzzles) {
    const puzzleResponse = await fresh(new URL(item.path, baseUrl).toString());
    if (!puzzleResponse.ok)
      throw new Error("Cannot restore published puzzle " + item.puzzleId);
    const puzzleText = await puzzleResponse.text();
    const puzzle = JSON.parse(puzzleText);
    if (
      puzzle.puzzleId !== item.puzzleId ||
      puzzle.language !== language ||
      puzzle.date !== item.date ||
      puzzle.dailySequence !== item.dailySequence
    )
      throw new Error("Published identity mismatch");
    await writeFile(path.join(root, item.puzzleId + ".json"), puzzleText);
  }
  await writeFile(path.join(root, "manifest.json"), manifestText);
}
export async function runLanguagePackJob({
  baseUrl,
  outDir = "public/puzzles",
  bootstrap = false,
  now = new Date(),
  fetcher = fetch,
  restored = false,
} = {}) {
  if (!baseUrl) throw new Error("Published state base URL is required");
  const schedule = languagePackSchedule(now);
  for (const task of schedule) {
    if (!restored)
      await restoreLanguagePackState({
        ...task,
        baseUrl,
        outDir,
        bootstrap,
        fetcher,
      });
    await generateLanguagePacks({ ...task, outDir });
  }
  // Publication is a separate explicit operation. A failed generation never publishes partial packs.
  return schedule;
}
if (
  process.argv[1] &&
  import.meta.url.endsWith("/" + path.basename(process.argv[1]))
) {
  const args = Object.fromEntries(
    process.argv.slice(2).map((x) => x.replace(/^--/, "").split("=")),
  );
  if (args["dry-run"] !== undefined)
    console.log(JSON.stringify(languagePackSchedule(), null, 2));
  else
    await runLanguagePackJob({
      baseUrl: args.baseUrl,
      outDir: args.outDir,
      bootstrap: args.bootstrap === "true",
    });
}
