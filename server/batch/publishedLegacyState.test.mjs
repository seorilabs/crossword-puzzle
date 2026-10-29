import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runPuzzlePackJob } from "./run-puzzle-pack-job.mjs";
const date = "2026-10-26";
const item = (difficulty, hour) => ({
  puzzleId: `2610260${hour}`,
  date,
  difficulty,
  slotId: `${date}-h0${hour}`,
  path: `/puzzles/2610260${hour}.json`,
});
const puzzle = (row) => ({
  ...row,
  alias: row.puzzleId,
  gridSize: 5,
  grid: [["원", "본"]],
  entries: [
    {
      answer: "원본",
      clue: "보존할 단어",
      direction: "across",
      row: 0,
      col: 0,
    },
  ],
});
const argument = (args, key) =>
  args.find((value) => value.startsWith(`--${key}=`))?.slice(key.length + 3);
async function scenario({
  partial = false,
  nextDay = false,
  failedRestore = false,
  mutatePriorHistory = false,
  repeat = false,
  historyOnly = false,
  pruneExpired = false,
  opaqueIds = false,
} = {}) {
  const oldEnv = { ...process.env };
  const root = await mkdtemp(
    path.join(tmpdir(), "crossword-published-legacy-test-"),
  );
  const outDir = path.join(root, "puzzles");
  let rows =
    partial === "hard"
      ? [item("hard", 1)]
      : partial
        ? [item("easy", 0)]
        : [item("easy", 0), item("hard", 1)];
  if (opaqueIds)
    rows = rows.map((row) => ({
      ...row,
      puzzleId: `historical-${row.difficulty}-identity`,
      path: `/puzzles/arbitrary-${row.difficulty}.json`,
    }));
  const originalManifest = JSON.stringify({ puzzles: rows }, null, 2) + "\n\n";
  const history = {
    version: 1,
    retentionDays: 90,
    updatedAt: "2026-10-26T00:00:00Z",
    puzzles: rows.map((row) => ({
      puzzleId: row.puzzleId,
      date,
      difficulty: row.difficulty,
      slotId: row.slotId,
      answers: ["원본"],
    })),
  };
  if (historyOnly)
    history.puzzles.push(
      {
        puzzleId: "history-only-long-identifier",
        date: "2026-08-20",
        difficulty: "hard",
        answers: ["기록"],
      },
      {
        puzzleId: "boundary-history-id",
        date: "2026-07-29",
        difficulty: "hard",
        answers: ["경계"],
      },
      {
        puzzleId: "expired-history-id",
        date: "2026-07-28",
        difficulty: "hard",
        answers: ["만료"],
      },
    );
  const originalHistory = JSON.stringify(history, null, 3) + "\n\n";
  const originals = new Map(
    rows.map((row) => [
      row.path,
      JSON.stringify(puzzle(row), null, 3) + "\n\n",
    ]),
  );
  const remote = new Map([
    ["/puzzles/manifest.json", originalManifest],
    ["/puzzles/answer-history.json", originalHistory],
    ...originals,
  ]);
  const generated = [];
  const fetched = [];
  const published = [];
  try {
    for (const key of Object.keys(process.env))
      if (key.startsWith("PUZZLE_")) delete process.env[key];
    Object.assign(process.env, {
      PUZZLE_HOSTING_BASE_URL: "https://fixture.test",
      FIREBASE_HOSTING_SITE: "fixture",
      PUZZLE_DAILY_TIERS: "true",
    });
    await mkdir(outDir, { recursive: true });
    for (const [url, text] of remote)
      await writeFile(path.join(root, url), text);
    const run = () =>
      runPuzzlePackJob({
        argv: [`--outDir=${outDir}`],
        now: new Date(
          nextDay ? "2026-10-27T00:00:00Z" : "2026-10-26T00:00:00Z",
        ),
        fetcher: async (input) => {
          const url = new URL(input);
          fetched.push(url.pathname);
          const text = remote.get(url.pathname);
          return new Response(text ?? "", {
            status: failedRestore ? 503 : text ? 200 : 404,
          });
        },
        prepareLanguages: async () =>
          "data/lexicon/krdict-puzzle-wordbank.json",
        refreshLegacyHistory: async () => {},
        runLanguageJob: async () => {
          await mkdir(path.join(outDir, "ko"), { recursive: true });
          await writeFile(
            path.join(outDir, "ko/new-language.json"),
            "new Korean boards",
          );
        },
        validateLanguages: async () => {},
        waitForPublication: async () => {},
        resolveLiveRelease: async () => ({
          name: "sites/fixture/releases/before",
        }),
        runScript: async (script, args) => {
          if (script.endsWith("generate-puzzle-pack.mjs")) {
            const difficulty = argument(args, "difficulty");
            const publishedAt = new Date(argument(args, "publishedAt"));
            const localDate = publishedAt.toLocaleDateString("en-CA", {
              timeZone: "Asia/Seoul",
            });
            const hour =
              Number(
                new Intl.DateTimeFormat("en-CA", {
                  hour: "2-digit",
                  hour12: false,
                  timeZone: "Asia/Seoul",
                }).format(publishedAt),
              ) % 24;
            const id =
              localDate.slice(2).replaceAll("-", "") +
              String(hour).padStart(2, "0");
            generated.push({ id, difficulty, args });
            const row = {
              puzzleId: id,
              date: localDate,
              difficulty,
              slotId: `${localDate}-h${String(hour).padStart(2, "0")}`,
              path: `/puzzles/${id}.json`,
            };
            const board = {
              ...puzzle(row),
              entries: [
                {
                  answer: "바뀜",
                  clue: "새 답",
                  direction: "across",
                  row: 0,
                  col: 0,
                },
              ],
            };
            await writeFile(
              path.join(outDir, id + ".json"),
              JSON.stringify(board),
            );
            const manifest = JSON.parse(
              await readFile(path.join(outDir, "manifest.json"), "utf8"),
            );
            manifest.puzzles = [
              ...manifest.puzzles.filter((item) => item.puzzleId !== id),
              row,
            ];
            await writeFile(
              path.join(outDir, "manifest.json"),
              JSON.stringify(manifest),
            );
            const current = JSON.parse(
              await readFile(path.join(outDir, "answer-history.json"), "utf8"),
            );
            current.puzzles = [
              ...current.puzzles.filter((item) => item.puzzleId !== id),
              {
                puzzleId: id,
                date: localDate,
                difficulty,
                slotId: row.slotId,
                answers: ["바뀜"],
              },
            ];
            if (pruneExpired)
              current.puzzles = current.puzzles.filter(
                (entry) => entry.date >= "2026-07-29",
              );
            if (mutatePriorHistory)
              current.puzzles.find(
                (entry) =>
                  entry.puzzleId ===
                  (historyOnly
                    ? "history-only-long-identifier"
                    : rows[0].puzzleId),
              ).answers = ["손상"];
            await writeFile(
              path.join(outDir, "answer-history.json"),
              JSON.stringify(current),
            );
          } else if (script.endsWith("publish-puzzle-pack.mjs"))
            published.push(args);
        },
      });
    if (failedRestore || mutatePriorHistory) {
      await assert.rejects(
        run(),
        failedRestore
          ? /restore.*503/i
          : /published.*history|history.*published/i,
      );
      return { generated, published };
    }
    await run();
    if (repeat) await run();
    for (const [url, text] of originals)
      assert.equal(await readFile(path.join(root, url), "utf8"), text);
    const after = JSON.parse(
      await readFile(path.join(outDir, "answer-history.json"), "utf8"),
    );
    for (const record of history.puzzles.filter(
      (record) => !pruneExpired || record.date >= "2026-07-29",
    ))
      assert.deepEqual(
        after.puzzles.find((item) => item.puzzleId === record.puzzleId),
        record,
      );
    if (!partial && !nextDay)
      assert.equal(
        await readFile(path.join(outDir, "answer-history.json"), "utf8"),
        originalHistory,
      );
    return { generated, published, fetched };
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
    await rm(root, { recursive: true, force: true });
  }
}
test("AC-2 issued legacy easy and hard slots bypass the generator and preserve every JSON and history byte", async () => {
  const result = await scenario();
  assert.equal(result.generated.length, 0);
  assert.equal(result.published.length, 1);
  assert.ok(result.fetched.includes("/puzzles/manifest.json"));
});
test("AC-2 a partially issued legacy day generates only the missing hard slot", async () => {
  const result = await scenario({ partial: true });
  assert.deepEqual(
    result.generated.map((item) => item.difficulty),
    ["hard"],
  );
});
test("AC-2 the following day permits two new slots while retaining older published boards and history records", async () => {
  const result = await scenario({ nextDay: true });
  assert.deepEqual(
    result.generated.map((item) => item.id),
    ["26102700", "26102701"],
  );
});
test("AC-2 recovery reruns after language generation never regenerate the existing legacy day", async () => {
  const result = await scenario({ repeat: true });
  assert.equal(result.generated.length, 0);
  assert.equal(result.published.length, 2);
});
test("AC-2 legacy restore failure or mutation of an issued history record fails before publication", async () => {
  const failed = await scenario({ failedRestore: true });
  assert.equal(failed.generated.length, 0);
  assert.equal(failed.published.length, 0);
  const changed = await scenario({ nextDay: true, mutatePriorHistory: true });
  assert.equal(changed.published.length, 0);
});

