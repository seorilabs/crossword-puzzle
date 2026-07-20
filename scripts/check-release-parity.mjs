#!/usr/bin/env node
import { readFileSync } from "node:fs";

const sharedPolicyPath = "packages/crossword-core/src/uiPolicy.ts";
const sharedLaunchConfigPath = "packages/crossword-core/src/launchConfig.ts";
const sharedPlatformContractsPath =
  "packages/crossword-core/src/platformContracts.ts";
const sharedIndexPath = "packages/crossword-core/src/index.ts";
const webAppPath = "src/App.tsx";
const mobileAppPath = "apps/mobile/App.tsx";
const mobileAppTestPath = "apps/mobile/__tests__/App.test.tsx";
const launchConfigPath = "src/adapters/launchConfig.ts";
const webTelemetryPath = "src/adapters/telemetry.ts";
const mobileFirebaseClientPath = "apps/mobile/firebaseClient.ts";
const mobileTelemetryPath = "apps/mobile/telemetry.ts";
const mobileAdsPath = "apps/mobile/mobileAds.ts";
const mobileAppJsonPath = "apps/mobile/app.json";
const androidBuildGradlePath = "apps/mobile/android/build.gradle";
const androidAppBuildGradlePath = "apps/mobile/android/app/build.gradle";
const androidManifestPath =
  "apps/mobile/android/app/src/main/AndroidManifest.xml";
const appDelegatePath =
  "apps/mobile/ios/CrosswordPuzzleMobile/AppDelegate.swift";
const mobilePodfilePath = "apps/mobile/ios/Podfile";
const mobilePackagePath = "apps/mobile/package.json";
const gitignorePath = ".gitignore";
const staticChecksWorkflowPath = ".github/workflows/static-checks.yml";
const deployAllWorkflowPath = ".github/workflows/deploy-all.yml";
const deployGooglePlayWorkflowPath = ".github/workflows/deploy-google-play.yml";
const deployAppStoreWorkflowPath = ".github/workflows/deploy-app-store.yml";
const appStoreLocalBuildPath = "scripts/app-store-local-build.sh";
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
  "getBonusPuzzleCandidateSummary",
  "getDailyFreePuzzleSummaries",
  "getDailyFreePuzzleSummary",
  "getPuzzlePackAlias",
  "sortPuzzleSummariesByRecency",
  "uniquePuzzleSummaries",
];

const requiredWebImports = [
  "DAILY_ATTEMPT_LIMIT",
  "createPuzzleSummary",
  "getBonusPuzzleCandidateSummary",
  "getDailyFreePuzzleSummaries",
  "getDailyFreePuzzleSummary",
  "getPuzzlePackAlias",
  "sortPuzzleSummariesByRecency",
  "uniquePuzzleSummaries",
];

const requiredMobileImports = [
  "DAILY_ATTEMPT_LIMIT",
  "createPuzzleSummary",
  "defaultLaunchConfig",
  "getBonusPuzzleCandidateSummary",
  "getDailyFreePuzzleSummaries",
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
  "getBonusPuzzleCandidateSummary",
  "getDailyFreePuzzleSummaries",
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
const sharedPlatformContracts = read(sharedPlatformContractsPath);
const sharedIndex = read(sharedIndexPath);
const webApp = read(webAppPath);
const mobileApp = read(mobileAppPath);
const mobileAppTest = read(mobileAppTestPath);

// Feature parity: user-facing features must exist in BOTH the web and mobile
// App.tsx, not just in shared logic. These markers guard against regressions
// like v0.3.63, where the answer input toggle shipped to web (src/App.tsx) but
// was missing from mobile (apps/mobile/App.tsx).
const featureParityMarkers = ["answerInputMode", "selectAnswerInputMode"];
for (const marker of featureParityMarkers) {
  assertIncludes(webApp, marker, webAppPath);
  assertIncludes(mobileApp, marker, mobileAppPath);
}
const launchConfig = read(launchConfigPath);
const webTelemetry = read(webTelemetryPath);
const mobileFirebaseClient = read(mobileFirebaseClientPath);
const mobileTelemetry = read(mobileTelemetryPath);
const mobileAds = read(mobileAdsPath);
const mobileAppJson = read(mobileAppJsonPath);
const androidBuildGradle = read(androidBuildGradlePath);
const androidAppBuildGradle = read(androidAppBuildGradlePath);
const androidManifest = read(androidManifestPath);
const appDelegate = read(appDelegatePath);
const mobilePodfile = read(mobilePodfilePath);
const mobilePackage = read(mobilePackagePath);
const gitignore = read(gitignorePath);
const staticChecksWorkflow = read(staticChecksWorkflowPath);
const deployAllWorkflow = read(deployAllWorkflowPath);
const deployGooglePlayWorkflow = read(deployGooglePlayWorkflowPath);
const deployAppStoreWorkflow = read(deployAppStoreWorkflowPath);
const appStoreLocalBuild = read(appStoreLocalBuildPath);
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
  [sharedPlatformContractsPath, sharedPlatformContracts],
  [sharedIndexPath, sharedIndex],
]) {
  assertNotIncludes(content, "@apps-in-toss", path);
  assertNotIncludes(content, "@react-native-firebase", path);
  assertNotIncludes(content, "react-native", path);
  assertNotIncludes(content, "firebase/", path);
}

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
  deployAppStoreWorkflow,
  "GADApplicationIdentifier",
  deployAppStoreWorkflowPath,
);
assertIncludes(
  deployAppStoreWorkflow,
  "SKAdNetworkItems:0:SKAdNetworkIdentifier",
  deployAppStoreWorkflowPath,
);
assertIncludes(mobileAds, "initializeMobileAds", mobileAdsPath);
assertIncludes(mobileAds, "showRewardedAd", mobileAdsPath);
assertIncludes(mobileAds, "showInterstitialAd", mobileAdsPath);
assertIncludes(mobileAds, "requestNonPersonalizedAdsOnly: true", mobileAdsPath);
assertIncludes(mobileAds, "setRequestConfiguration", mobileAdsPath);
assertIncludes(mobileApp, "showRewardedAd", mobileAppPath);
assertNotIncludes(mobileApp, "showInterstitialAd", mobileAppPath);
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
  deployGooglePlayWorkflow,
  "node scripts/restore-mobile-firebase-config.mjs --android --require",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployAppStoreWorkflow,
  "node scripts/restore-mobile-firebase-config.mjs --ios --require",
  deployAppStoreWorkflowPath,
);
assertIncludes(
  deployAppStoreWorkflow,
  "FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64",
  deployAppStoreWorkflowPath,
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
