#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const jsonMode = process.argv.includes("--json");
const placeholders = ["", "확정 필요", "TODO", "TBD", "FIXME"];
const ignoredDirectories = new Set([
  ".git",
  ".granite",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "play-store/secrets",
]);

const result = {
  status: "pass",
  passes: [],
  warnings: [],
  failures: [],
};

function repoPath(path) {
  return join(root, path);
}

function add(kind, message, detail) {
  result[kind].push(detail == null ? { message } : { message, detail });
}

function pass(message, detail) {
  add("passes", message, detail);
}

function warn(message, detail) {
  add("warnings", message, detail);
}

function fail(message, detail) {
  add("failures", message, detail);
}

function isConcrete(value) {
  if (typeof value !== "string") {
    return value != null;
  }
  return !placeholders.includes(value.trim());
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(repoPath(path), "utf8"));
  } catch (error) {
    fail(`${path}를 읽을 수 없습니다.`, String(error));
    return null;
  }
}

function valueAt(object, path) {
  return path.split(".").reduce((current, key) => current?.[key], object);
}

function assertField(config, path, validator = isConcrete) {
  const value = valueAt(config, path);
  if (!validator(value)) {
    fail(
      `${path} 값이 확정되지 않았습니다.`,
      value == null ? "missing" : String(value),
    );
    return null;
  }
  pass(`${path} 값이 있습니다.`, String(value));
  return value;
}

function checkAssetPath(label, value) {
  const values = Array.isArray(value) ? value : [value];
  if (!isConcrete(value) || values.length === 0) {
    fail(
      `${label} 경로가 확정되지 않았습니다.`,
      value == null ? "missing" : String(value),
    );
    return;
  }

  for (const rawPath of values) {
    if (!isConcrete(rawPath)) {
      fail(`${label} 경로가 확정되지 않았습니다.`, String(rawPath));
    } else if (!existsSync(repoPath(rawPath))) {
      fail(`${label} 파일이 없습니다.`, rawPath);
    } else {
      pass(`${label} 파일이 있습니다.`, rawPath);
    }
  }
}

function parseGradleValue(contents, key) {
  const quoted = contents.match(
    new RegExp(`${key}\\s*[= ]\\s*["']([^"']+)["']`),
  );
  if (quoted != null) {
    return quoted[1];
  }

  const numeric = contents.match(new RegExp(`${key}\\s*[= ]\\s*(\\d+)`));
  if (numeric != null) {
    return numeric[1];
  }

  const identifier = contents.match(
    new RegExp(`${key}\\s*[= ]\\s*([A-Za-z_][A-Za-z0-9_]*)`),
  );
  return identifier?.[1] ?? null;
}

