import { evaluatePublishedPuzzlePackHealth } from "../../packages/crossword-core/src/puzzlePackHealth.ts";
import { DIFFICULTY_ORDER } from "../../packages/crossword-core/src/difficultyProfiles.ts";
import { validatePuzzle } from "../../scripts/validate-puzzle-pack.mjs";

const DEFAULT_BASE_URL = "https://crossword-puzzle-79ae0.web.app";
const DEFAULT_TIME_ZONE = "Asia/Seoul";
const REQUIRED_FETCH_ATTEMPTS = 3;

function readOption(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv
    .slice(2)
    .find((item) => item.startsWith(prefix));

  return argument?.slice(prefix.length) ?? fallback;
}

function getDateKey(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

async function fetchJson(url) {
  let lastError;

  for (let attempt = 1; attempt <= REQUIRED_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const target = new URL(url);
      target.searchParams.set("healthCheck", `${Date.now()}-${attempt}`);
      const response = await fetch(target, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      console.warn(
        `[puzzle-pack-health] fetch attempt ${attempt}/${REQUIRED_FETCH_ATTEMPTS} failed for ${url}: ${error.message}`,
      );
    }
  }

  throw lastError;
}

async function run() {
  const baseUrl = readOption(
    "baseUrl",
    process.env.PUZZLE_HOSTING_BASE_URL ?? DEFAULT_BASE_URL,
  );
  const timeZone = readOption(
    "timeZone",
    process.env.PUZZLE_TIME_ZONE ?? DEFAULT_TIME_ZONE,
  );
  const expectedDate = readOption("date", getDateKey(timeZone));
  const manifestUrl = new URL("/puzzles/manifest.json", baseUrl);
  const manifest = await fetchJson(manifestUrl);
  const items =
    manifest.puzzles?.filter((item) => item.date === expectedDate) ?? [];
  const puzzlesByPath = {};

  await Promise.all(
    items.map(async (item) => {
      puzzlesByPath[item.path] = await fetchJson(new URL(item.path, baseUrl));
    }),
  );

  const health = evaluatePublishedPuzzlePackHealth({
    expectedDate,
    manifest,
    puzzlesByPath,
  });
  const structuralFailures = items.flatMap((item) => {
    const puzzle = puzzlesByPath[item.path];
    if (puzzle == null) {
      return [];
    }

    const validation = validatePuzzle(puzzle, 1);
    return validation.pass ? [] : [puzzle.puzzleId];
  });

  if (!health.pass || structuralFailures.length > 0) {
    for (const issue of health.issues) {
      console.error(`[puzzle-pack-health] ${issue.code}: ${issue.detail}`);
    }
    for (const puzzleId of structuralFailures) {
      console.error(
        `[puzzle-pack-health] structural_validation_failed: ${puzzleId}`,
      );
    }

    throw new Error(
      `published puzzle pack health check failed for ${expectedDate}`,
    );
  }

  // 난이도 티어 구성을 하드코딩하면 티어가 바뀔 때 로그에 normal=undefined 같은
  // 잔재가 남는다. 검사와 같은 출처(DIFFICULTY_ORDER)를 쓴다.
  const summary = DIFFICULTY_ORDER.map(
    (difficulty) => `${difficulty}=${health.puzzleIds[difficulty]}`,
  ).join(" ");

  console.log(`[puzzle-pack-health] PASS date=${expectedDate} ${summary}`);
}

run().catch((error) => {
  console.error(`[puzzle-pack-health] FAIL ${error.message}`);
  process.exitCode = 1;
});
