import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  UNKNOWN_RELEASE_VERSION,
  resolveReleaseVersion,
} from "./releaseVersion.ts";

// 앱인토스 빌드 환경변수 주입(#406)의 인수조건 검증.
//
// build_command는 중앙 재사용 워크플로가 `set -euo pipefail` 뒤 그대로 실행한다.
// 셸 변수 할당은 export하지 않으면 자식 프로세스(vite) 환경에 들어가지 않는다.
// 그 상태로 배포되면 퍼즐 팩 주소가 비어 번들 내장 폴백 팩이 나가고
// release_version이 package.json 기본값으로 떨어지는데, 빌드도 배포도 성공으로
// 보이기 때문에 정적 검사로만 잡을 수 있다.
const repoRoot = new URL("../../../", import.meta.url);
const deployWorkflow = readFileSync(
  new URL(".github/workflows/deploy-apps-in-toss.yml", repoRoot),
  "utf8",
);

const REQUIRED_VITE_VARS = [
  "VITE_PUZZLE_PACK_BASE_URL",
  "VITE_RETURN_REMINDER_TEMPLATE_CODE",
  "VITE_APP_VERSION",
  "VITE_RELEASE_TAG",
] as const;

function readBuildCommand(workflow: string): string {
  const start = workflow.indexOf("build_command: |");
  assert.notEqual(start, -1, "build_command 블록이 있어야 한다");
  const lines = workflow.slice(start).split("\n").slice(1);
  const body: string[] = [];
  for (const line of lines) {
    // 블록 스칼라는 첫 줄 들여쓰기보다 얕아지면 끝난다.
    if (line.trim() !== "" && !line.startsWith("        ")) break;
    body.push(line);
  }
  return body.join("\n");
}

const buildCommand = readBuildCommand(deployWorkflow);

describe("앱인토스 빌드 환경변수 주입 (#406)", () => {
  it("AC-1: 필수 VITE 변수를 모두 export로 빌드 프로세스에 전달한다", () => {
    for (const name of REQUIRED_VITE_VARS) {
      assert.match(
        buildCommand,
        new RegExp(`^\\s*export ${name}=`, "m"),
        `${name}을 export로 전달해야 한다`,
      );
    }
  });

  it("AC-4: build_command 안의 비-export VITE 할당을 회귀로 잡는다", () => {
    const bare = buildCommand
      .split("\n")
      .filter((line) => /^\s*VITE_[A-Z0-9_]+=/.test(line));
    assert.deepEqual(
      bare,
      [],
      `export 없는 VITE 할당은 vite에 전달되지 않는다: ${bare.join(" / ")}`,
    );
  });

  it("AC-2: 퍼즐 팩 주소와 템플릿 코드가 비면 빌드를 실패시킨다", () => {
    assert.ok(
      buildCommand.includes('if [ -z "${puzzle_pack_base_url//[[:space:]]/}" ]'),
      "공백 제거 후 빈 퍼즐 팩 주소를 검증해야 한다",
    );
    assert.match(buildCommand, /::error::PUZZLE_PACK_BASE_URL/);
    assert.ok(
      buildCommand.includes('if [ -z "${template_code//[[:space:]]/}" ]'),
      "공백 제거 후 빈 템플릿 코드를 검증해야 한다",
    );
    assert.match(buildCommand, /::error::RETURN_REMINDER_TEMPLATE_CODE/);
  });

  it("AC-3: release_version이 태그 주입값 없이 폴백하는 경우를 고정한다", () => {
    // 주입이 비면 패키지 유래 상수로, 그것마저 없으면 UNKNOWN으로 떨어진다.
    // 이 폴백 자체는 정상 동작이라 배포 경로에서 막아야 한다.
    assert.equal(resolveReleaseVersion(undefined, undefined, "0.1.0"), "0.1.0");
    assert.equal(
      resolveReleaseVersion(undefined, undefined, undefined),
      UNKNOWN_RELEASE_VERSION,
    );
    assert.equal(resolveReleaseVersion("1.1.10", "v1.1.10", "0.1.0"), "1.1.10");
    // 배포 경로는 두 값이 비면 빌드를 멈춘다.
    assert.match(buildCommand, /::error::SEORI_RELEASE_VERSION\/SEORI_RELEASE_TAG/);
  });
});