function parseGradleAssignedNumber(contents, identifier) {
  if (identifier == null || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    return Number.NaN;
  }

  const assignmentLine = contents
    .split("\n")
    .find((line) => new RegExp(`\\b${identifier}\\s*=`).test(line));
  if (assignmentLine == null) {
    return Number.NaN;
  }

  const directNumber = assignmentLine.match(
    new RegExp(`\\b${identifier}\\s*=\\s*(\\d+)`),
  );
  if (directNumber != null) {
    return Number.parseInt(directNumber[1], 10);
  }

  const quotedNumbers = [...assignmentLine.matchAll(/["'](\d+)["']/g)];
  if (quotedNumbers.length === 0) {
    return Number.NaN;
  }

  return Number.parseInt(quotedNumbers.at(-1)[1], 10);
}

function parseGradleNumber(contents, keys) {
  for (const key of keys) {
    const rawValue = parseGradleValue(contents, key);
    const value = Number.parseInt(rawValue ?? "", 10);
    if (!Number.isNaN(value)) {
      return value;
    }
    const assignedValue = parseGradleAssignedNumber(contents, rawValue);
    if (!Number.isNaN(assignedValue)) {
      return assignedValue;
    }
  }
  return Number.NaN;
}

function extractGradleBlock(contents, blockName) {
  const match = new RegExp(`(^|\\s)${blockName}\\s*\\{`, "m").exec(contents);
  if (match == null) {
    return null;
  }

  const start = contents.indexOf("{", match.index);
  let depth = 0;
  for (let index = start; index < contents.length; index += 1) {
    const char = contents[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return contents.slice(start + 1, index);
      }
    }
  }
  return null;
}

function releaseBuildType(contents) {
  const buildTypes = extractGradleBlock(contents, "buildTypes");
  return buildTypes == null ? null : extractGradleBlock(buildTypes, "release");
}

function hasReleaseSigningConfig(contents) {
  return /signingConfig\s+signingConfigs\./.test(
    releaseBuildType(contents) ?? "",
  );
}

function hasDebugReleaseSigning(contents) {
  return /signingConfig\s+signingConfigs\.debug/.test(
    releaseBuildType(contents) ?? "",
  );
}

function collectFiles(startPath, predicate = () => true) {
  if (!existsSync(repoPath(startPath))) {
    return [];
  }

  const files = [];
  const stack = [repoPath(startPath)];
  while (stack.length > 0) {
    const current = stack.pop();
    const relativePath = relative(root, current);
    if (
      [...ignoredDirectories].some(
        (directory) =>
          relativePath === directory ||
          relativePath.startsWith(`${directory}/`),
      )
    ) {
      continue;
    }

    const stat = statSync(current);
    if (stat.isDirectory()) {
      for (const child of readdirSync(current)) {
        stack.push(join(current, child));
      }
      continue;
    }

    if (predicate(relativePath)) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

function checkNativeSourceImports(sourceRoots) {
  const sourceFiles = sourceRoots.flatMap((sourceRoot) =>
    collectFiles(
      sourceRoot,
      (path) =>
        /\.(ts|tsx|js|jsx)$/.test(path) && !/\.(test|spec)\./.test(path),
    ),
  );
  const appsInTossFiles = sourceFiles.filter((path) => {
    const contents = readFileSync(repoPath(path), "utf8");
    return (
      contents.includes("@apps-in-toss/") ||
      contents.includes("@toss/tds-mobile-ait")
    );
  });

  if (appsInTossFiles.length > 0) {
    fail(
      "Google Play 네이티브 런타임에 AppsInToss 전용 import가 남아 있습니다.",
      appsInTossFiles.join(", "),
    );
  } else if (sourceFiles.length > 0) {
    pass(
      "Google Play 네이티브 소스에서 AppsInToss 전용 import를 찾지 못했습니다.",
    );
  }
}

const packageJson = readJson("package.json");
if (packageJson != null) {
  pass("package.json을 읽었습니다.", packageJson.name);
  if (packageJson.scripts?.["check:play"] == null) {
    warn("package.json에 check:play 스크립트가 없습니다.");
  }
}

const configPath = "play-store/google-play.config.json";
const config = existsSync(repoPath(configPath)) ? readJson(configPath) : null;
if (config == null) {
  fail(`${configPath}가 없습니다.`);
} else {
  pass(`${configPath}를 읽었습니다.`);

  const packageName = assertField(config, "packageName", (value) => {
    return (
      typeof value === "string" &&
      /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(value)
    );
  });
  if (packageName == null && isConcrete(config.suggestedPackageName)) {
    warn("packageName 확정 전 후보값이 있습니다.", config.suggestedPackageName);
  }

  assertField(config, "defaultLanguage");
  assertField(
    config,
    "appType",
    (value) => value === "app" || value === "game",
  );
  assertField(
    config,
    "freeOrPaid",
    (value) => value === "free" || value === "paid",
  );
  assertField(
    config,
    "contactEmail",
    (value) =>
      typeof value === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
  );
  assertField(
    config,
    "privacyPolicyUrl",
    (value) => typeof value === "string" && /^https:\/\//.test(value),
  );
  if (
    !isConcrete(config.privacyPolicyUrl) &&
    isConcrete(config.suggestedPrivacyPolicyUrl)
  ) {
    warn(
      "privacyPolicyUrl 확정 전 후보값이 있습니다.",
      config.suggestedPrivacyPolicyUrl,
    );
  }
  assertField(config, "release.name");
  assertField(config, "release.aabPath");

  const defaultLanguage = config.defaultLanguage ?? "ko-KR";
  assertField(config, `storeListing.appName.${defaultLanguage}`);
  assertField(
    config,
    `storeListing.shortDescription.${defaultLanguage}`,
    (value) =>
      typeof value === "string" && value.length > 0 && value.length <= 80,
  );
  assertField(
    config,
    `storeListing.fullDescription.${defaultLanguage}`,
    (value) =>
      typeof value === "string" && value.length > 0 && value.length <= 4000,
  );
  assertField(config, `release.notes.${defaultLanguage}`);

  for (const declaration of [
    "dataSafety",
    "contentRating",
    "targetAudience",
    "ads",
    "koreaDistribution",
  ]) {
    assertField(config, `contentDeclarations.${declaration}`);
  }
  if (
    config.appType === "game" &&
    config.contentDeclarations?.koreaDistribution === "yes"
  ) {
    assertField(config, "contentDeclarations.koreaGameRating");
  }

  checkAssetPath("assets.playIcon", config.assets?.playIcon);
  checkAssetPath("assets.featureGraphic", config.assets?.featureGraphic);
  checkAssetPath("assets.phoneScreenshots", config.assets?.phoneScreenshots);
}

const androidProjects = [
  {
    appBuildPath: "apps/mobile/android/app/build.gradle",
    appBuildKtsPath: "apps/mobile/android/app/build.gradle.kts",
    rootBuildPath: "apps/mobile/android/build.gradle",
    rootBuildKtsPath: "apps/mobile/android/build.gradle.kts",
    keyPropertiesPath: "apps/mobile/android/key.properties",
    bundleRoot: "apps/mobile/android/app/build/outputs/bundle",
    sourceRoots: ["apps/mobile", "packages/crossword-core"],
  },
  {
    appBuildPath: "android/app/build.gradle",
    appBuildKtsPath: "android/app/build.gradle.kts",
    rootBuildPath: "android/build.gradle",
    rootBuildKtsPath: "android/build.gradle.kts",
    keyPropertiesPath: "android/key.properties",
    bundleRoot: "android/app/build/outputs/bundle",
    sourceRoots: ["src", "packages/crossword-core"],
  },
];

const androidProject = androidProjects.find(
  (candidate) =>
    existsSync(repoPath(candidate.appBuildPath)) ||
    existsSync(repoPath(candidate.appBuildKtsPath)),
);
if (androidProject == null) {
  fail(
    "Android 네이티브 프로젝트가 없습니다.",
    "apps/mobile/android 또는 android 필요",
  );
} else {
  const appBuildPath = existsSync(repoPath(androidProject.appBuildPath))
    ? androidProject.appBuildPath
    : androidProject.appBuildKtsPath;
  const rootBuildPath = existsSync(repoPath(androidProject.rootBuildPath))
    ? androidProject.rootBuildPath
    : androidProject.rootBuildKtsPath;
  pass("Android 네이티브 프로젝트가 있습니다.", appBuildPath);

  const appBuildContents = readFileSync(repoPath(appBuildPath), "utf8");
  const rootBuildContents = existsSync(repoPath(rootBuildPath))
    ? readFileSync(repoPath(rootBuildPath), "utf8")
    : "";
  const applicationId = parseGradleValue(appBuildContents, "applicationId");
  const targetSdk =
    parseGradleNumber(appBuildContents, ["targetSdk", "targetSdkVersion"]) ||
    parseGradleNumber(rootBuildContents, ["targetSdk", "targetSdkVersion"]);
  const versionCode = parseGradleNumber(appBuildContents, ["versionCode"]);

  if (applicationId == null) {
    fail("Android applicationId를 찾지 못했습니다.", appBuildPath);
  } else {
    pass("Android applicationId를 찾았습니다.", applicationId);
    if (
      typeof config?.packageName === "string" &&
      /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(config.packageName) &&
      config.packageName !== applicationId
    ) {
      fail(
        "Google Play packageName과 Android applicationId가 다릅니다.",
        `${config.packageName} != ${applicationId}`,
      );
    }
  }

  if (Number.isNaN(targetSdk)) {
    fail("Android targetSdk를 찾지 못했습니다.", appBuildPath);
  } else if (targetSdk < 35) {
    fail(
      "Google Play 신규 앱 제출 기준 targetSdk가 낮습니다.",
      `targetSdk=${targetSdk}, required>=35`,
    );
  } else {
    pass(
      "Google Play 신규 앱 제출 기준 targetSdk를 충족합니다.",
      String(targetSdk),
    );
  }

  if (Number.isNaN(versionCode) || versionCode <= 0) {
    fail("Android versionCode가 유효하지 않습니다.", appBuildPath);
  } else {
    pass("Android versionCode가 유효합니다.", String(versionCode));
  }

  if (!hasReleaseSigningConfig(appBuildContents)) {
    fail("Android release signing 설정이 없습니다.", appBuildPath);
  } else if (hasDebugReleaseSigning(appBuildContents)) {
    fail(
      "Android release 빌드가 debug keystore로 서명됩니다.",
      "upload key 기반 release signing 설정 필요",
    );
  } else if (!existsSync(repoPath(androidProject.keyPropertiesPath))) {
    fail(
      "Android release upload key 설정 파일이 없습니다.",
      `${androidProject.keyPropertiesPath} 없으면 로컬 fallback key로만 빌드됩니다.`,
    );
  } else {
    pass("Android release signing 설정이 있습니다.");
  }

  checkNativeSourceImports(androidProject.sourceRoots);
}

const configuredAabPath = config?.release?.aabPath;
if (!isConcrete(configuredAabPath)) {
  fail("release.aabPath가 확정되지 않았습니다.");
} else if (!existsSync(repoPath(configuredAabPath))) {
  fail("Android App Bundle(.aab)이 없습니다.", configuredAabPath);
} else {
  pass("Android App Bundle(.aab)을 찾았습니다.", configuredAabPath);
}

if (existsSync(repoPath(".github/workflows/build-google-play.yml"))) {
  pass(
    "Google Play AAB workflow가 있습니다.",
    ".github/workflows/build-google-play.yml",
  );
} else {
  fail(
    "Google Play AAB workflow가 없습니다.",
    ".github/workflows/build-google-play.yml",
  );
}

if (existsSync(repoPath("scripts/upload-google-play-internal.py"))) {
  pass(
    "Google Play internal upload script가 있습니다.",
    "scripts/upload-google-play-internal.py",
  );
} else {
  fail(
    "Google Play internal upload script가 없습니다.",
    "scripts/upload-google-play-internal.py",
  );
}

if (existsSync(repoPath("scripts/setup-google-play-wif.sh"))) {
  pass(
    "Google Play WIF setup script가 있습니다.",
    "scripts/setup-google-play-wif.sh",
  );
} else {
  fail(
    "Google Play WIF setup script가 없습니다.",
    "scripts/setup-google-play-wif.sh",
  );
}

result.status =
  result.failures.length > 0
    ? "fail"
    : result.warnings.length > 0
      ? "warn"
      : "pass";

if (jsonMode) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(
    `Google Play readiness: ${result.status.toUpperCase()}\n`,
  );
  for (const [label, items] of [
    ["FAIL", result.failures],
    ["WARN", result.warnings],
    ["PASS", result.passes],
  ]) {
    for (const item of items) {
      const suffix = item.detail == null ? "" : ` (${item.detail})`;
      process.stdout.write(`${label} ${item.message}${suffix}\n`);
    }
  }
}

process.exit(result.failures.length > 0 ? 1 : 0);
