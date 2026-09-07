// 발행 정답 이력(answer-history.json) 운영 계약 — 생성기 CLI 를 실제로 실행해
// 이력 파일 생성·배제·재실행·원격 폴백을 검증한다. puzzlePackOperations.test.ts 의
// spawn 패턴을 따르되, 생성이 빨리 끝나도록 시도·후보 수와 품질 게이트를 완화한다.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";

import type { AnswerHistoryEntry, AnswerHistoryFile } from "./answerHistory.ts";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const GENERATOR_SCRIPT = path.join(
  REPO_ROOT,
  "server/batch/generate-puzzle-pack.mjs",
);
// seed 는 워드뱅크·배제 풀이 같으면 결정적이다. 아래 seed 들은 현재 워드뱅크에서
// 첫 retry 안에 보드를 만드는 값으로 골랐다(일부 seed 는 attempts=10 으로 보드를
// 못 만들어 "No board generated" 로 끝난다). 워드뱅크가 크게 바뀌어 실패하면 seed 만
// 바꾸면 된다.
const FAST_ARGS = [
  "--append",
  "--difficulty=easy",
  "--days=1",
  "--intervalHours=1",
  "--attempts=10",
  "--samples=2",
  "--candidates=600",
  "--retries=3",
  "--minCross=0",
  "--minDensity=0",
  "--minMulti=0",
  "--maxAuto=1",
];

type RunResult = { code: number | null; stderr: string; stdout: string };

function runGenerator(args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [GENERATOR_SCRIPT, ...args], {
      cwd: REPO_ROOT,
      env: process.env,
    });
    let stderr = "";
    let stdout = "";

    child.stderr.setEncoding("utf8");
    child.stdout.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr, stdout }));
  });
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

type GeneratedPuzzle = {
  puzzleId: string;
  date: string;
  difficulty: string;
  entries: Array<{ answer: string; [key: string]: unknown }>;
  [key: string]: unknown;
};

type GenerationReport = {
  report: Array<{
    alias: string;
    accepted: boolean;
    selected?: {
      diversity?: {
        historyExactPuzzleCount: number;
        historyExactAnswerCount: number;
        historyExactExcludedWordCount: number;
        historyFragmentPuzzleCount: number;
      };
    };
  }>;
};

function dayArgs(
  outDir: string,
  date: string,
  publishedAt: string,
  seed: number,
  extra: string[] = [],
) {
  return [
    ...FAST_ARGS,
    `--outDir=${outDir}`,
    `--start=${date}`,
    `--publishedAt=${publishedAt}`,
    `--seed=${seed}`,
    ...extra,
  ];
}

function answersOf(puzzle: GeneratedPuzzle): Set<string> {
  return new Set(puzzle.entries.map((entry) => entry.answer));
}

function intersection(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => right.has(value));
}

// 원격 Hosting 을 흉내 내는 서버. 경로별 응답을 주입하고 받은 요청을 기록한다.
function startFixtureServer(
  routes: Record<string, { status: number; body?: unknown }>,
): Promise<{ server: Server; baseUrl: string; requests: string[] }> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    requests.push(`${url.pathname}${url.search}`);
    const route = routes[url.pathname];
    if (route == null) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }
    response.writeHead(route.status, { "content-type": "application/json" });
    response.end(route.body == null ? "" : JSON.stringify(route.body));
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, requests });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// 원격 manifest 에 실려 있을 어제(9/9) hard 퍼즐. hydrate 검사(difficulty 일치)와
// 다양성 스냅샷(grid)만 통과하면 되므로 최소 형태로 둔다.
const REMOTE_PUZZLE: GeneratedPuzzle = {
  alias: "26090901",
  puzzleId: "26090901",
  slotId: "2026-09-09-h01",
  date: "2026-09-09",
  difficulty: "hard",
  gridSize: 5,
  grid: [
    ["가", "게", "", "", ""],
    ["", "", "", "", ""],
    ["", "", "", "", ""],
    ["", "", "", "", ""],
    ["", "", "", "", ""],
  ],
  entries: [
    { id: "a1", answer: "가게", clue: "물건을 파는 곳", direction: "across", row: 0, col: 0 },
    { id: "a2", answer: "가족", clue: "한 집안 사람", direction: "down", row: 0, col: 0 },
    { id: "a3", answer: "학교", clue: "배우는 곳", direction: "across", row: 2, col: 0 },
  ],
};

