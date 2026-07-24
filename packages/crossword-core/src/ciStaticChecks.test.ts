import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

// CI 정적 게이트 설정 자체를 검증한다. 워크플로 파일과 package.json 스크립트가
// 인수조건이 요구하는 명령을 실제로 실행하도록 유지하는지 회귀 방지한다.
// (CI 설정은 유닛 테스트 대상이 아니므로, 설정 파일 내용에 대한 assertion으로
//  각 인수조건을 자동 검증한다.)
const repoRoot = new URL("../../../", import.meta.url);
const workflow = readFileSync(
  new URL(".github/workflows/static-checks.yml", repoRoot),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(new URL("package.json", repoRoot), "utf8"),
) as { scripts: Record<string, string> };

describe("CI static-checks 워크플로 설정", () => {
  it("AC-1: 워크플로가 npm run typecheck(tsc --noEmit)를 실행한다", () => {
    assert.match(workflow, /npm run typecheck/);
  });

  it("AC-2: 워크플로가 npm run test:components(웹 컴포넌트 테스트)를 실행한다", () => {
    assert.match(workflow, /npm run test:components/);
  });

  it(
    "AC-3: tsc --noEmit -p tsconfig.app.json이 에러 0으로 통과한다",
    { timeout: 180000 },
    () => {
      // 스크립트가 지정 명령인지 확인하고, 실제로 실행해 에러 0(exit 0)을 검증한다.
      assert.equal(
        packageJson.scripts.typecheck,
        "tsc --noEmit -p tsconfig.app.json",
      );
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
        `tsc 에러:\n${result.stdout ?? ""}${result.stderr ?? ""}`,
      );
    },
  );
});
