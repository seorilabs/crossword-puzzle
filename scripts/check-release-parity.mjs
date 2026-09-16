#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";

const sharedPolicyPath = "packages/crossword-core/src/uiPolicy.ts";
const sharedLaunchConfigPath = "packages/crossword-core/src/launchConfig.ts";
const sharedRecommendationPath =
  "packages/crossword-core/src/recommendation.ts";
const sharedPlatformContractsPath =
  "packages/crossword-core/src/platformContracts.ts";
const sharedPlatformAuthPath = "packages/crossword-core/src/platformAuth.ts";
const sharedPlatformPresencePath =
  "packages/crossword-core/src/platformPresence.ts";
const sharedPuzzleIdentifiersPath =
  "packages/crossword-core/src/puzzleIdentifiers.ts";
const sharedIndexPath = "packages/crossword-core/src/index.ts";
const rootPackagePath = "package.json";
const webAppPath = "src/App.tsx";
const webMainPath = "src/main.tsx";
const webPlatformAuthPath = "src/adapters/platformAuth.ts";
const webPuzzleRepositoryPath = "src/adapters/staticPuzzleRepository.ts";
const mobileAppPath = "apps/mobile/App.tsx";
const webShareHookPath = "src/useShareResult.ts";
const mobileShareResultPath = "apps/mobile/shareResult.ts";
const mobileGameplayTelemetryPath = "apps/mobile/gameplayTelemetry.ts";
const mobileStuckHintPromptPath = "apps/mobile/useStuckHintPrompt.ts";
const mobileIndexPath = "apps/mobile/index.js";
const mobilePlatformAuthPath = "apps/mobile/platformAuth.ts";
const mobileReturnReminderPath = "apps/mobile/mobileReturnReminder.ts";
const mobileReturnReminderNotificationsPath =
  "apps/mobile/returnReminderNotifications.ts";
const mobileAppTestPath = "apps/mobile/__tests__/App.test.tsx";
const launchConfigPath = "src/adapters/launchConfig.ts";
const webFirebaseClientPath = "src/adapters/firebaseClient.ts";
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
const rootLockPath = "package-lock.json";
const mobileLockPath = "apps/mobile/package-lock.json";
const pnpmLockPath = "pnpm-lock.yaml";
const gitignorePath = ".gitignore";
const staticChecksWorkflowPath = ".github/workflows/static-checks.yml";
const deployAllWorkflowPath = ".github/workflows/deploy-all.yml";
const deployAppsInTossWorkflowPath =
  ".github/workflows/deploy-apps-in-toss.yml";
const deployGooglePlayWorkflowPath = ".github/workflows/deploy-google-play.yml";
const promoteGooglePlayWorkflowPath = ".github/workflows/promote-google-play.yml";
const androidBuildEnvPath = "build.env";
const androidCloudBuildConfigPath = "cloudbuild-android.yaml";
const androidCloudBuildScriptPath = "scripts/build-android.sh";
const googlePlayUploadScriptPath = "scripts/upload-google-play-internal.py";
const appStoreLocalBuildPath = "scripts/app-store-local-build.sh";
const xcodeCloudPostClonePath = "apps/mobile/ios/ci_scripts/ci_post_clone.sh";
const xcodeCloudPreBuildPath =
  "apps/mobile/ios/ci_scripts/ci_pre_xcodebuild.sh";
const xcodeCloudPostBuildPath =
  "apps/mobile/ios/ci_scripts/ci_post_xcodebuild.sh";
const agentsPath = "AGENTS.md";
const marketParityDocPath = "docs/market-parity.md";
const remoteConfigTemplatePath = "remoteconfig.template.json";
const playStoreConfigPath = "play-store/google-play.config.json";
const appStoreConfigPath = "app-store/app-store.config.json";
const retryExhaustionSqlPath = "scripts/analytics/retry-exhaustion-dropoff.sql";
const easyServingSqlPath = "scripts/analytics/easy-serving-verification.sql";

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

const platformSdkVersion = "0.5.0";

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