test("AC-2 a day with only the issued hard slot generates only the missing easy slot", async () => {
  const result = await scenario({ partial: "hard" });
  assert.deepEqual(
    result.generated.map((item) => item.difficulty),
    ["easy"],
  );
});
test("AC-2 retained history-only arbitrary IDs are immutable while normal 90-day expiry pruning is allowed", async () => {
  const changed = await scenario({
    nextDay: true,
    historyOnly: true,
    mutatePriorHistory: true,
  });
  assert.equal(changed.published.length, 0);
  const pruned = await scenario({
    nextDay: true,
    historyOnly: true,
    pruneExpired: true,
  });
  assert.equal(pruned.generated.length, 2);
  assert.equal(pruned.published.length, 1);
});

test("AC-2 language-less published puzzles with arbitrary string IDs are skipped by their issued slot", async () => {
  const result = await scenario({ opaqueIds: true });
  assert.equal(result.generated.length, 0);
  assert.equal(result.published.length, 1);
});

test("AC-2 the configured 60-day retention permits expired history pruning", async () => {
  const { assertPublishedLegacyUnchanged } = await import("./publishedLegacyState.mjs");
  const root = await mkdtemp(path.join(tmpdir(), "legacy-retention-60-"));
  const original = {
    puzzleId: "expired-record",
    date: "2026-08-20",
    answers: ["기록"],
  };
  try {
    await writeFile(
      path.join(root, "answer-history.json"),
      JSON.stringify({ version: 1, retentionDays: 60, puzzles: [] }),
    );
    await assertPublishedLegacyUnchanged({
      state: { puzzles: [], history: { puzzles: [original] }, retentionDays: 90 },
      outDir: root,
      retentionDate: "2026-10-27",
      retentionDays: 60,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-2 the configured 120-day retention protects still-current history", async () => {
  const { assertPublishedLegacyUnchanged } = await import("./publishedLegacyState.mjs");
  const root = await mkdtemp(path.join(tmpdir(), "legacy-retention-120-"));
  const original = {
    puzzleId: "retained-record",
    date: "2026-07-10",
    answers: ["기록"],
  };
  try {
    await writeFile(
      path.join(root, "answer-history.json"),
      JSON.stringify({ version: 1, retentionDays: 120, puzzles: [] }),
    );
    await assert.rejects(
      assertPublishedLegacyUnchanged({
        state: { puzzles: [], history: { puzzles: [original] }, retentionDays: 90 },
        outDir: root,
        retentionDate: "2026-10-27",
        retentionDays: 120,
      }),
      /published legacy history/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
