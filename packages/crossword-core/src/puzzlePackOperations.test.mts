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
  it("exits non-zero and emits an ERROR-severity stderr marker for a missing daily pack", async () => {
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
});

describe("puzzle pack monitoring setup", () => {
  it("dry-run contains the health job, 00:30 scheduler, metric, policy, and notification channel", () => {
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

  it("updates every existing monitoring resource idempotently", async () => {
    const testRoot = await mkdtemp(
      path.join(tmpdir(), "crossword-monitoring-test-"),
    );
    const fakeGcloud = path.join(testRoot, "gcloud");
    const callsPath = path.join(testRoot, "calls.log");

    await writeFile(
      fakeGcloud,
      `#!/usr/bin/env bash
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
            PATH: `${testRoot}:${process.env.PATH ?? ""}`,
          },
        },
      );

      assert.equal(result.status, 0, result.stderr);
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