function assertLockPinsPlatformSdk(lockPath) {
  let lock;

  try {
    lock = JSON.parse(read(lockPath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`${lockPath}: unable to parse lockfile (${message})`);
    return;
  }

  const entry = lock.packages?.["node_modules/@seorilabs/platform-sdk"];

  if (!entry) {
    fail(`${lockPath}: missing @seorilabs/platform-sdk entry`);
    return;
  }

  if (entry.version !== platformSdkVersion) {
    fail(
      `${lockPath}: @seorilabs/platform-sdk must resolve to ${platformSdkVersion}, found ${entry.version}`,
    );
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
const sharedPlatformPresence = read(sharedPlatformPresencePath);
const sharedIndex = read(sharedIndexPath);
const rootPackage = read(rootPackagePath);
const webApp = read(webAppPath);
const webMain = read(webMainPath);
const webPlatformAuth = read(webPlatformAuthPath);
const mobileApp = read(mobileAppPath);
const mobileGameplayTelemetry = read(mobileGameplayTelemetryPath);
const mobileStuckHintPrompt = read(mobileStuckHintPromptPath);
const mobileIndex = read(mobileIndexPath);
const mobilePlatformAuth = read(mobilePlatformAuthPath);
const mobileAppTest = read(mobileAppTestPath);
const sharedPuzzleIdentifiers = read(sharedPuzzleIdentifiersPath);
const webPuzzleRepository = read(webPuzzleRepositoryPath);

// Feature parity: user-facing features must exist in BOTH the web and mobile
// App.tsx, not just in shared logic. These markers guard against regressions
// like v0.3.63, where the answer input toggle shipped to web (src/App.tsx) but
// was missing from mobile (apps/mobile/App.tsx).
const featureParityMarkers = [
  "answerInputMode",
  "selectAnswerInputMode",
  "buildDailyLadder",
  "buildDailyLadderCtaParams",
  "buildWeeklyStreakStrip",
  "startLadderStep",
  "formatStreakStripHeadline",
  "formatReturnReminderPrepromptBody",
  "computePersonalStats",
  "buildStreakCalendarWeeks",
  "emitProgressionScreenView",
  "emitStreakMilestoneIfReached",
  "getCompletionAchievements",
  "getProgressMilestoneRewardMessage",
  "isNewBestTime",
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
// 기록 열기 계측: 웹은 컴포넌트(완료 다이얼로그·기록 카드)에서, RN 은 App.tsx 에서 발화한다.
for (const [path, source] of [
  ["src/components/CompletionCelebrationDialog.tsx", "completion_dialog"],
  ["src/components/MissionHistoryCard.tsx", "home_card"],
]) {
  assertIncludes(read(path), `telemetry.click("history_open", { source: "${source}" })`, path);
  assertIncludes(mobileApp, `telemetry.click('history_open', { source: '${source}' })`, mobileAppPath);
}
for (const eventName of ["game_progress", "puzzle_progress"]) {
  assertIncludes(webApp, eventName, webAppPath);
  assertIncludes(mobileApp, eventName, mobileAppPath);
}
for (const eventName of ["game_puzzle_abandon", "puzzle_abandon"]) {
  assertIncludes(webApp, eventName, webAppPath);
  assertIncludes(
    mobileGameplayTelemetry,
    eventName,
    mobileGameplayTelemetryPath,
  );
}
assertIncludes(mobileApp, "state === 'background'", mobileAppPath);
assertIncludes(mobileApp, "emitPuzzleAbandon('today')", mobileAppPath);
assertIncludes(webApp, "const recommendationPuzzleSummaries", webAppPath);
assertIncludes(mobileApp, "const recommendationPuzzleSummaries", mobileAppPath);
assertIncludes(webApp, "...puzzleSummaries", webAppPath);
assertIncludes(mobileApp, "...puzzlePack.summaries", mobileAppPath);
assertIncludes(webApp, "recommendationPuzzleSummaries,", webAppPath);
assertIncludes(mobileApp, "recommendationPuzzleSummaries,", mobileAppPath);
// 공유 문구·계측은 core(shareText/shareGrid/shareResult) 하나여야 한다. RN 로컬 문구
// 빌더나 표면별 스트릭 계산이 되살아나면 두 마켓의 공유 결과·스트릭 숫자가 갈린다.
assertNotIncludes(
  mobileApp,
  "buildResultShareText",
  mobileAppPath,
  "share text must come from crossword-core shareText",
);
assertNotIncludes(
  mobileApp,
  "computeMobileStreakDays",
  mobileAppPath,
  "streak must come from crossword-core streakCalendar",
);
for (const eventName of ["SHARE_RESULT_CLICK_EVENT", "SHARE_RESULT_OUTCOME_EVENT"]) {
  assertIncludes(read(webShareHookPath), eventName, webShareHookPath);
  assertIncludes(read(mobileShareResultPath), eventName, mobileShareResultPath);
}
const recommendationFallbackCtaMarkers =
  mobileApp.match(/퍼즐 기록 보기/g) ?? [];
if (recommendationFallbackCtaMarkers.length < 4) {
  fail(
    `${mobileAppPath}: completion overlay and result screen both need recommendation fallback CTA`,
  );
}
const launchConfig = read(launchConfigPath);
const webFirebaseClient = read(webFirebaseClientPath);
const webTelemetry = read(webTelemetryPath);
const mobileFirebaseClient = read(mobileFirebaseClientPath);
const mobileTelemetry = read(mobileTelemetryPath);
const mobileAds = read(mobileAdsPath);
const mobileLeaderboardAdapter = read(mobileLeaderboardAdapterPath);
const mobileLeaderboardSpec = read(mobileLeaderboardSpecPath);
const mobileReturnReminder = read(mobileReturnReminderPath);
const mobileReturnReminderNotifications = read(
  mobileReturnReminderNotificationsPath,
);
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
const promoteGooglePlayWorkflow = read(promoteGooglePlayWorkflowPath);
const androidBuildEnv = read(androidBuildEnvPath);
const androidCloudBuildConfig = read(androidCloudBuildConfigPath);
const androidCloudBuildScript = read(androidCloudBuildScriptPath);
const googlePlayUploadScript = read(googlePlayUploadScriptPath);
const appStoreLocalBuild = read(appStoreLocalBuildPath);
const xcodeCloudPostClone = read(xcodeCloudPostClonePath);
const xcodeCloudPreBuild = read(xcodeCloudPreBuildPath);
const xcodeCloudPostBuild = read(xcodeCloudPostBuildPath);
const agents = read(agentsPath);
const marketParityDoc = read(marketParityDocPath);
const remoteConfigTemplate = read(remoteConfigTemplatePath);
const playStoreConfig = read(playStoreConfigPath);
const appStoreConfig = read(appStoreConfigPath);
const retryExhaustionSql = read(retryExhaustionSqlPath);
const easyServingSql = read(easyServingSqlPath);

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
assertIncludes(
  sharedIndex,
  'export * from "./puzzleIdentifiers";',
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
  /getNextRecommendedPuzzleSummary\(\s*puzzleSummaries,\s*getCompletedPuzzleIds\(dateCardStates\),\s*current,\s*\{\s*onboardingRampEnabled,\s*onboardingPuzzleId:\s*onboardingPuzzle\.puzzleId\s*\}/,
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
for (const [path, content] of [
  [webAppPath, webApp],
  [mobileAppPath, mobileApp],
]) {
  assertIncludes(content, "normalizePuzzleIdentifier", path);
  assertIncludes(content, "normalizeOptionalPuzzleIdentifier", path);
  assertIncludes(content, "puzzleAlias: getPuzzlePackAlias(puzzle)", path);
}
assertIncludes(
  webPuzzleRepository,
  "normalizePuzzleManifestIdentifiers",
  webPuzzleRepositoryPath,
);
assertIncludes(
  webPuzzleRepository,
  "normalizePuzzleIdentifiers",
  webPuzzleRepositoryPath,
);
assertIncludes(mobileApp, "normalizePuzzleManifestIdentifiers", mobileAppPath);
assertIncludes(mobileApp, "normalizePuzzleIdentifiers", mobileAppPath);
for (const key of [
  "next_puzzle_id",
  "pack_id",
  "puzzle_alias",
  "puzzle_id",
  "slot_id",
]) {
  assertIncludes(
    sharedPlatformContracts,
    `"${key}"`,
    sharedPlatformContractsPath,
  );
}
assertIncludes(
  marketParityDoc,
  "퍼즐 식별자 telemetry 문자열 계약",
  marketParityDocPath,
);
assertIncludes(
  retryExhaustionSql,
  "COALESCE(value.string_value, CAST(value.int_value AS STRING))",
  retryExhaustionSqlPath,
);
assertIncludes(
  easyServingSql,
  "COALESCE(value.string_value, CAST(value.int_value AS STRING))",
  easyServingSqlPath,
);
assertIncludes(
  mobileFirebaseClient,
  "analytics().logScreenView({",
  mobileFirebaseClientPath,
);
assertIncludes(
  mobileFirebaseClient,
  "screen_name: screenName",
  mobileFirebaseClientPath,
);
assertIncludes(
  mobileFirebaseClient,
  "screen_class: screenName",
  mobileFirebaseClientPath,
);
assertIncludes(
  mobileFirebaseClient,
  "!key.startsWith('firebase_')",
  mobileFirebaseClientPath,
);
for (const [content, path] of [
  [sharedLaunchConfig, sharedLaunchConfigPath],
  [webFirebaseClient, webFirebaseClientPath],
  [mobileFirebaseClient, mobileFirebaseClientPath],
]) {
  assertIncludes(content, "stuckHintFirstInputIdleMs", path);
  assertIncludes(content, "firstInputGuideEnabled", path);
  assertIncludes(content, "stuckHintPromptEnabled", path);
}
assertIncludes(
  remoteConfigTemplate,
  '"stuck_hint_first_input_idle_ms"',
  remoteConfigTemplatePath,
);
assertIncludes(marketParityDoc, "trigger=first_input", marketParityDocPath);
for (const marker of [
  "onboarding_guide_shown",
  "onboarding_guide_complete",
  "onboarding_guide_dismiss",
  "STUCK_HINT_PROMPT_EVENT",
  "STUCK_HINT_PROMPT_ACCEPT_EVENT",
  "STUCK_HINT_PROMPT_DISMISS_EVENT",
  "useStuckHintPrompt",
]) {
  assertIncludes(mobileApp, marker, mobileAppPath);
}
for (const marker of [
  "getStuckHintBackoffDelayMs",
  "getStuckHintDelayMs",
  "isNearFinishNudge",
  "shouldScheduleStuckHintPrompt",
]) {
  assertIncludes(mobileStuckHintPrompt, marker, mobileStuckHintPromptPath);
}
assertIncludes(
  remoteConfigTemplate,
  '"first_input_guide_enabled"',
  remoteConfigTemplatePath,
);
assertIncludes(
  remoteConfigTemplate,
  '"stuck_hint_prompt_enabled"',
  remoteConfigTemplatePath,
);
assertIncludes(marketParityDoc, "Android/iOS(RN)", marketParityDocPath);
assertNoLocalDefinitions(webApp, forbiddenLocalDefinitions, webAppPath);
assertNoLocalDefinitions(mobileApp, forbiddenLocalDefinitions, mobileAppPath);

for (const [path, content] of [
  [sharedPolicyPath, sharedPolicy],
  [sharedLaunchConfigPath, sharedLaunchConfig],
  [sharedRecommendationPath, sharedRecommendation],
  [sharedPlatformContractsPath, sharedPlatformContracts],
  [sharedPlatformAuthPath, sharedPlatformAuth],
  [sharedPlatformPresencePath, sharedPlatformPresence],
  [sharedPuzzleIdentifiersPath, sharedPuzzleIdentifiers],
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
  `"@seorilabs/platform-sdk": "${platformSdkVersion}"`,
  rootPackagePath,
);
assertIncludes(
  mobilePackage,
  `"@seorilabs/platform-sdk": "${platformSdkVersion}"`,
  mobilePackagePath,
);
// Platform discovery 는 선언과 lockfile 이 같은 exact 버전으로 해석될 때만 SDK
// 연동으로 분류한다. 커밋된 lockfile 이 SDK 를 다른 버전으로 풀거나 아예 담고
// 있지 않으면 캐럿 없이 고정해도 CUSTOM_HTTP 로 떨어진다.
assertLockPinsPlatformSdk(rootLockPath);
assertLockPinsPlatformSdk(mobileLockPath);
// 이 저장소는 CI·스크립트·문서 모두 npm 으로 설치한다. pnpm lockfile 이 함께
// 커밋되면 package manager 신호가 둘이 되어 discovery 감지가 흔들린다.
if (existsSync(pnpmLockPath)) {
  fail(
    `${pnpmLockPath}: repository installs with npm, so the pnpm lockfile must not be committed`,
  );
}
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
  assertIncludes(content, "presenceEnabled: PLATFORM_PRESENCE_ENABLED", path);
  assertIncludes(content, "createFailOpenPlatformPresenceLifecycle", path);
}
assertIncludes(webMain, "void ensurePlatformAuth();", webMainPath);
assertIncludes(webMain, "startPlatformPresence();", webMainPath);
assertIncludes(webMain, "stopPlatformPresence();", webMainPath);
assertIncludes(webMain, "resumePlatformPresence();", webMainPath);
assertIncludes(mobileIndex, "void ensurePlatformAuth();", mobileIndexPath);
assertIncludes(mobileIndex, "startPlatformPresence();", mobileIndexPath);
assertIncludes(mobileIndex, "stopPlatformPresence();", mobileIndexPath);
assertIncludes(mobileIndex, "resumePlatformPresence();", mobileIndexPath);
assertIncludes(
  mobileIndex,
  "registerReturnReminderBackgroundHandler();",
  mobileIndexPath,
);

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
  '"react-native-notify-kit": "10.6.0"',
  mobilePackagePath,
);
assertIncludes(
  mobileApp,
  "enabled: launchConfig.returnReminderEnabled",
  mobileAppPath,
);
assertIncludes(
  mobileApp,
  "RETURN_REMINDER_OPENED_EVENT",
  mobileAppPath,
);
assertIncludes(
  mobileReturnReminder,
  "buildReturnReminderPromptParams('mission_complete', undefined, 'local')",
  mobileReturnReminderPath,
);
assertIncludes(
  mobileReturnReminderNotifications,
  "client.requestPermission",
  mobileReturnReminderNotificationsPath,
);
assertIncludes(
  mobileReturnReminderNotifications,
  "cancelTriggerNotification(RETURN_REMINDER_NOTIFICATION_ID)",
  mobileReturnReminderNotificationsPath,
);
assertIncludes(
  mobileReturnReminderNotifications,
  "alarmManager: false",
  mobileReturnReminderNotificationsPath,
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
  '"android_app_id": "ca-app-pub-9932778305312246~7356925389"',
  mobileAppJsonPath,
);
assertIncludes(
  mobileAppJson,
  '"ios_app_id": "ca-app-pub-9932778305312246~5361317430"',
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
assertNotIncludes(mobileAds, "showInterstitialAd", mobileAdsPath);
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
assertIncludes(
  mobileLeaderboardSpec,
  "isAuthenticated(): Promise<boolean>",
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
  androidLeaderboardModule,
  "requireInteractiveSignIn = false",
  androidLeaderboardModulePath,
);
assertIncludes(
  androidLeaderboardModule,
  "requireInteractiveSignIn = true",
  androidLeaderboardModulePath,
);
assertIncludes(
  androidManifest,
  'android:name="com.google.android.gms.permission.AD_ID"',
  androidManifestPath,
);
assertIncludes(
  androidManifest,
  'android:name="android.permission.POST_NOTIFICATIONS"',
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
  "ca-app-pub-9932778305312246~7356925389",
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
  iosLeaderboardModule,
  "isAuthenticated:(RCTPromiseResolveBlock)resolve",
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
// @seorilabs/platform-sdk 는 npm 공개 레지스트리에서 설치한다. GitHub Packages
// 라우팅이 되살아나면 무인증 환경의 설치·검증이 다시 깨지므로 부재를 고정한다.
assertNotIncludes(
  staticChecksWorkflow,
  "npm_registry_url:",
  staticChecksWorkflowPath,
);
assertNotIncludes(staticChecksWorkflow, "npm_scope:", staticChecksWorkflowPath);
// Reusable workflows cannot elevate permissions granted by their caller.
// 재사용 배포 워크플로우가 packages: read 를 선언하므로 caller도 열어 둔다.
assertIncludes(deployAllWorkflow, "packages: read", deployAllWorkflowPath);
assertIncludes(
  deployAppsInTossWorkflow,
  "packages: read",
  deployAppsInTossWorkflowPath,
);
assertNotIncludes(
  deployAppsInTossWorkflow,
  "npm_registry_url:",
  deployAppsInTossWorkflowPath,
);
assertNotIncludes(
  deployAppsInTossWorkflow,
  "npm_scope:",
  deployAppsInTossWorkflowPath,
);
// 중앙 판본은 올라간다. 여기서 특정 SHA 를 박아 두면 판본을 올릴 때마다 이 파일도
// 같이 고쳐야 하고, 빠뜨리면 CI 가 빨간불로 남는다. immutable commit SHA 인지만 본다.
assertMatches(
  deployAppsInTossWorkflow,
  /rn-deploy-ait\.yml@[0-9a-f]{40}/u,
  deployAppsInTossWorkflowPath,
  "rn-deploy-ait.yml pinned to a commit SHA",
);
assertIncludes(
  deployGooglePlayWorkflow,
  "packages: read",
  deployGooglePlayWorkflowPath,
);
assertNotIncludes(
  deployGooglePlayWorkflow,
  "npm_registry_url:",
  deployGooglePlayWorkflowPath,
);
assertNotIncludes(
  deployGooglePlayWorkflow,
  "npm_scope:",
  deployGooglePlayWorkflowPath,
);
// 버전 정본은 중앙 release authority가 해석한 태그 하나이고, 검증과 업로드도
// 같은 exact SHA의 중앙 스크립트만 쓴다.
assertMatches(
  deployGooglePlayWorkflow,
  /resolve-release-version\.yml@[0-9a-f]{40}/u,
  deployGooglePlayWorkflowPath,
  "resolve-release-version.yml pinned to a commit SHA",
);
assertMatches(
  deployGooglePlayWorkflow,
  /ref: [0-9a-f]{40}/u,
  deployGooglePlayWorkflowPath,
  "central scripts checked out at a commit SHA",
);
assertIncludes(
  deployGooglePlayWorkflow,
  "scripts/release/verify-release-artifact.mjs",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "scripts/release/upload-google-play-aab.py",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "com.seorilabs.crosswordpuzzle",
  deployGooglePlayWorkflowPath,
);
assertNotIncludes(
  deployGooglePlayWorkflow,
  "secrets: inherit",
  deployGooglePlayWorkflowPath,
);
// 서명 AAB는 x86 Cloud Build에서만 만든다. RN new architecture 빌드의 합산 RSS가
// seorilabs-x64-android 러너의 4608Mi cgroup을 넘겨 v1.1.9 배포가 SIGKILL로 끝났고,
// 러너 노드에는 한도를 올릴 여유 메모리가 없다.
assertIncludes(
  deployGooglePlayWorkflow,
  "--config=cloudbuild-android.yaml",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "runs-on: seorilabs-rpi-arm64",
  deployGooglePlayWorkflowPath,
);
// 이 워크플로 이전에 태그된 릴리즈에는 Cloud Build 도구가 없다. 빌드 도구 계약은
// 워크플로 리비전에서 태그 소스로 설치해야 재배포가 태그 시점 파일에 좌우되지 않는다.
assertIncludes(
  deployGooglePlayWorkflow,
  "release-tooling/cloudbuild-android.yaml release-source/cloudbuild-android.yaml",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "release-tooling/scripts/build-android.sh release-source/scripts/build-android.sh",
  deployGooglePlayWorkflowPath,
);
assertNotIncludes(
  deployGooglePlayWorkflow,
  "seorilabs-x64-android",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  androidCloudBuildConfig,
  "machineType: E2_STANDARD_2",
  androidCloudBuildConfigPath,
);
// 제출 toolchain이 흔들리면 machineType이 unrecognized field로 떨어져 제출 자체가
// 거절된다(run 34225056022, 34228215910). gcloud 버전과 리전을 함께 고정한다.
assertIncludes(
  deployGooglePlayWorkflow,
  "version: 582.0.0",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "--region=asia-northeast3",
  deployGooglePlayWorkflowPath,
);
// ARC 러너 이미지에는 gh CLI와 jq가 없다. 업로드 job이 다시 이 도구에 의존하면
// 빌드가 끝난 뒤 업로드에서 exit 127로 끊긴다(run 34230988042).
assertNotIncludes(
  deployGooglePlayWorkflow,
  "gh release download",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  deployGooglePlayWorkflow,
  "releases/tags/",
  deployGooglePlayWorkflowPath,
);
assertIncludes(
  androidCloudBuildConfig,
  "dist/android/crossword-puzzle.aab",
  androidCloudBuildConfigPath,
);
assertIncludes(
  androidCloudBuildConfig,
  "args:\n      - scripts/build-android.sh",
  androidCloudBuildConfigPath,
);
// 공통 SDK는 npm 공개 레지스트리에 있다. GitHub Packages 라우팅이 되살아나면
// 무인증 Cloud Build 설치가 다시 깨지므로 부재를 고정한다.
assertNotIncludes(
  androidCloudBuildScript,
  "npm.pkg.github.com",
  androidCloudBuildScriptPath,
);
assertIncludes(
  androidCloudBuildScript,
  "EXPECTED_PLAY_UPLOAD_CERT_SHA256",
  androidCloudBuildScriptPath,
);
assertIncludes(
  androidCloudBuildScript,
  "gradlew :app:bundleRelease",
  androidCloudBuildScriptPath,
);
assertMatches(
  promoteGooglePlayWorkflow,
  /uses: seorilabs\/\.github\/\.github\/workflows\/promote-google-play\.yml@[0-9a-f]{40}/,
  promoteGooglePlayWorkflowPath,
  "immutable org promotion workflow SHA",
);
assertNotIncludes(
  promoteGooglePlayWorkflow,
  "promote-google-play.yml@main",
  promoteGooglePlayWorkflowPath,
);
for (const input of [
  "release_tag",
  "from_track",
  "to_track",
  "release_status",
  "rollout",
]) {
  assertIncludes(
    promoteGooglePlayWorkflow,
    `${input}: \${{ inputs.${input} }}`,
    promoteGooglePlayWorkflowPath,
  );
}
assertIncludes(
  promoteGooglePlayWorkflow,
  "upload_script: scripts/upload-google-play-internal.py",
  promoteGooglePlayWorkflowPath,
);
// 중앙 승격 계약은 태그가 정한 versionCode 하나만 올린다. 트랙의 최신 build를
// 그대로 승격하면 태그와 다른 산출물이 production으로 나갈 수 있다.
assertIncludes(
  googlePlayUploadScript,
  "--promote-version-code",
  googlePlayUploadScriptPath,
);
assertNotIncludes(
  googlePlayUploadScript,
  "max(version_codes)",
  googlePlayUploadScriptPath,
);
assertIncludes(
  promoteGooglePlayWorkflow,
  "workflow_dispatch:",
  promoteGooglePlayWorkflowPath,
);
assertIncludes(
  promoteGooglePlayWorkflow,
  "workflow_call:",
  promoteGooglePlayWorkflowPath,
);
for (const automaticTrigger of ["push:", "pull_request:", "schedule:"]) {
  assertNotIncludes(
    promoteGooglePlayWorkflow,
    automaticTrigger,
    promoteGooglePlayWorkflowPath,
  );
}
assertIncludes(
  androidBuildEnv,
  "ANDROID_BUILDER_TAG=node24-jdk17-android36",
  androidBuildEnvPath,
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
// Xcode Cloud 도 npm 공개 레지스트리에서 설치한다 — 레지스트리 토큰 요구가
// 되살아나면 Secret 없는 빌드가 깨지므로 부재를 고정한다.
assertNotIncludes(
  xcodeCloudPostClone,
  "GITHUB_PACKAGES_TOKEN",
  xcodeCloudPostClonePath,
);
assertNotIncludes(
  xcodeCloudPostClone,
  "_authToken",
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
  'AUTHORITY_SHA="6db01149a7700c0557bbeaf2e045aac7df0e78f2"',
  xcodeCloudPreBuildPath,
);
assertIncludes(xcodeCloudPreBuild, "1da1dce81a5194a37f7a31475c29d899d95eb6da9ae1460927fe439aa329752c", xcodeCloudPreBuildPath);
assertIncludes(xcodeCloudPreBuild, "xcode-cloud-apply-tag-version.mjs", xcodeCloudPreBuildPath);
// Apple build number 정본은 Xcode Cloud의 CI_BUILD_NUMBER다(중앙 계약 schemaVersion 2의
// appleBuildNumberExceptions). 값 검증과 중앙 binding 대조가 둘 다 있어야 한다. 예전에는
// 이 문자열을 금지했는데, 그때는 실행 번호 파생을 막는 것이 계약이었다.
assertIncludes(xcodeCloudPreBuild, 'CLOUD_BUILD_NUMBER="${CI_BUILD_NUMBER:-}"', xcodeCloudPreBuildPath);
assertIncludes(
  xcodeCloudPreBuild,
  '"$binding_build_number" != "$CLOUD_BUILD_NUMBER"',
  xcodeCloudPreBuildPath,
);
// 태그 파생 build number를 돌려주던 pin으로 되돌아가면 archive가 다시 어긋난다.
assertNotIncludes(xcodeCloudPreBuild, "9afa357f9ba6c8d6a813c7cec7ad3d35c626bdd5", xcodeCloudPreBuildPath);
assertNotIncludes(xcodeCloudPreBuild, "b399afde0016e23947e173437e266aa83071079d1345b41ff580ebfe63357d6f", xcodeCloudPreBuildPath);
assertIncludes(
  xcodeCloudPostBuild,
  "CFBundleShortVersionString",
  xcodeCloudPostBuildPath,
);
assertIncludes(xcodeCloudPostBuild, "CFBundleVersion", xcodeCloudPostBuildPath);
// App Store archive는 Xcode Cloud가 담당한다. GitHub Actions 경로가 macOS runner로
// 되돌아가면(회귀) 여기서 막는다.
// App Store 트리거는 Backoffice 가 ASC ciBuildRuns 로 직접 한다. 이 저장소에는 App Store
// 워크플로를 두지 않는다. 예전에는 caller 하나만 macOS 러너가 아닌지 봤는데, 파일이
// 사라진 지금은 어떤 워크플로도 macOS 러너로 되돌아가지 않는지를 본다.
for (const name of readdirSync(".github/workflows")) {
  if (!name.endsWith(".yml")) continue;
  const workflowPath = `.github/workflows/${name}`;
  assertNotIncludes(read(workflowPath), "macos-", workflowPath);
}
assertIncludes(
  appStoreLocalBuild,
  "GAME_CENTER_LEADERBOARD_ID",
  appStoreLocalBuildPath,
);
// 로컬 xcodebuild 경로는 Xcode Cloud가 아니므로 Apple build number가 계속 태그 파생
// encoded-version이다. pin만 같은 중앙 commit으로 맞춘다(tag-version-authority.mjs는
// 두 commit에서 바이트 동일).
assertIncludes(
  appStoreLocalBuild,
  'AUTHORITY_SHA="6db01149a7700c0557bbeaf2e045aac7df0e78f2"',
  appStoreLocalBuildPath,
);
assertIncludes(
  appStoreLocalBuild,
  'authority.deriveReleaseVersion(process.argv[3])',
  appStoreLocalBuildPath,
);
assertIncludes(
  appStoreLocalBuild,
  'tag_sha="$(git rev-parse "${tag}^{commit}"',
  appStoreLocalBuildPath,
);
assertIncludes(appStoreLocalBuild, "exact stable SemVer vX.Y.Z", appStoreLocalBuildPath);
assertIncludes(xcodeCloudPreBuild, "exact stable SemVer CI_TAG", xcodeCloudPreBuildPath);
assertNotIncludes(appStoreLocalBuild, "--marketing-version", appStoreLocalBuildPath);
assertNotIncludes(appStoreLocalBuild, "--build-number", appStoreLocalBuildPath);
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

// App Store 잡은 없다. 트리거는 Backoffice 가 ASC ciBuildRuns 로 직접 한다.
if (deployAllResolvedTagUsages < 2) {
  fail(
    `${deployAllWorkflowPath}: Deploy All must pass the resolved tag to AIT and Google Play jobs`,
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
