#!/usr/bin/env node
import { readFileSync } from "node:fs";

const sharedPolicyPath = "packages/crossword-core/src/uiPolicy.ts";
const sharedLaunchConfigPath = "packages/crossword-core/src/launchConfig.ts";
const sharedRecommendationPath =
  "packages/crossword-core/src/recommendation.ts";
const sharedPlatformContractsPath =
  "packages/crossword-core/src/platformContracts.ts";
const sharedPlatformAuthPath = "packages/crossword-core/src/platformAuth.ts";
const sharedIndexPath = "packages/crossword-core/src/index.ts";
const rootPackagePath = "package.json";
const webAppPath = "src/App.tsx";
const webMainPath = "src/main.tsx";
const webPlatformAuthPath = "src/adapters/platformAuth.ts";
const mobileAppPath = "apps/mobile/App.tsx";
const mobileIndexPath = "apps/mobile/index.js";
const mobilePlatformAuthPath = "apps/mobile/platformAuth.ts";
const mobileAppTestPath = "apps/mobile/__tests__/App.test.tsx";
const launchConfigPath = "src/adapters/launchConfig.ts";
const webTelemetryPath = "src/adapters/telemetry.ts";
const mobileFirebaseClientPath = "apps/mobile/firebaseClient.ts";
const mobileTelemetryPath = "apps/mobile/telemetry.ts";
const mobileAdsPath = "apps/mobile/mobileAds.ts";
const mobileLeaderboardAdapterPath = "apps/mobile/leaderboardAdapter.ts";
const mobileLeaderboardSpecPath = "apps/mobile/specs/NativeLeaderboard.ts";
const mobileAppJsonPath = "apps/mobile/app.json";
const androidBuildGradlePath = "apps/mobile/android/build.gradle";
const androidAppBuildGradlePath = "apps/mobile/android/app/build.gradle";
const androidManifestPath =
  "apps/mobile/android/app/src/main/AndroidManifest.xml";
const androidMainApplicationPath =
  "apps/mobile/android/app/src/main/java/com/seorilabs/crosswordpuzzle/MainApplication.kt";
const androidLeaderboardModulePath =
  "apps/mobile/android/app/src/main/java/com/seorilabs/crosswordpuzzle/NativeLeaderboardModule.kt";
const appDelegatePath =
  "apps/mobile/ios/CrosswordPuzzleMobile/AppDelegate.swift";
const iosLeaderboardModulePath =
  "apps/mobile/ios/CrosswordPuzzleMobile/RCTNativeLeaderboard.mm";
const iosLeaderboardEntitlementsPath =
  "apps/mobile/ios/CrosswordPuzzleMobile/CrosswordPuzzleMobile.entitlements";
const iosInfoPlistPath = "apps/mobile/ios/CrosswordPuzzleMobile/Info.plist";
const mobilePodfilePath = "apps/mobile/ios/Podfile";
const mobilePackagePath = "apps/mobile/package.json";
const gitignorePath = ".gitignore";
const staticChecksWorkflowPath = ".github/workflows/static-checks.yml";
const deployAllWorkflowPath = ".github/workflows/deploy-all.yml";
const deployAppsInTossWorkflowPath =
  ".github/workflows/deploy-apps-in-toss.yml";
const deployGooglePlayWorkflowPath = ".github/workflows/deploy-google-play.yml";
const deployAppStoreWorkflowPath = ".github/workflows/deploy-app-store.yml";
const androidBuildEnvPath = "build.env";
const androidCloudBuildPath = "cloudbuild-android.yaml";
const androidBuildScriptPath = "scripts/build-android.sh";
const appStoreLocalBuildPath = "scripts/app-store-local-build.sh";
const xcodeCloudPostClonePath = "apps/mobile/ios/ci_scripts/ci_post_clone.sh";
const xcodeCloudPreBuildPath =
  "apps/mobile/ios/ci_scripts/ci_pre_xcodebuild.sh";
const xcodeCloudPostBuildPath =
  "apps/mobile/ios/ci_scripts/ci_post_xcodebuild.sh";
const agentsPath = "AGENTS.md";
const marketParityDocPath = "docs/market-parity.md";
const playStoreConfigPath = "play-store/google-play.config.json";
const appStoreConfigPath = "app-store/app-store.config.json";

