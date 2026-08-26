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
const iosProject = readFileSync(
  new URL(
    "apps/mobile/ios/CrosswordPuzzleMobile.xcodeproj/project.pbxproj",
    repoRoot,
  ),
  "utf8",
);
const xcodeCloudPostBuild = readFileSync(
  new URL("apps/mobile/ios/ci_scripts/ci_post_xcodebuild.sh", repoRoot),
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
    assert.match(
      androidWorkflow,
      /required=\([\s\S]*PLAY_GAMES_PROJECT_ID[\s\S]*PLAY_GAMES_LEADERBOARD_ID[\s\S]*\)/,
    );
    assert.match(androidWorkflow, /exit 1/);
    assert.ok(
      androidWorkflow.indexOf("Validate build configuration") <
        androidWorkflow.indexOf("Build signed Android AAB on Cloud Build"),
    );
  });

  // iOS archive는 Xcode Cloud가 만든다. 리더보드 ID가 실제로 아카이브에 들어갔는지는
  // GitHub Actions가 볼 수 없으므로, 검증 책임도 Xcode Cloud 훅으로 함께 옮겼다.
  it("iOS는 Game Center 리더보드 ID를 아카이브 산출물에서 업로드 전에 검증한다", () => {
    assert.match(xcodeCloudPostBuild, /GameCenterLeaderboardIdentifier/);
    assert.match(
      xcodeCloudPostBuild,
      /com\.seorilabs\.crosswordpuzzle\.global_score/,
    );
    assert.ok(
      xcodeCloudPostBuild.indexOf("GameCenterLeaderboardIdentifier") <
        xcodeCloudPostBuild.indexOf("아카이브 산출물 검증 완료"),
    );
    // 값이 어긋나면 경고로 넘기지 않고 빌드를 실패시켜야 한다.
    assert.match(xcodeCloudPostBuild, /exit 1/);
  });

  it("Xcode Cloud도 실제 Game Center 리더보드 ID를 기본 build setting으로 사용한다", () => {
    const expected =
      "GAME_CENTER_LEADERBOARD_ID = com.seorilabs.crosswordpuzzle.global_score;";
    assert.equal(iosProject.split(expected).length - 1, 2);
  });

  it("native release workflow는 공식 stable action과 플랫폼별 runner를 유지한다", () => {
    for (const workflow of [androidWorkflow, iosWorkflow]) {
      assert.match(workflow, /uses:\s*actions\/checkout@v7/);
      assert.match(workflow, /uses:\s*actions\/setup-node@v7/);
      assert.doesNotMatch(workflow, /actions\/(checkout|setup-node)@v6/);
    }
    assert.equal(
      (androidWorkflow.match(/runs-on:\s*seorilabs-rpi-arm64/g) ?? []).length,
      2,
    );
    assert.equal(
      (androidWorkflow.match(/ref:\s*\$\{\{ github\.sha \}\}/g) ?? []).length,
      2,
    );
    assert.match(androidWorkflow, /gcloud builds submit/);
    assert.doesNotMatch(androidWorkflow, /runs-on:\s*ubuntu-latest/);
    // Apple archive/업로드는 Xcode Cloud가 한다. macOS runner로 되돌아가면 실패시킨다.
    assert.match(iosWorkflow, /runs-on:\s*seorilabs-rpi-arm64/);
    assert.doesNotMatch(iosWorkflow, /runs-on:\s*macos/);
  });

  it("Google Play upload job은 현재 tooling과 internal-only 계약을 유지한다", () => {
    const uploadJobStart = androidWorkflow.indexOf("\n  upload:\n");
    assert.notEqual(uploadJobStart, -1);
    const uploadJob = androidWorkflow.slice(uploadJobStart);

    assert.match(
      uploadJob,
      /- name: Checkout release tooling[\s\S]*?ref:\s*\$\{\{ github\.sha \}\}/,
    );
    assert.match(
      uploadJob,
      /name:\s*\$\{\{ needs\.build-aab\.outputs\.artifact_name \}\}/,
    );
    assert.match(
      uploadJob,
      /EXPECTED_VERSION_CODE:\s*\$\{\{ needs\.build-aab\.outputs\.android_version_code \}\}/,
    );
    assert.match(
      uploadJob,
      /--expected-version-code "\$EXPECTED_VERSION_CODE"/,
    );
    assert.match(uploadJob, /--track internal/);
    assert.doesNotMatch(uploadJob, /--track\s+production|--promote/);
  });

  it("운영 문서에 마켓별 리더보드 ID와 분리된 데이터 풀을 명시한다", () => {
    assert.match(strategy, /PLAY_GAMES_PROJECT_ID/);
    assert.match(strategy, /PLAY_GAMES_LEADERBOARD_ID/);
    assert.match(strategy, /GAME_CENTER_LEADERBOARD_ID/);
    assert.match(strategy, /데이터 풀은 서로 분리/);
  });
});
