import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const HEALTH_SCRIPT = path.join(
  REPO_ROOT,
  "server/batch/check-puzzle-pack-health.mjs",
);
const SETUP_SCRIPT = path.join(
  REPO_ROOT,
  "scripts/setup-puzzle-pack-monitoring.sh",
);

function collectChildProcess(
  executable: string,
  args: string[],
): Promise<{ code: number | null; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
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

describe("published puzzle pack health CLI", () => {
  it("AC-5 오류 시 non-zero 종료와 severity ERROR용 stderr marker를 남긴다", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          diversityThresholds: {
            historyLimit: 7,
            maxSameDateSharedAnswers: 0,
            maxScaffoldSimilarity: 0.75,
            maxSharedAnswerRatio: 0.5,
          },
          puzzles: [],
        }),
      );
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address();
      if (address == null || typeof address === "string") {
        throw new Error("health test server did not expose a TCP port");
      }
      const result = await collectChildProcess(process.execPath, [
        HEALTH_SCRIPT,
        `--baseUrl=http://127.0.0.1:${address.port}`,
        "--date=2099-01-01",
      ]);

      assert.equal(result.code, 1);
      assert.match(result.stderr, /missing_difficulty/);
      assert.match(result.stderr, /\[puzzle-pack-health\] FAIL/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error == null ? resolve() : reject(error)));
      });
    }
  });

  it("AC-3 공개 puzzle의 격자 slot과 entry가 다르면 실패한다", async () => {
    const date = "2026-07-26";
    const createPuzzle = (
      difficulty: "easy" | "normal" | "hard",
      answer: string,
    ) => {
      const gridSize = difficulty === "easy" ? 5 : 8;
      const grid = Array.from({ length: gridSize }, () =>
        Array.from({ length: gridSize }, () => ""),
      );
      answer.split("").forEach((letter, index) => {
        grid[0][index] = letter;
      });

      return {
        puzzleId: `puzzle-${difficulty}`,
        date,
        difficulty,
        gridSize,
        grid,
        entries: [
          {
            id: `${difficulty}-1`,
            answer,
            clue: `${difficulty} clue`,
            direction: "across",
            row: 0,
            col: 0,
            generatedBy: "placed",
          },
        ],
        metrics: {},
      };
    };
    const puzzles = {
      "/puzzles/easy.json": createPuzzle("easy", "가나다"),
      "/puzzles/normal.json": createPuzzle("normal", "라마바"),
      "/puzzles/hard.json": createPuzzle("hard", "사아자"),
    };
    puzzles["/puzzles/normal.json"].grid[0][0] = "마";
    const manifest = {
      diversityThresholds: {
        historyLimit: 7,
        maxSameDateSharedAnswers: 0,
        maxScaffoldSimilarity: 0.75,
        maxSharedAnswerRatio: 0.5,
      },
      puzzles: Object.entries(puzzles).map(([puzzlePath, puzzle]) => ({
        date,
        difficulty: puzzle.difficulty,
        path: puzzlePath,
        puzzleId: puzzle.puzzleId,
      })),
    };
    const server = createServer((request, response) => {
      const requestPath = new URL(request.url ?? "/", "http://127.0.0.1")
        .pathname;
      const body =
        requestPath === "/puzzles/manifest.json"
          ? manifest
          : puzzles[requestPath as keyof typeof puzzles];
      response.writeHead(body == null ? 404 : 200, {
        "content-type": "application/json",
      });
      response.end(JSON.stringify(body ?? { error: "not found" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address();
      if (address == null || typeof address === "string") {
        throw new Error("health test server did not expose a TCP port");
      }
      const result = await collectChildProcess(process.execPath, [
        HEALTH_SCRIPT,
        `--baseUrl=http://127.0.0.1:${address.port}`,
        `--date=${date}`,
      ]);

      assert.equal(result.code, 1);
      assert.match(result.stderr, /structural_validation_failed/);
      assert.match(result.stderr, /puzzle-normal/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error == null ? resolve() : reject(error)));
      });
    }
  });
});

