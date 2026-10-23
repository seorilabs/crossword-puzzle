import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const workflow = readFileSync(
  new URL("../.github/workflows/deploy-google-play.yml", import.meta.url),
  "utf8",
);

function runnerFor(jobId, isPrivate) {
  const block = workflow.match(
    new RegExp(`^  ${jobId}:\\n([\\s\\S]*?)(?=^  [\\w-]+:|$(?![\\s\\S]))`, "m"),
  )?.[1];
  assert.ok(block, `missing job ${jobId}`);
  const scalar = block.match(/^    runs-on:\s*(.+)$/m)?.[1].trim();
  assert.ok(scalar, `missing runner ${jobId}`);
  if (!scalar.startsWith("${{")) return scalar;
  assert.ok(scalar.endsWith("}}"));
  // The real workflow expression uses GitHub's boolean and string &&/|| subset,
  // which has the same behavior in JavaScript for a boolean repository.private.
  return runInNewContext(
    scalar.slice(3, -2),
    {
      github: { event: { repository: { private: isPrivate } } },
    },
    { timeout: 100 },
  );
}

for (const jobId of ["build-aab", "upload"]) {
  test(`${jobId}: 공개 저장소는 허용된 GitHub-hosted 러너에서 시작한다`, () => {
    assert.equal(runnerFor(jobId, false), "ubuntu-latest");
  });
  test(`${jobId}: 비공개 저장소는 기존 ARC를 유지한다`, () => {
    assert.equal(runnerFor(jobId, true), "seorilabs-x64");
  });
}
