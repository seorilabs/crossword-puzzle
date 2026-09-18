import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const repoRoot = new URL("../../../", import.meta.url);
const androidWorkflow = readFileSync(
  new URL(".github/workflows/deploy-google-play.yml", repoRoot),
  "utf8",
);
const androidAppBuildGradle = readFileSync(
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
  it("Android release 빌드는 리더보드 필수 값을 Gradle 경계에서 fail-closed한다", () => {
    assert.match(androidAppBuildGradle, /System\.getenv\("PLAY_GAMES_PROJECT_ID"\)/);
    assert.match(androidAppBuildGradle, /System\.getenv\("PLAY_GAMES_LEADERBOARD_ID"\)/);
    assert.match(androidAppBuildGradle, /releaseTaskRequested/);
    assert.match(
      androidAppBuildGradle,
      /PLAY_GAMES_PROJECT_ID and PLAY_GAMES_LEADERBOARD_ID are required for release builds/,
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

  it("native release workflow는 중앙 정본 main caller와 플랫폼별 실행 경계를 유지한다", () => {
    // 버전 정본은 중앙 release authority 하나이고, 서명 AAB는 x86 Cloud Build가 만든다.
    // ARC 러너(4608Mi cgroup)에서 RN 빌드를 돌리면 v1.1.9처럼 SIGKILL로 끝난다.
    // caller는 seorilabs/.github#179 이후 SHA를 박지 않고 중앙 정본 main을 본다.
    assert.match(
      androidWorkflow,
      /uses: seorilabs\/\.github\/\.github\/workflows\/resolve-release-version\.yml@main/,
    );
    assert.match(androidWorkflow, /ref:\s*[0-9a-f]{40}/);
    assert.match(androidWorkflow, /--config=cloudbuild-android\.yaml/);
    assert.match(androidWorkflow, /runs-on:\s*seorilabs-x64/);
    assert.doesNotMatch(androidWorkflow, /seorilabs-x64-android/);
    assert.match(
      androidWorkflow,
      /uses:\s*actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/,
    );
  });

  it("Google Play caller는 internal-only 업로드와 named secret 계약을 유지한다", () => {
    assert.match(androidWorkflow, /if:\s*\$\{\{ inputs\.upload_to_internal \}\}/);
    assert.match(androidWorkflow, /--track internal/);
    assert.doesNotMatch(androidWorkflow, /--track production|--promote/);
    // 업로드는 중앙 정본 스크립트로만 하고, 그 전에 AAB manifest readback으로 검증한다.
    assert.match(androidWorkflow, /scripts\/release\/verify-release-artifact\.mjs/);
    assert.match(androidWorkflow, /scripts\/release\/upload-google-play-aab\.py/);
    assert.match(androidWorkflow, /com\.seorilabs\.crosswordpuzzle/);
    for (const secret of [
      "FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64",
      "GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64",
      "GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD",
      "GOOGLE_PLAY_UPLOAD_KEY_PASSWORD",
    ]) {
      assert.match(androidWorkflow, new RegExp(`${secret}: \\$\\{\\{ secrets\\.${secret} \\}\\}`));
    }
    assert.doesNotMatch(androidWorkflow, /secrets:\s*inherit/);
  });

  it("운영 문서에 마켓별 리더보드 ID와 분리된 데이터 풀을 명시한다", () => {
    assert.match(strategy, /PLAY_GAMES_PROJECT_ID/);
    assert.match(strategy, /PLAY_GAMES_LEADERBOARD_ID/);
    assert.match(strategy, /GAME_CENTER_LEADERBOARD_ID/);
    assert.match(strategy, /데이터 풀은 서로 분리/);
  });
});