const REMOTE_MANIFEST = {
  generatedAt: "2026-09-08T15:12:00.000Z",
  keep: 14,
  diversityThresholds: {
    historyLimit: 7,
    maxSameDateSharedAnswers: 0,
    maxScaffoldSimilarity: 0.75,
    maxSharedAnswerRatio: 0.5,
  },
  puzzles: [
    {
      alias: REMOTE_PUZZLE.alias,
      puzzleId: REMOTE_PUZZLE.puzzleId,
      slotId: REMOTE_PUZZLE.slotId,
      date: REMOTE_PUZZLE.date,
      difficulty: "hard",
      path: `/puzzles/${REMOTE_PUZZLE.puzzleId}.json`,
      publishedAt: "2026-09-08T16:00:00.000Z",
    },
  ],
};

// 60일 전 easy 퍼즐. manifest(14판)에는 없지만 이력에는 남아 있어야 배제된다.
const OLD_HISTORY_ENTRY: AnswerHistoryEntry = {
  puzzleId: "26071100",
  slotId: "2026-07-11-h00",
  date: "2026-07-11",
  difficulty: "easy",
  answers: ["학생", "친구", "시간"],
};

const REMOTE_HISTORY: AnswerHistoryFile = {
  version: 1,
  updatedAt: "2026-09-08T15:12:00.000Z",
  retentionDays: 90,
  puzzles: [
    {
      puzzleId: REMOTE_PUZZLE.puzzleId,
      slotId: REMOTE_PUZZLE.slotId as string,
      date: REMOTE_PUZZLE.date,
      difficulty: "hard",
      answers: REMOTE_PUZZLE.entries.map((entry) => entry.answer),
    },
    OLD_HISTORY_ENTRY,
  ],
};

