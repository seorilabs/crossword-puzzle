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
const androidBuild = readFileSync(
  new URL("apps/mobile/android/app/build.gradle", repoRoot),
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
  it("Android는 중앙 caller가 전달하는 Play Games 공개 바인딩을 Gradle에서 소비한다", () => {
    assert.match(
      androidBuild,
      /System\.getenv\("PLAY_GAMES_PROJECT_ID"\)/,
    );
    assert.match(
      androidBuild,
      /System\.getenv\("PLAY_GAMES_LEADERBOARD_ID"\)/,
    );
    assert.match(
      androidBuild,
      /project\.findProperty\("PLAY_GAMES_PROJECT_ID"\)/,
    );
    assert.match(
      androidBuild,
      /project\.findProperty\("PLAY_GAMES_LEADERBOARD_ID"\)/,
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
    assert.match(xcodeCloudPostBuild, /exit 1/);
  });

  it("Xcode Cloud도 실제 Game Center 리더보드 ID를 기본 build setting으로 사용한다", () => {
    const expected =
      "GAME_CENTER_LEADERBOARD_ID = com.seorilabs.crosswordpuzzle.global_score;";
    assert.equal(iosProject.split(expected).length - 1, 2);
  });

  it("Google Play caller는 중앙 exact-SHA workflow와 stable tag build-only 계약을 유지한다", () => {
    assert.match(
      androidWorkflow,
      /uses:\s*seorilabs\/\.github\/\.github\/workflows\/rn-deploy-google-play\.yml@c8db7834f6b72198a898f699b6f91e3a185fc7f5/,
    );
    assert.match(androidWorkflow, /tags:\s*\n\s*- "v\*\.\*\.\*"/);
    assert.match(
      androidWorkflow,
      /upload:\s*\$\{\{ github\.event_name != 'push' && inputs\.upload_to_internal \}\}/,
    );
    assert.match(
      androidWorkflow,
      /package_name:\s*com\.seorilabs\.crosswordpuzzle/,
    );
    assert.match(androidWorkflow, /track:\s*internal/);
    assert.doesNotMatch(androidWorkflow, /secrets:\s*inherit/);
    assert.doesNotMatch(androidWorkflow, /gcloud builds submit/);
    assert.doesNotMatch(androidWorkflow, /scripts\/resolve-release-version/);
    assert.doesNotMatch(androidWorkflow, /scripts\/upload-google-play-internal/);
  });

  it("App Store caller는 exact source만 Xcode Cloud에 전달하고 macOS runner를 사용하지 않는다", () => {
    assert.match(
      iosWorkflow,
      /uses:\s*seorilabs\/\.github\/\.github\/workflows\/resolve-release-version\.yml@c8db7834f6b72198a898f699b6f91e3a185fc7f5/,
    );
    assert.match(iosWorkflow, /runs-on:\s*seorilabs-rpi-arm64/);
    assert.match(
      iosWorkflow,
      /ref:\s*\$\{\{ needs\.resolve\.outputs\.source_sha \}\}/,
    );
    assert.match(
      iosWorkflow,
      /--tag "\$\{\{ needs\.resolve\.outputs\.tag \}\}"/,
    );
    assert.match(iosWorkflow, /actions\/checkout@[0-9a-f]{40}/);
    assert.match(iosWorkflow, /actions\/setup-node@[0-9a-f]{40}/);
    assert.doesNotMatch(iosWorkflow, /runs-on:\s*macos/);
    assert.doesNotMatch(iosWorkflow, /secrets:\s*inherit/);
  });

  it("로컬 workflow에 uploader를 이중 구현하지 않는다", () => {
    assert.doesNotMatch(androidWorkflow, /\n\s{2}upload:\n/);
    assert.doesNotMatch(androidWorkflow, /runs-on:/);
    assert.doesNotMatch(androidWorkflow, /actions\/checkout@/);
    assert.doesNotMatch(androidWorkflow, /actions\/setup-node@/);
    assert.doesNotMatch(androidWorkflow, /--track\s+production|--promote/);
  });

  it("운영 문서에 마켓별 리더보드 ID와 분리된 데이터 풀을 명시한다", () => {
    assert.match(strategy, /PLAY_GAMES_PROJECT_ID/);
    assert.match(strategy, /PLAY_GAMES_LEADERBOARD_ID/);
    assert.match(strategy, /GAME_CENTER_LEADERBOARD_ID/);
    assert.match(strategy, /데이터 풀은 서로 분리/);
  });
});
