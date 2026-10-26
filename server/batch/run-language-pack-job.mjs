import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateLanguagePacks } from "./generate-language-packs.mjs";
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
  const response = await fetcher(manifestUrl, { cache: "no-store" });
  if (response.status === 404 && bootstrap) {
    if (language === "ko") {
      const prior = await fetcher(
        new URL("/puzzles/answer-history.json", baseUrl).toString(),
        { cache: "no-store" },
      );
      if (!prior.ok)
        throw new Error(
          "Korean bootstrap requires published legacy answer history",
        );
      const history = await prior.json();
      if (!Array.isArray(history.puzzles))
        throw new Error("Invalid legacy answer history");
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
  const manifest = await response.json();
  if (
    !Array.isArray(manifest.puzzles) ||
    manifest.puzzles.some((p) => p.language !== language)
  )
    throw new Error("Invalid published language manifest");
  if (manifest.priorAnswerHistoryPath) {
    const prior = await fetcher(
      new URL(manifest.priorAnswerHistoryPath, baseUrl).toString(),
      { cache: "no-store" },
    );
    if (!prior.ok) throw new Error("Cannot restore prior answer history");
    await writeFile(
      path.join(root, "prior-answer-history.json"),
      JSON.stringify(await prior.json()) + "\n",
    );
  }
  for (const item of manifest.puzzles) {
    if (!new RegExp(`^${language}-\\d{8}-[1-5]$`).test(item.puzzleId))
      throw new Error("Invalid published identity");
    const puzzleResponse = await fetcher(
      new URL(item.path, baseUrl).toString(),
      { cache: "no-store" },
    );
    if (!puzzleResponse.ok)
      throw new Error("Cannot restore published puzzle " + item.puzzleId);
    const puzzle = await puzzleResponse.json();
    if (
      puzzle.puzzleId !== item.puzzleId ||
      puzzle.language !== language ||
      puzzle.date !== item.date ||
      puzzle.dailySequence !== item.dailySequence
    )
      throw new Error("Published identity mismatch");
    await writeFile(
      path.join(root, item.puzzleId + ".json"),
      JSON.stringify(puzzle) + "\n",
    );
  }
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify(manifest) + "\n",
  );
}
export async function runLanguagePackJob({
  baseUrl,
  outDir = "public/puzzles",
  bootstrap = false,
  now = new Date(),
  fetcher = fetch,
} = {}) {
  if (!baseUrl) throw new Error("Published state base URL is required");
  const schedule = languagePackSchedule(now);
  for (const task of schedule) {
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
