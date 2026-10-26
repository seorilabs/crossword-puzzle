import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  isValidDateKey,
  shiftDateKey,
  parseAnswerHistory,
} from "../../packages/crossword-core/src/answerHistory.ts";
import { validateLegacyHistory } from "./languagePackValidation.mjs";
import { withCacheBust } from "./puzzlePackIo.mjs";

const canonical = (value) =>
  JSON.stringify(value, (_, item) =>
    item && !Array.isArray(item) && typeof item === "object"
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
const identity = (item) => String(item.slotId ?? item.puzzleId);
function outputPath(outDir, publishedPath, baseUrl) {
  const url = new URL(publishedPath, baseUrl);
  const relative = decodeURIComponent(url.pathname).slice("/puzzles/".length);
  if (
    url.origin !== new URL(baseUrl).origin ||
    !url.pathname.startsWith("/puzzles/") ||
    !relative.endsWith(".json") ||
    relative.split("/").some((part) => part === ".." || !part) ||
    relative.includes("\\") ||
    relative.includes("\0") ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid published legacy puzzle path");
  return path.join(outDir, relative);
}
export async function restorePublishedLegacyPack({
  baseUrl,
  outDir,
  manifestUrl,
  historyUrl,
  fetcher = fetch,
}) {
  const fresh = async (url) => {
    if (new URL(url, baseUrl).origin !== new URL(baseUrl).origin)
      throw new Error(
        "Published legacy state must come from the configured Hosting site",
      );
    const response = await fetcher(
      withCacheBust(url, "legacyState").toString(),
      { cache: "no-store", signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok)
      throw new Error(
        `Cannot restore published legacy state: ${response.status}`,
      );
    return Buffer.from(await response.arrayBuffer());
  };
  const manifestText = await fresh(
    manifestUrl ?? new URL("/puzzles/manifest.json", baseUrl),
  );
  const historyText = await fresh(
    historyUrl ?? new URL("/puzzles/answer-history.json", baseUrl),
  );
  const manifest = JSON.parse(manifestText);
  const history = validateLegacyHistory(JSON.parse(historyText));
  if (!Array.isArray(manifest.puzzles))
    throw new Error("Invalid published legacy manifest");
  const puzzles = [];
  const usedPaths = new Set();
  for (const item of manifest.puzzles) {
    const id = String(item.puzzleId ?? "");
    const target = outputPath(outDir, item.path, baseUrl);
    if (
      !id ||
      !isValidDateKey(item.date) ||
      usedPaths.has(target) ||
      (item.language != null && item.language !== "ko")
    )
      throw new Error("Invalid published legacy identity");
    usedPaths.add(target);
    const bytes = await fresh(new URL(item.path, baseUrl));
    const puzzle = JSON.parse(bytes);
    if (
      String(puzzle.puzzleId) !== id ||
      puzzle.date !== item.date ||
      !Array.isArray(puzzle.entries) ||
      !Array.isArray(puzzle.grid) ||
      (puzzle.language != null && puzzle.language !== "ko") ||
      (item.slotId && puzzle.slotId !== item.slotId)
    )
      throw new Error("Published legacy identity mismatch: " + id);
    const record = history.puzzles.find(
      (record) =>
        identity(record) === identity(item) || String(record.puzzleId) === id,
    );
    if (
      !record ||
      record.date !== puzzle.date ||
      canonical([...record.answers].sort()) !==
        canonical(puzzle.entries.map((entry) => entry.answer).sort())
    )
      throw new Error("Published legacy history mismatch: " + id);
    puzzles.push({ item, puzzle, bytes, target });
  }
  await mkdir(outDir, { recursive: true });
  for (const item of puzzles) {
    await mkdir(path.dirname(item.target), { recursive: true });
    await writeFile(item.target, item.bytes);
  }
  await writeFile(path.join(outDir, "manifest.json"), manifestText);
  await writeFile(path.join(outDir, "answer-history.json"), historyText);
  return {
    manifest,
    history,
    puzzles,
    retentionDays: parseAnswerHistory(history).history.retentionDays,
  };
}
export function legacySlotWasPublished(state, slot) {
  return (
    state?.puzzles.some(
      ({ item, puzzle }) =>
        String(item.puzzleId) === slot.puzzleId ||
        String(puzzle.puzzleId) === slot.puzzleId ||
        (item.slotId ?? puzzle.slotId) === slot.slotId ||
        (!(item.slotId ?? puzzle.slotId) &&
          item.date === slot.date &&
          (item.difficulty ?? puzzle.difficulty) === slot.difficulty),
    ) ?? false
  );
}
export async function assertPublishedLegacyUnchanged({
  state,
  outDir,
  retentionDate,
}) {
  if (!state) return;
  for (const original of state.puzzles)
    if (!(await readFile(original.target)).equals(original.bytes))
      throw new Error(
        "Refusing to change a published legacy puzzle: " +
          original.item.puzzleId,
      );
  const history = validateLegacyHistory(
    JSON.parse(
      await readFile(path.join(outDir, "answer-history.json"), "utf8"),
    ),
  );
  const protectedIds = new Set(
    state.puzzles.flatMap(({ item }) => [
      identity(item),
      String(item.puzzleId),
    ]),
  );
  const cutoff = shiftDateKey(retentionDate, -state.retentionDays);
  const current = new Map(
    history.puzzles.map((item) => [identity(item), item]),
  );
  for (const original of state.history.puzzles) {
    if (
      original.date < cutoff &&
      !protectedIds.has(identity(original)) &&
      !protectedIds.has(String(original.puzzleId))
    )
      continue;
    if (canonical(current.get(identity(original))) !== canonical(original))
      throw new Error(
        "Refusing to change a published legacy history record: " +
          original.puzzleId,
      );
  }
}
