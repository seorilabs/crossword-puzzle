import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const setup = (options = []) =>
  execFileSync(
    "/bin/bash",
    [
      "scripts/setup-puzzle-pack-cloud-run-job.sh",
      "--project-id",
      "qa-project",
      "--firebase-hosting-site",
      "qa-site",
      "--dry-run",
      ...options,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

test("단일 판은 명시적으로 선택하며 다음 자정 전에 준비한다", () => {
  const legacy = setup();
  assert.match(legacy, /5 0 \* \* \*/);
  assert.doesNotMatch(legacy, /PUZZLE_SINGLE_DAILY_FROM_DATE/);
  const single = setup(["--single-daily-from", "2026-11-01"]);
  assert.match(single, /0 23 \* \* \*/);
  assert.match(single, /PUZZLE_SINGLE_DAILY_FROM_DATE=2026-11-01/);
  assert.match(
    setup(["--single-daily-from", "2026-11-01", "--schedule", "30 22 * * *"]),
    /30 22 \* \* \*/,
  );
});

test("존재하지 않는 전환 날짜는 외부 명령 전에 거부한다", () => {
  for (const date of ["2026-02-30", "invalid", ""]) {
    assert.throws(
      () => setup(["--single-daily-from", date]),
      (error) => {
        assert.match(error.stderr, /valid YYYY-MM-DD/);
        assert.equal(error.stdout, "");
        return true;
      },
    );
  }
});
