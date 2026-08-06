import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const repoRoot = new URL("../../../", import.meta.url);
const androidWorkflow = readFileSync(
  new URL(".github/workflows/deploy-google-play.yml", repoRoot),
  "utf8",
);
const iosWorkflow = readFileSync(
  new URL(".github/workflows/deploy-app-store.yml", repoRoot),
  "utf8",
);
const strategy = readFileSync(
  new URL("docs/leaderboard-strategy.md", repoRoot),
  "utf8",
);

describe("네이티브 리더보드 배포 배선", () => {
  it("Android 필수 GitHub Variables를 AAB 빌드 전에 검증하고 주입한다", () => {
    assert.match(
      androidWorkflow,
      /PLAY_GAMES_PROJECT_ID:\s*\$\{\{ vars\.PLAY_GAMES_PROJECT_ID \}\}/,
    );
    assert.match(
      androidWorkflow,
      /PLAY_GAMES_LEADERBOARD_ID:\s*\$\{\{ vars\.PLAY_GAMES_LEADERBOARD_ID \}\}/,
    );
    assert.ok(
      androidWorkflow.includes(
        'if [ -z "${PLAY_GAMES_PROJECT_ID//[[:space:]]/}" ]; then',
      ),
    );
    assert.match(androidWorkflow, /exit 1/);
    assert.ok(
      androidWorkflow.indexOf("Validate Play Games leaderboard config") <
        androidWorkflow.indexOf("Build signed Android AAB"),
    );
  });

  it("iOS 필수 GitHub Variable과 Game Center profile을 archive 전에 검증한다", () => {
    assert.match(
      iosWorkflow,
      /GAME_CENTER_LEADERBOARD_ID:\s*\$\{\{ vars\.GAME_CENTER_LEADERBOARD_ID \}\}/,
    );
    assert.ok(
      iosWorkflow.includes(
        'if [ -z "${GAME_CENTER_LEADERBOARD_ID//[[:space:]]/}" ]; then',
      ),
    );
    assert.match(
      iosWorkflow,
      /App Store provisioning profile must include the Game Center entitlement/,
    );
    assert.ok(
      iosWorkflow.indexOf("Validate Game Center leaderboard config") <
        iosWorkflow.indexOf("Archive iOS app"),
    );
  });

  it("native release workflow는 공식 stable action과 플랫폼별 runner를 유지한다", () => {
    for (const workflow of [androidWorkflow, iosWorkflow]) {
      assert.match(workflow, /uses:\s*actions\/checkout@v7/);
      assert.match(workflow, /uses:\s*actions\/setup-node@v7/);
      assert.doesNotMatch(workflow, /actions\/(checkout|setup-node)@v6/);
    }
    assert.match(androidWorkflow, /runs-on:\s*ubuntu-latest/);
    assert.match(iosWorkflow, /runs-on:\s*macos-26/);
  });

  it("운영 문서에 마켓별 리더보드 ID와 분리된 데이터 풀을 명시한다", () => {
    assert.match(strategy, /PLAY_GAMES_PROJECT_ID/);
    assert.match(strategy, /PLAY_GAMES_LEADERBOARD_ID/);
    assert.match(strategy, /GAME_CENTER_LEADERBOARD_ID/);
    assert.match(strategy, /데이터 풀은 서로 분리/);
  });
});
