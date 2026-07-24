import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

// AC-3: `tsc --noEmit -p tsconfig.app.json`이 에러 0으로 통과하는지 직접 검증한다.
// tsc를 실제로 실행해 종료 코드 0(=타입 에러 0개)을 assert 한다.
const repoRoot = new URL("../../../", import.meta.url);
const packageJson = JSON.parse(
  readFileSync(new URL("package.json", repoRoot), "utf8"),
) as { scripts: Record<string, string> };

describe("AC-3: 앱 타입체크가 에러 0으로 통과한다", () => {
  it("typecheck 스크립트가 tsc --noEmit -p tsconfig.app.json 이다", () => {
    assert.equal(
      packageJson.scripts.typecheck,
      "tsc --noEmit -p tsconfig.app.json",
    );
  });

  it(
    "tsc --noEmit -p tsconfig.app.json 실행 결과가 에러 0(exit 0)이다",
    { timeout: 180000 },
    () => {
      const tscBinary = fileURLToPath(
        new URL("node_modules/.bin/tsc", repoRoot),
      );
      const result = spawnSync(
        tscBinary,
        ["--noEmit", "-p", "tsconfig.app.json"],
        { cwd: fileURLToPath(repoRoot), encoding: "utf8" },
      );
      assert.equal(
        result.status,
        0,
        `tsc가 에러 0으로 통과하지 못했습니다:\n${result.stdout ?? ""}${
          result.stderr ?? ""
        }`,
      );
    },
  );
});