const sharedPolicyExports = [
  "DAILY_ATTEMPT_LIMIT",
  "DEFAULT_HINT_CREDITS",
  "DEFAULT_VISIBLE_PUZZLE_COUNT",
  "PUZZLE_GENERATION_INTERVAL_HOURS",
  "PUZZLE_KEEP_COUNT",
  "createPuzzleSummary",
  "getDailyFreePuzzleSummary",
  "getPuzzlePackAlias",
  "sortPuzzleSummariesByRecency",
  "uniquePuzzleSummaries",
];

const requiredWebImports = [
  "DAILY_ATTEMPT_LIMIT",
  "createPuzzleSummary",
  "getDailyFreePuzzleSummary",
  "getPuzzlePackAlias",
  "sortPuzzleSummariesByRecency",
  "uniquePuzzleSummaries",
];

const requiredMobileImports = [
  "DAILY_ATTEMPT_LIMIT",
  "createPuzzleSummary",
  "defaultLaunchConfig",
  "getDailyFreePuzzleSummary",
  "getPuzzlePackAlias",
  "sortPuzzleSummariesByRecency",
  "uniquePuzzleSummaries",
];

const forbiddenLocalDefinitions = [
  "DAILY_ATTEMPT_LIMIT",
  "DEFAULT_HINT_CREDITS",
  "DEFAULT_VISIBLE_PUZZLE_COUNT",
  "PUZZLE_GENERATION_INTERVAL_HOURS",
  "PUZZLE_KEEP_COUNT",
  "createPuzzleSummary",
  "getDailyFreePuzzleSummary",
  "getPuzzlePackAlias",
  "sortPuzzleSummariesByRecency",
  "uniquePuzzleSummaries",
];

const sharedLaunchConfigExports = [
  "clampInteger",
  "defaultLaunchConfig",
  "getLaunchConfigDefaultsForRemoteConfig",
  "launchConfigKeys",
  "normalizeLaunchConfig",
];

const failures = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`${path}: unable to read file (${message})`);
    return "";
  }
}

function fail(message) {
  failures.push(message);
}

function assertIncludes(content, needle, label) {
  if (!content.includes(needle)) {
    fail(`${label}: missing ${needle}`);
  }
}

function assertNotIncludes(content, needle, label) {
  if (content.includes(needle)) {
    fail(`${label}: must not include ${needle}`);
  }
}

function assertMatches(content, pattern, label, description) {
  if (!pattern.test(content)) {
    fail(`${label}: missing ${description}`);
  }
}