describe("answer-history 운영 계약 (생성기 CLI)", () => {
  it("연속 실행에서 이력을 쌓고, 전날 정답을 정확히 배제하며, 같은 슬롯 재실행은 idempotent 하다", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cw-answer-history-"));
    const outDir = path.join(root, "puzzles");
    const historyPath = path.join(outDir, "answer-history.json");

    try {
      // 1일차: 이력 파일이 없으니 빈 이력에서 시작해 1건을 쓴다.
      const day1 = await runGenerator(
        dayArgs(outDir, "2026-09-10", "2026-09-09T15:00:00.000Z", 1001),
      );
      assert.equal(day1.code, 0, day1.stdout + day1.stderr);
      assert.match(day1.stdout, /Answer history source=bootstrap entries=0/);

      const puzzle1 = await readJson<GeneratedPuzzle>(
        path.join(outDir, "26091000.json"),
      );
      const history1 = await readJson<AnswerHistoryFile>(historyPath);
      assert.equal(history1.version, 1);
      assert.equal(history1.retentionDays, 90);
      assert.equal(history1.puzzles.length, 1);
      assert.equal(history1.puzzles[0].puzzleId, puzzle1.puzzleId);
      assert.equal(history1.puzzles[0].difficulty, "easy");
      assert.deepEqual(
        new Set(history1.puzzles[0].answers),
        answersOf(puzzle1),
      );

      // 2일차: 로컬 이력을 읽어 1일차 정답을 정확 배제한다.
      const day2 = await runGenerator(
        dayArgs(outDir, "2026-09-11", "2026-09-10T15:00:00.000Z", 1002),
      );
      assert.equal(day2.code, 0, day2.stdout + day2.stderr);
      assert.match(day2.stdout, /Answer history source=local entries=1/);
      assert.match(
        day2.stdout,
        /recent answer gate .*historyExactPuzzles=1 excludedExact=(?!0 )\d+/,
      );

      const puzzle2 = await readJson<GeneratedPuzzle>(
        path.join(outDir, "26091100.json"),
      );
      assert.deepEqual(
        intersection(answersOf(puzzle2), answersOf(puzzle1)),
        [],
        "전날 정답이 그대로 다시 나오면 안 된다",
      );

      const history2 = await readJson<AnswerHistoryFile>(historyPath);
      assert.deepEqual(
        history2.puzzles.map((entry) => entry.puzzleId),
        [puzzle2.puzzleId, puzzle1.puzzleId],
        "최신이 앞에 오는 내림차순",
      );

      const report = await readJson<GenerationReport>(
        path.join(outDir, "generation-report.json"),
      );
      const selected = report.report.find((item) => item.alias === "26091100")
        ?.selected?.diversity;
      assert.ok(selected, "채택 후보의 diversity 리포트가 있어야 한다");
      assert.equal(selected.historyExactPuzzleCount, 1);
      assert.equal(selected.historyExactAnswerCount, answersOf(puzzle1).size);
      assert.ok(selected.historyExactExcludedWordCount >= 1);
      assert.equal(selected.historyFragmentPuzzleCount, 1);

      // 같은 슬롯 재실행: 자기 항목은 창에서 빠지고 identity 로 교체돼 2건을 유지한다.
      const rerun = await runGenerator(
        dayArgs(outDir, "2026-09-11", "2026-09-10T15:00:00.000Z", 1002),
      );
      assert.equal(rerun.code, 0, rerun.stdout + rerun.stderr);
      assert.match(rerun.stdout, /historyExactPuzzles=1 /);
      const history3 = await readJson<AnswerHistoryFile>(historyPath);
      assert.equal(history3.puzzles.length, 2);
      const rerunPuzzle = await readJson<GeneratedPuzzle>(
        path.join(outDir, "26091100.json"),
      );
      assert.deepEqual(
        new Set(history3.puzzles[0].answers),
        answersOf(rerunPuzzle),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("원격 이력을 캐시 우회로 읽어 manifest 밖(60일 전)·다른 난이도 정답까지 배제하고 이력을 보존한다", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cw-answer-history-remote-"));
    const outDir = path.join(root, "puzzles");
    const { server, baseUrl, requests } = await startFixtureServer({
      "/puzzles/manifest.json": { status: 200, body: REMOTE_MANIFEST },
      [`/puzzles/${REMOTE_PUZZLE.puzzleId}.json`]: {
        status: 200,
        body: REMOTE_PUZZLE,
      },
      "/puzzles/answer-history.json": { status: 200, body: REMOTE_HISTORY },
    });

    try {
      const result = await runGenerator(
        dayArgs(outDir, "2026-09-12", "2026-09-11T15:00:00.000Z", 1005, [
          `--appendManifestUrl=${baseUrl}/puzzles/manifest.json`,
          `--answerHistoryUrl=${baseUrl}/puzzles/answer-history.json`,
          `--hostingBaseUrl=${baseUrl}`,
        ]),
      );
      assert.equal(result.code, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /Answer history source=remote entries=2/);
      // 정확 배제 창(90일)에 어제 hard 와 60일 전 easy 가 함께 들어간다.
      assert.match(result.stdout, /historyExactPuzzles=2 /);
      // 어근 배제 창(14일)에는 어제 hard 만 들어간다.
      assert.match(result.stdout, /historyFragmentPuzzles=1 /);

      const historyRequest = requests.find((entry) =>
        entry.startsWith("/puzzles/answer-history.json"),
      );
      assert.ok(historyRequest, "원격 이력을 읽어야 한다");
      assert.match(historyRequest, /\?historyRead=/, "CDN 캐시 우회 쿼리");

      const puzzle = await readJson<GeneratedPuzzle>(
        path.join(outDir, "26091200.json"),
      );
      const excluded = new Set([
        ...REMOTE_PUZZLE.entries.map((entry) => entry.answer),
        ...OLD_HISTORY_ENTRY.answers,
      ]);
      assert.deepEqual(intersection(answersOf(puzzle), excluded), []);

      const history = await readJson<AnswerHistoryFile>(
        path.join(outDir, "answer-history.json"),
      );
      assert.deepEqual(
        history.puzzles.map((entry) => entry.puzzleId),
        [puzzle.puzzleId, REMOTE_PUZZLE.puzzleId, OLD_HISTORY_ENTRY.puzzleId],
        "새 퍼즐 + manifest 퍼즐 + 60일 전 항목을 모두 보존한다",
      );
    } finally {
      await closeServer(server);
      await rm(root, { recursive: true, force: true });
    }
  });

  it("원격 이력이 없으면(404) manifest 퍼즐로 bootstrap 하고, 서버 오류(500)면 실행을 실패시킨다", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cw-answer-history-fallback-"));
    const missingOutDir = path.join(root, "missing", "puzzles");
    const brokenOutDir = path.join(root, "broken", "puzzles");
    const missing = await startFixtureServer({
      "/puzzles/manifest.json": { status: 200, body: REMOTE_MANIFEST },
      [`/puzzles/${REMOTE_PUZZLE.puzzleId}.json`]: {
        status: 200,
        body: REMOTE_PUZZLE,
      },
    });
    const broken = await startFixtureServer({
      "/puzzles/manifest.json": { status: 200, body: REMOTE_MANIFEST },
      [`/puzzles/${REMOTE_PUZZLE.puzzleId}.json`]: {
        status: 200,
        body: REMOTE_PUZZLE,
      },
      "/puzzles/answer-history.json": {
        status: 500,
        body: { error: "boom" },
      },
    });

    try {
      const bootstrapped = await runGenerator(
        dayArgs(missingOutDir, "2026-09-12", "2026-09-11T15:00:00.000Z", 1008, [
          `--appendManifestUrl=${missing.baseUrl}/puzzles/manifest.json`,
          `--answerHistoryUrl=${missing.baseUrl}/puzzles/answer-history.json`,
          `--hostingBaseUrl=${missing.baseUrl}`,
        ]),
      );
      assert.equal(bootstrapped.code, 0, bootstrapped.stdout + bootstrapped.stderr);
      assert.match(
        bootstrapped.stdout,
        /Bootstrapped answer history from manifest puzzles=1/,
      );
      const history = await readJson<AnswerHistoryFile>(
        path.join(missingOutDir, "answer-history.json"),
      );
      assert.ok(
        history.puzzles.some((entry) => entry.puzzleId === REMOTE_PUZZLE.puzzleId),
        "manifest 퍼즐이 이력에 들어가야 한다",
      );

      const failed = await runGenerator(
        dayArgs(brokenOutDir, "2026-09-12", "2026-09-11T15:00:00.000Z", 1005, [
          `--appendManifestUrl=${broken.baseUrl}/puzzles/manifest.json`,
          `--answerHistoryUrl=${broken.baseUrl}/puzzles/answer-history.json`,
          `--hostingBaseUrl=${broken.baseUrl}`,
        ]),
      );
      assert.notEqual(failed.code, 0, "잘린 이력으로 덮어쓰지 않도록 실패해야 한다");
      assert.match(
        failed.stdout + failed.stderr,
        /Could not fetch .*answer-history\.json after 3 attempts/,
      );
    } finally {
      await closeServer(missing.server);
      await closeServer(broken.server);
      await rm(root, { recursive: true, force: true });
    }
  });
});