describe("puzzle pack monitoring setup", () => {
  it("AC-6 health Job과 00:30 Scheduler와 metric과 policy 생성 명령을 만든다", () => {
    const result = spawnSync(
      SETUP_SCRIPT,
      [
        "--project-id",
        "crossword-puzzle-79ae0",
        "--hosting-base-url",
        "https://crossword-puzzle-79ae0.web.app",
        "--dry-run",
      ],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /Health Scheduler:\s+crossword-puzzle-pack-health-daily \(30 0 \* \* \*, Asia\/Seoul\)/,
    );
    assert.match(
      result.stdout,
      /\+ gcloud run jobs create crossword-puzzle-pack-health /,
    );
    assert.match(
      result.stdout,
      /\+ gcloud logging metrics create crossword_puzzle_pack_job_error_count /,
    );
    assert.match(result.stdout, /\+ gcloud monitoring policies create /);
    assert.match(
      result.stdout,
      /projects\/crossword-puzzle-79ae0\/notificationChannels\/dry-run/,
    );
  });

  it("AC-1 AC-2 alert policy JSON과 metric filter를 검증하고 기존 리소스를 갱신한다", async () => {
    const testRoot = await mkdtemp(
      path.join(tmpdir(), "crossword-monitoring-test-"),
    );
    const fakeGcloud = path.join(testRoot, "gcloud");
    const callsPath = path.join(testRoot, "calls.log");
    const policyCapturePath = path.join(testRoot, "policy.json");

    await writeFile(
      fakeGcloud,
      `#!/usr/bin/env bash
if [ "$1" = "monitoring" ] && [ "$2" = "policies" ]; then
  policy_file=""
  previous=""
  for argument in "$@"; do
    if [ "$previous" = "--policy-from-file" ]; then
      policy_file="$argument"
      break
    fi
    previous="$argument"
  done
  node -e '
    const fs = require("node:fs");
    const policy = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const filter = policy.conditions[0].conditionThreshold.filter;
    const quote = String.fromCharCode(34);
    const expected = "metric.type=" + quote + "logging.googleapis.com/user/crossword_puzzle_pack_job_error_count" + quote + " AND resource.type=" + quote + "cloud_run_job" + quote;
    if (filter !== expected) {
      process.stderr.write("unexpected alert policy filter: " + filter);
      process.exit(2);
    }
    fs.writeFileSync(process.env.POLICY_CAPTURE_PATH, JSON.stringify({
      displayName: policy.displayName,
      filter,
    }));
  ' "$policy_file"
fi
printf '%s\n' "$*" >> "$GCLOUD_CALLS_PATH"
case "$*" in
  "projects describe "*)
    printf '123456789\n'
    ;;
  *"run jobs describe crossword-puzzle-pack-generator"*"containers[0].image"*)
    printf 'asia-northeast3-docker.pkg.dev/test/image:sha\n'
    ;;
  *"run jobs describe crossword-puzzle-pack-generator"*"serviceAccount"*)
    printf 'runtime@test.iam.gserviceaccount.com\n'
    ;;
  "monitoring policies list "*)
    printf 'projects/crossword-puzzle-79ae0/alertPolicies/existing\n'
    ;;
esac
`,
      { mode: 0o755 },
    );
    await chmod(fakeGcloud, 0o755);

    try {
      const result = spawnSync(
        SETUP_SCRIPT,
        [
          "--project-id",
          "crossword-puzzle-79ae0",
          "--hosting-base-url",
          "https://crossword-puzzle-79ae0.web.app",
          "--notification-channel",
          "projects/crossword-puzzle-79ae0/notificationChannels/existing",
        ],
        {
          cwd: REPO_ROOT,
          encoding: "utf8",
          env: {
            ...process.env,
            GCLOUD_CALLS_PATH: callsPath,
            POLICY_CAPTURE_PATH: policyCapturePath,
            PATH: `${testRoot}:${process.env.PATH ?? ""}`,
          },
        },
      );

      assert.equal(result.status, 0, result.stderr);
      const capturedPolicy = JSON.parse(
        await readFile(policyCapturePath, "utf8"),
      ) as { displayName: string; filter: string };
      assert.equal(
        capturedPolicy.displayName,
        "가로세로 낱말 퍼즐 일간팩 오류",
      );
      assert.equal(
        capturedPolicy.filter,
        'metric.type="logging.googleapis.com/user/crossword_puzzle_pack_job_error_count" AND resource.type="cloud_run_job"',
      );
      const calls = await readFile(callsPath, "utf8");
      assert.match(calls, /run jobs update crossword-puzzle-pack-health /);
      assert.match(
        calls,
        /scheduler jobs update http crossword-puzzle-pack-health-daily /,
      );
      assert.match(
        calls,
        /logging metrics update crossword_puzzle_pack_job_error_count /,
      );
      assert.match(
        calls,
        /monitoring policies update projects\/crossword-puzzle-79ae0\/alertPolicies\/existing /,
      );
    } finally {
      await rm(testRoot, { recursive: true, force: true });
    }
  });
});