function assertNotMatches(content, pattern, label, description) {
  if (pattern.test(content)) {
    fail(`${label}: must not include ${description}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removedPermissionPattern(permission) {
  return new RegExp(
    `<uses-permission\\b(?=[^>]*${escapeRegExp(
      permission,
    )})(?=[^>]*tools:node="remove")[^>]*/>`,
    "s",
  );
}

function assertNamedPolicyExport(content, name, path) {
  const exportPattern = new RegExp(`export\\s+(const|function)\\s+${name}\\b`);

  if (!exportPattern.test(content)) {
    fail(`${path}: missing named export ${name}`);
  }
}

function extractNamedImports(content, importPath) {
  const importPattern = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*["']${escapeRegExp(importPath)}["']`,
    "g",
  );
  const importedNames = new Set();
  let importCount = 0;
  let match;

  while ((match = importPattern.exec(content)) != null) {
    importCount += 1;

    for (const specifier of match[1].split(",")) {
      const importedName = specifier
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
        ?.trim();

      if (importedName != null && importedName.length > 0) {
        importedNames.add(importedName);
      }
    }
  }

  return { importCount, importedNames };
}

function assertImported(content, names, path, coreImportPath) {
  const { importCount, importedNames } = extractNamedImports(
    content,
    coreImportPath,
  );

  if (importCount === 0) {
    fail(`${path}: missing named import from ${coreImportPath}`);
  }

  for (const name of names) {
    if (!importedNames.has(name)) {
      fail(`${path}: missing ${name} import from ${coreImportPath}`);
    }
  }
}

function assertNoLocalDefinitions(content, names, path) {
  for (const name of names) {
    const definitionPattern = new RegExp(
      `(const|let|var|function)\\s+${name}\\b`,
    );

    if (definitionPattern.test(content)) {
      fail(`${path}: ${name} must come from crossword-core uiPolicy`);
    }
  }
}

const sharedPolicy = read(sharedPolicyPath);
const sharedLaunchConfig = read(sharedLaunchConfigPath);
const sharedRecommendation = read(sharedRecommendationPath);
const sharedPlatformContracts = read(sharedPlatformContractsPath);
const sharedPlatformAuth = read(sharedPlatformAuthPath);
const sharedIndex = read(sharedIndexPath);
const rootPackage = read(rootPackagePath);
const webApp = read(webAppPath);
const webMain = read(webMainPath);
const webPlatformAuth = read(webPlatformAuthPath);
const mobileApp = read(mobileAppPath);
const mobileIndex = read(mobileIndexPath);
const mobilePlatformAuth = read(mobilePlatformAuthPath);
const mobileAppTest = read(mobileAppTestPath);

// Feature parity: user-facing features must exist in BOTH the web and mobile
// App.tsx, not just in shared logic. These markers guard against regressions
// like v0.3.63, where the answer input toggle shipped to web (src/App.tsx) but
// was missing from mobile (apps/mobile/App.tsx).
const featureParityMarkers = [
  "answerInputMode",
  "selectAnswerInputMode",
  "getNextRecommendedPuzzleSummary",
  "onboardingDifficultyRampEnabled",
  "buildNextPuzzleCtaEvent",
  "result_overlay",
  "runRewardedHintAdFlow",
  "pickHintCellIndex",
  "retry:",
  "selectedPuzzleScaffold",
  "computeLeaderboardScore",
  "leaderboardVisible",
];
for (const marker of featureParityMarkers) {
  assertIncludes(webApp, marker, webAppPath);
  assertIncludes(mobileApp, marker, mobileAppPath);
}
const launchConfig = read(launchConfigPath);
const webTelemetry = read(webTelemetryPath);
const mobileFirebaseClient = read(mobileFirebaseClientPath);
const mobileTelemetry = read(mobileTelemetryPath);
const mobileAds = read(mobileAdsPath);
const mobileLeaderboardAdapter = read(mobileLeaderboardAdapterPath);
const mobileLeaderboardSpec = read(mobileLeaderboardSpecPath);
const mobileAppJson = read(mobileAppJsonPath);
const androidBuildGradle = read(androidBuildGradlePath);
const androidAppBuildGradle = read(androidAppBuildGradlePath);
const androidManifest = read(androidManifestPath);
const androidMainApplication = read(androidMainApplicationPath);
const androidLeaderboardModule = read(androidLeaderboardModulePath);
const appDelegate = read(appDelegatePath);
const iosLeaderboardModule = read(iosLeaderboardModulePath);
const iosLeaderboardEntitlements = read(iosLeaderboardEntitlementsPath);
const iosInfoPlist = read(iosInfoPlistPath);
const mobilePodfile = read(mobilePodfilePath);
const mobilePackage = read(mobilePackagePath);
const gitignore = read(gitignorePath);
const staticChecksWorkflow = read(staticChecksWorkflowPath);
const deployAllWorkflow = read(deployAllWorkflowPath);
const deployAppsInTossWorkflow = read(deployAppsInTossWorkflowPath);
const deployGooglePlayWorkflow = read(deployGooglePlayWorkflowPath);
const deployAppStoreWorkflow = read(deployAppStoreWorkflowPath);
const androidBuildEnv = read(androidBuildEnvPath);
const androidCloudBuild = read(androidCloudBuildPath);
const androidBuildScript = read(androidBuildScriptPath);
const appStoreLocalBuild = read(appStoreLocalBuildPath);
const xcodeCloudPostClone = read(xcodeCloudPostClonePath);
const xcodeCloudPreBuild = read(xcodeCloudPreBuildPath);
const xcodeCloudPostBuild = read(xcodeCloudPostBuildPath);
const agents = read(agentsPath);
const marketParityDoc = read(marketParityDocPath);
const playStoreConfig = read(playStoreConfigPath);
const appStoreConfig = read(appStoreConfigPath);

for (const name of sharedPolicyExports) {
  assertNamedPolicyExport(sharedPolicy, name, sharedPolicyPath);
}

for (const name of sharedLaunchConfigExports) {
  assertNamedPolicyExport(sharedLaunchConfig, name, sharedLaunchConfigPath);
}

assertIncludes(sharedIndex, 'export * from "./uiPolicy";', sharedIndexPath);
assertIncludes(sharedIndex, 'export * from "./launchConfig";', sharedIndexPath);
assertIncludes(
  sharedIndex,
  'export * from "./platformContracts";',
  sharedIndexPath,
);
assertIncludes(sharedIndex, 'export * from "./platformAuth";', sharedIndexPath);
assertImported(
  webApp,
  requiredWebImports,
  webAppPath,
  "../packages/crossword-core/src",
);
assertImported(
  mobileApp,
  requiredMobileImports,
  mobileAppPath,
  "../../packages/crossword-core/src",
);
assertMatches(
  webApp,
  /getNextRecommendedPuzzleSummary\(\s*puzzleSummaries,\s*getCompletedPuzzleIds\(dateCardStates\),\s*current,\s*\{\s*onboardingRampEnabled\s*\}/,
  webAppPath,
  "shared onboarding recommendation policy call",
);
assertMatches(
  mobileApp,
  /getNextRecommendedPuzzleSummary\([\s\S]*?onboardingRampEnabled:\s*launchConfig\.onboardingDifficultyRampEnabled/,
  mobileAppPath,
  "shared onboarding recommendation policy call",
);
assertIncludes(
  launchConfig,
  'export * from "../../packages/crossword-core/src/launchConfig";',
  launchConfigPath,
);
assertImported(
  webTelemetry,
  ["compactTelemetryParams"],
  webTelemetryPath,
  "../../packages/crossword-core/src",
);
assertImported(
  mobileFirebaseClient,
  [
    "defaultLaunchConfig",
    "getLaunchConfigDefaultsForRemoteConfig",
    "launchConfigKeys",
    "normalizeLaunchConfig",
  ],
  mobileFirebaseClientPath,
  "../../packages/crossword-core/src",
);
assertImported(
  mobileTelemetry,
  ["compactTelemetryParams"],
  mobileTelemetryPath,
  "../../packages/crossword-core/src",
);
assertNoLocalDefinitions(webApp, forbiddenLocalDefinitions, webAppPath);
assertNoLocalDefinitions(mobileApp, forbiddenLocalDefinitions, mobileAppPath);

for (const [path, content] of [
  [sharedPolicyPath, sharedPolicy],
  [sharedLaunchConfigPath, sharedLaunchConfig],
  [sharedRecommendationPath, sharedRecommendation],
  [sharedPlatformContractsPath, sharedPlatformContracts],
  [sharedPlatformAuthPath, sharedPlatformAuth],
  [sharedIndexPath, sharedIndex],
]) {
  assertNotIncludes(content, "@apps-in-toss", path);
  assertNotIncludes(content, "@react-native-firebase", path);
  assertNotIncludes(content, "react-native", path);
  assertNotIncludes(content, "firebase/", path);
  assertNotIncludes(content, "@seorilabs/platform-sdk", path);
}

// Platform 인증 정책은 core에 한 벌만 두고, 각 표면은 같은 app_id로 SDK/Firebase
// adapter를 제공한다. 렌더와 병렬로 시작해야 인증 장애가 플레이를 막지 않는다.
assertIncludes(
  rootPackage,
  '"@seorilabs/platform-sdk": "0.3.0"',
  rootPackagePath,
);
assertIncludes(
  mobilePackage,
  '"@seorilabs/platform-sdk": "0.3.0"',
  mobilePackagePath,
);
assertIncludes(
  mobilePackage,
  '"@react-native-firebase/auth":',
  mobilePackagePath,
);
for (const [path, content] of [
  [webPlatformAuthPath, webPlatformAuth],
  [mobilePlatformAuthPath, mobilePlatformAuth],
]) {
  assertIncludes(content, "createPlatform", path);
  assertIncludes(content, "PLATFORM_AUTH_APP_ID", path);
  assertIncludes(content, ".identity.firebaseCustomToken", path);
  assertIncludes(content, ".signIn(", path);
  assertIncludes(content, "signInPromise ??= runPlatformAuth()", path);
}
assertIncludes(webMain, "void ensurePlatformAuth();", webMainPath);
assertIncludes(mobileIndex, "void ensurePlatformAuth();", mobileIndexPath);

assertIncludes(
  mobilePackage,
  '"@react-native-firebase/app":',
  mobilePackagePath,
);
assertIncludes(
  mobilePackage,
  '"@react-native-firebase/analytics":',
  mobilePackagePath,
);
assertIncludes(
  mobilePackage,
  '"@react-native-firebase/remote-config":',
  mobilePackagePath,
);
assertIncludes(
  mobilePackage,
  '"react-native-google-mobile-ads":',
  mobilePackagePath,
);
assertIncludes(
  mobilePackage,
  '"name": "NativeLeaderboardSpec"',
  mobilePackagePath,
);
assertIncludes(
  mobilePackage,
  '"NativeLeaderboard": "RCTNativeLeaderboard"',
  mobilePackagePath,
);
assertIncludes(
  mobileAppJson,
  '"react-native-google-mobile-ads"',
  mobileAppJsonPath,
);
assertIncludes(
  mobileAppJson,
  '"android_app_id": "ca-app-pub-2444587584524186~5456766418"',
  mobileAppJsonPath,
);
assertIncludes(
  mobileAppJson,
  '"ios_app_id": "ca-app-pub-2444587584524186~4715406099"',
  mobileAppJsonPath,
);
assertIncludes(mobileAppJson, '"sk_ad_network_items":', mobileAppJsonPath);
assertIncludes(mobileAppJson, '"cstr6suwn9.skadnetwork"', mobileAppJsonPath);
assertIncludes(
  appStoreLocalBuild,
  "GADApplicationIdentifier",
  appStoreLocalBuildPath,
);
assertIncludes(
  appStoreLocalBuild,
  "SKAdNetworkItems:0:SKAdNetworkIdentifier",
  appStoreLocalBuildPath,
);
assertIncludes(
  xcodeCloudPostBuild,
  "GADApplicationIdentifier",
  xcodeCloudPostBuildPath,
);
assertIncludes(
  xcodeCloudPostBuild,
  "SKAdNetworkItems:0:SKAdNetworkIdentifier",
  xcodeCloudPostBuildPath,
);
assertIncludes(mobileAds, "initializeMobileAds", mobileAdsPath);
assertIncludes(mobileAds, "showRewardedAd", mobileAdsPath);
assertIncludes(mobileAds, "showInterstitialAd", mobileAdsPath);
assertIncludes(mobileAds, "requestNonPersonalizedAdsOnly: true", mobileAdsPath);
assertIncludes(mobileAds, "setRequestConfiguration", mobileAdsPath);
assertIncludes(mobileApp, "showRewardedAd", mobileAppPath);
assertNotIncludes(mobileApp, "showInterstitialAd", mobileAppPath);
assertIncludes(
  mobileLeaderboardAdapter,
  "createNativeLeaderboardAdapter",
  mobileLeaderboardAdapterPath,
);
assertNotIncludes(
  mobileLeaderboardAdapter,
  "supported: false",
  mobileLeaderboardAdapterPath,
);
assertIncludes(
  mobileLeaderboardSpec,
  "TurboModuleRegistry.get<Spec>('NativeLeaderboard')",
  mobileLeaderboardSpecPath,
);
assertIncludes(mobileApp, "shouldSubmitLeaderboardScore", mobileAppPath);
assertIncludes(mobileApp, "computeLeaderboardScore", mobileAppPath);
assertIncludes(mobileApp, ">순위 보기</Text>", mobileAppPath);
assertIncludes(
  mobileApp,
  "const HOME_HEADER_TITLE = '가로세로 낱말 퍼즐';",
  mobileAppPath,
);
assertNotMatches(
  mobileApp,
  /HOME_HEADER_TITLE[\s\S]{0,240}Platform\.OS\s*===\s*["']ios["']/,
  mobileAppPath,
  "iOS-only mobile home title branch",
);
assertIncludes(
  mobileApp,
  "export const BOARD_TEXT_INPUT_REFOCUS_DELAY_MS",
  mobileAppPath,
);
assertNotMatches(
  mobileApp,
  /platformOS\s*===\s*["']android["']\s*&&\s*!keyboardVisible/,
  mobileAppPath,
  "Android-only stale board input refocus",
);
assertIncludes(
  mobileAppTest,
  "formats mobile home puzzle labels without exposing remote ids",
  mobileAppTestPath,
);
assertIncludes(mobileAppTest, "platformOS: 'ios'", mobileAppTestPath);
assertIncludes(
  mobileAppTest,
  "BOARD_TEXT_INPUT_REFOCUS_DELAY_MS",
  mobileAppTestPath,
);
assertNotIncludes(webApp, "showResultInterstitialAd", webAppPath);
assertIncludes(
  androidBuildGradle,
  'classpath("com.google.gms:google-services:4.4.4")',
  androidBuildGradlePath,
);
assertIncludes(
  androidAppBuildGradle,
  'apply plugin: "com.google.gms.google-services"',
  androidAppBuildGradlePath,
);
assertIncludes(
  androidAppBuildGradle,
  "Missing apps/mobile/android/app/google-services.json",
  androidAppBuildGradlePath,
);
assertIncludes(
  androidAppBuildGradle,
  "com.google.android.gms:play-services-games-v2:22.0.0",
  androidAppBuildGradlePath,
);
assertIncludes(
  androidAppBuildGradle,
  "PLAY_GAMES_LEADERBOARD_ID",
  androidAppBuildGradlePath,
);
assertIncludes(
  androidMainApplication,
  "PlayGamesSdk.initialize(this)",
  androidMainApplicationPath,
);
assertIncludes(
  androidLeaderboardModule,
  "submitScoreImmediate",
  androidLeaderboardModulePath,
);
assertIncludes(
  androidLeaderboardModule,
  "getLeaderboardIntent",
  androidLeaderboardModulePath,
);
assertIncludes(
  androidManifest,
  'android:name="com.google.android.gms.permission.AD_ID"',
  androidManifestPath,
);
assertNotMatches(
  androidManifest,
  removedPermissionPattern("com.google.android.gms.permission.AD_ID"),
  androidManifestPath,
  "AD_ID permission removal",
);
assertMatches(
  androidManifest,
  removedPermissionPattern("android.permission.ACCESS_ADSERVICES_ATTRIBUTION"),
  androidManifestPath,
  "ACCESS_ADSERVICES_ATTRIBUTION permission removal",
);
assertMatches(
  androidManifest,
  removedPermissionPattern("android.permission.ACCESS_ADSERVICES_AD_ID"),
  androidManifestPath,
  "ACCESS_ADSERVICES_AD_ID permission removal",
);
assertMatches(
  androidManifest,
  removedPermissionPattern("android.permission.ACCESS_ADSERVICES_TOPICS"),
  androidManifestPath,
  "ACCESS_ADSERVICES_TOPICS permission removal",
);
assertIncludes(
  androidManifest,
  'android:name="com.google.android.gms.ads.APPLICATION_ID"',
  androidManifestPath,
);
assertIncludes(
  androidManifest,
  "ca-app-pub-2444587584524186~5456766418",
  androidManifestPath,
);
assertIncludes(appDelegate, "import Firebase", appDelegatePath);
assertIncludes(appDelegate, "FirebaseApp.configure()", appDelegatePath);
assertIncludes(
  iosLeaderboardModule,
  "[GKLeaderboard submitScore",
  iosLeaderboardModulePath,
);
assertIncludes(
  iosLeaderboardModule,
  "GKGameCenterViewController",
  iosLeaderboardModulePath,
);
assertIncludes(
  iosLeaderboardEntitlements,
  "com.apple.developer.game-center",
  iosLeaderboardEntitlementsPath,
);
assertIncludes(
  iosInfoPlist,
  "GameCenterLeaderboardIdentifier",
  iosInfoPlistPath,
);
assertIncludes(
  mobilePodfile,
  "$RNFirebaseAsStaticFramework = true",
  mobilePodfilePath,
);
assertIncludes(
  mobilePodfile,
  "$RNFirebaseAnalyticsWithoutAdIdSupport = true",
  mobilePodfilePath,
);
assertIncludes(
  mobilePodfile,
  "$RNGoogleMobileAdsAsStaticFramework = true",
  mobilePodfilePath,
);
assertIncludes(mobilePodfile, "ENV['RCT_USE_RN_DEP'] = '0'", mobilePodfilePath);
assertIncludes(
  mobilePodfile,
  "ENV['RCT_USE_PREBUILT_RNCORE'] = '0'",
  mobilePodfilePath,
);
assertIncludes(
  mobilePodfile,
  "CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES",
  mobilePodfilePath,
);
assertIncludes(
  gitignore,
  "apps/mobile/android/app/google-services.json",
  gitignorePath,
);
assertIncludes(
  gitignore,
  "apps/mobile/ios/CrosswordPuzzleMobile/GoogleService-Info.plist",
  gitignorePath,
);
assertIncludes(
  staticChecksWorkflow,
  "npm run check:release-parity",
  staticChecksWorkflowPath,
);
assertIncludes(staticChecksWorkflow, "npm run build", staticChecksWorkflowPath);
assertIncludes(
  staticChecksWorkflow,
  "npm run check:mobile",
  staticChecksWorkflowPath,
);
assertIncludes(
  staticChecksWorkflow,
  "npm_registry_url: https://npm.pkg.github.com",
  staticChecksWorkflowPath,
);
assertIncludes(
  staticChecksWorkflow,
  'npm_scope: "@seorilabs"',
  staticChecksWorkflowPath,
);
// Reusable workflows cannot elevate permissions granted by their caller. AIT와
// Google Play 배포가 private package를 설치하므로 Deploy All도 read 권한을 연다.
assertIncludes(deployAllWorkflow, "packages: read", deployAllWorkflowPath);
assertIncludes(
  deployAppsInTossWorkflow,
  "packages: read",
  deployAppsInTossWorkflowPath,
);
assertIncludes(
  deployAppsInTossWorkflow,
  "registry-url: https://npm.pkg.github.com",
  deployAppsInTossWorkflowPath,
);
assertIncludes(
  deployAppsInTossWorkflow,
  'scope: "@seorilabs"',
  deployAppsInTossWorkflowPath,
);
assertIncludes(
  deployAppsInTossWorkflow,
  "NODE_AUTH_TOKEN: ${{ github.token }}",
  deployAppsInTossWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "packages: read",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "GITHUB_PACKAGES_TOKEN: ${{ github.token }}",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  androidBuildScript,
  "//npm.pkg.github.com/:_authToken=",
  androidBuildScriptPath,
);
assertIncludes(
  androidBuildScript,
  "node scripts/restore-mobile-firebase-config.mjs --android --require",
  androidBuildScriptPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "PLAY_GAMES_PROJECT_ID",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "PLAY_GAMES_LEADERBOARD_ID",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "runs-on: seorilabs-rpi-arm64",
  deployGooglePlayWorkflowPath,
);
assertNotIncludes(
  deployGooglePlayWorkflow,
  "runs-on: ubuntu-latest",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "gcloud builds submit",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "gcloud config set billing/quota_project seorilabs-ci",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "gcloud storage rm --recursive",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  'gcloud storage rm --recursive "$ARTIFACT_BUCKET"',
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "actions/download-artifact@v8",
  deployGooglePlayWorkflowPath,
);
const googlePlayToolingCheckoutCount = (
  deployGooglePlayWorkflow.match(/ref:\s*\$\{\{ github\.sha \}\}/g) ?? []
).length;
if (googlePlayToolingCheckoutCount !== 2) {
  fail(
    `${deployGooglePlayWorkflowPath}: build와 upload는 모두 현재 workflow tooling SHA를 checkout해야 합니다.`,
  );
}
assertIncludes(
  androidBuildEnv,
  "ANDROID_BUILDER_TAG=node24-jdk17-android36",
  androidBuildEnvPath,
);
assertIncludes(
  androidCloudBuild,
  "name: ${_ANDROID_BUILDER_IMAGE}:${_ANDROID_BUILDER_TAG}",
  androidCloudBuildPath,
);
assertIncludes(
  androidBuildScript,
  ":app:bundleRelease",
  androidBuildScriptPath,
);
assertIncludes(
  androidBuildScript,
  "EXPECTED_PLAY_UPLOAD_CERT_SHA256",
  androidBuildScriptPath,
);
assertIncludes(
  androidBuildScript,
  "jarsigner -verify -strict",
  androidBuildScriptPath,
);
assertIncludes(
  xcodeCloudPostClone,
  "GoogleService-Info.plist",
  xcodeCloudPostClonePath,
);
assertIncludes(
  xcodeCloudPostClone,
  "FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64",
  xcodeCloudPostClonePath,
);
assertIncludes(
  xcodeCloudPostClone,
  "GITHUB_PACKAGES_TOKEN",
  xcodeCloudPostClonePath,
);
assertIncludes(
  xcodeCloudPostClone,
  "//npm.pkg.github.com/:_authToken=",
  xcodeCloudPostClonePath,
);
assertIncludes(
  xcodeCloudPostBuild,
  "GameCenterLeaderboardIdentifier",
  xcodeCloudPostBuildPath,
);
assertIncludes(
  xcodeCloudPostBuild,
  "com.seorilabs.crosswordpuzzle.global_score",
  xcodeCloudPostBuildPath,
);
// 태그 → 버전 반영은 Xcode Cloud pre-build가 하고, 실제 아카이브에 들어갔는지는
// post-build가 확인한다. 둘 중 하나만 있으면 버전이 조용히 어긋난다.
assertIncludes(
  xcodeCloudPreBuild,
  "scripts/resolve-release-version.mjs",
  xcodeCloudPreBuildPath,
);
assertIncludes(
  xcodeCloudPostBuild,
  "CFBundleShortVersionString",
  xcodeCloudPostBuildPath,
);
assertIncludes(xcodeCloudPostBuild, "CFBundleVersion", xcodeCloudPostBuildPath);
// App Store archive는 Xcode Cloud가 담당한다. GitHub Actions 경로가 macOS runner로
// 되돌아가면(회귀) 여기서 막는다.
assertIncludes(
  deployAppStoreWorkflow,
  "scripts/trigger-xcode-cloud-build.mjs",
  deployAppStoreWorkflowPath,
);
assertIncludes(
  deployAppStoreWorkflow,
  "runs-on: seorilabs-rpi-arm64",
  deployAppStoreWorkflowPath,
);
assertNotIncludes(deployAppStoreWorkflow, "macos-", deployAppStoreWorkflowPath);
for (const [path, content] of [
  [deployGooglePlayWorkflowPath, deployGooglePlayWorkflow],
  [deployAppStoreWorkflowPath, deployAppStoreWorkflow],
]) {
  assertIncludes(content, "actions/checkout@v7", path);
  assertIncludes(content, "actions/setup-node@v7", path);
}
assertIncludes(
  appStoreLocalBuild,
  "GAME_CENTER_LEADERBOARD_ID",
  appStoreLocalBuildPath,
);
assertIncludes(agents, "3마켓 패리티", agentsPath);
assertIncludes(agents, "packages/crossword-core", agentsPath);
assertIncludes(marketParityDoc, "AppsInToss", marketParityDocPath);
assertIncludes(marketParityDoc, "Google Play", marketParityDocPath);
assertIncludes(marketParityDoc, "App Store", marketParityDocPath);
assertIncludes(marketParityDoc, "packages/crossword-core", marketParityDocPath);
assertIncludes(playStoreConfig, '"ads": "yes"', playStoreConfigPath);
assertIncludes(
  playStoreConfig,
  "react-native-google-mobile-ads",
  playStoreConfigPath,
);
assertIncludes(appStoreConfig, '"ads": "yes"', appStoreConfigPath);
assertIncludes(
  appStoreConfig,
  "react-native-google-mobile-ads",
  appStoreConfigPath,
);

const deployAllResolvedTagUsages =
  deployAllWorkflow.match(
    /release_tag:\s*\${{ needs\.resolve\.outputs\.tag }}/g,
  )?.length ?? 0;

if (deployAllResolvedTagUsages < 3) {
  fail(
    `${deployAllWorkflowPath}: Deploy All must pass the resolved tag to AIT, Google Play, and App Store jobs`,
  );
}

if (failures.length > 0) {
  console.error("Release parity check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Release parity check passed.");
