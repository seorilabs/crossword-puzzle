#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const jsonMode = process.argv.includes("--json");
const placeholders = ["", "확정 필요", "TODO", "TBD", "FIXME"];

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

function checkPath(label, path, required = true) {
  if (!isConcrete(path)) {
    const message = `${label} 경로가 확정되지 않았습니다.`;
    required ? fail(message, String(path ?? "missing")) : warn(message);
    return false;
  }
  if (!existsSync(repoPath(path))) {
    const message = `${label} 파일 또는 폴더가 없습니다.`;
    required ? fail(message, path) : warn(message, path);
    return false;
  }
  pass(`${label} 파일 또는 폴더가 있습니다.`, path);
  return true;
}

function checkAssetPath(label, value, required = true) {
  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0) {
    const message = `${label} 경로가 없습니다.`;
    required ? fail(message) : warn(message);
    return;
  }
  for (const path of values) {
    checkPath(label, path, required);
  }
}

function parsePbxSetting(contents, key) {
  const match = contents.match(new RegExp(`"?${key}"?\\s*=\\s*([^;]+);`));
  return match?.[1]?.replace(/^"|"$/g, "") ?? null;
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function lintPlist(path) {
  const output = run("plutil", ["-lint", path]);
  if (output.status === 0) {
    pass(`${path} plist lint 통과`);
  } else {
    fail(`${path} plist lint 실패`, `${output.stdout}${output.stderr}`.trim());
  }
}

function listFiles(path) {
  if (!existsSync(repoPath(path))) {
    return [];
  }
  return readdirSync(repoPath(path)).filter((name) => {
    return statSync(repoPath(join(path, name))).isFile();
  });
}

function checkMarketingText(config, path, limit) {
  const values = valueAt(config, path) ?? {};
  for (const [locale, text] of Object.entries(values)) {
    if (!isConcrete(text)) {
      fail(`${path}.${locale} 값이 확정되지 않았습니다.`, String(text));
    } else if (text.length > limit) {
      fail(`${path}.${locale} 길이가 ${limit}자를 초과했습니다.`, `${text.length}자`);
    } else {
      pass(`${path}.${locale} 길이가 제한 이내입니다.`, `${text.length}/${limit}`);
    }
  }
}

const packageJson = readJson("package.json");
if (packageJson != null) {
  pass("package.json을 읽었습니다.", packageJson.name);
  if (packageJson.scripts?.["check:app-store"] == null) {
    fail("package.json에 check:app-store 스크립트가 없습니다.");
  }
}

const configPath = "app-store/app-store.config.json";
const config = existsSync(repoPath(configPath)) ? readJson(configPath) : null;

if (config == null) {
  fail(`${configPath}가 없습니다.`);
} else {
  pass(`${configPath}를 읽었습니다.`);

  const bundleId = assertField(config, "bundleId", (value) => {
    return (
      typeof value === "string" &&
      /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$/.test(value)
    );
  });
  if (bundleId == null && isConcrete(config.suggestedBundleId)) {
    warn("bundleId 확정 전 후보값이 있습니다.", config.suggestedBundleId);
  }

  assertField(config, "defaultLanguage");
  assertField(config, "sku");
  assertField(config, "appType", (value) => value === "app" || value === "game");
  assertField(config, "freeOrPaid", (value) => value === "free" || value === "paid");
  assertField(config, "support.contactEmail");
  assertField(config, "support.supportUrl");
  if (!isConcrete(valueAt(config, "support.supportUrl")) && isConcrete(valueAt(config, "support.suggestedSupportUrl"))) {
    warn("supportUrl 확정 전 후보값이 있습니다.", valueAt(config, "support.suggestedSupportUrl"));
  }

  assertField(config, "compliance.privacyPolicyUrl");
  if (!isConcrete(valueAt(config, "compliance.privacyPolicyUrl")) && isConcrete(valueAt(config, "compliance.suggestedPrivacyPolicyUrl"))) {
    warn("privacyPolicyUrl 확정 전 후보값이 있습니다.", valueAt(config, "compliance.suggestedPrivacyPolicyUrl"));
  }
  assertField(config, "compliance.appPrivacy");
  assertField(config, "compliance.ageRating");
  assertField(config, "compliance.exportCompliance");
  assertField(config, "compliance.contentRights");
  assertField(config, "compliance.dsaTraderStatus");
  assertField(config, "support.reviewContactFirstName");
  assertField(config, "support.reviewContactLastName");
  assertField(config, "support.reviewContactPhone");

  checkMarketingText(config, "storeListing.promotionalText", 170);
  checkMarketingText(config, "storeListing.description", 4000);
  checkMarketingText(config, "storeListing.keywords", 100);

  checkAssetPath("App Store icon", valueAt(config, "assets.storeIcon"));
  checkAssetPath("iPhone screenshot", valueAt(config, "assets.iphoneScreenshots"));
  if (valueAt(config, "ios.targetedDeviceFamily") === "1,2") {
    checkAssetPath("iPad screenshot", valueAt(config, "assets.ipadScreenshots"));
  }

  checkPath("iOS project", valueAt(config, "ios.project"));
  checkPath("iOS workspace", valueAt(config, "ios.workspace"));
  checkPath("Info.plist", valueAt(config, "ios.infoPlist"));
  checkPath("PrivacyInfo.xcprivacy", valueAt(config, "ios.privacyManifest"));
  checkPath("AppIcon.appiconset", valueAt(config, "ios.appIconSet"));

  const infoPlist = valueAt(config, "ios.infoPlist");
  if (isConcrete(infoPlist) && existsSync(repoPath(infoPlist))) {
    lintPlist(infoPlist);
    const contents = readFileSync(repoPath(infoPlist), "utf8");
    if (contents.includes("NSLocationWhenInUseUsageDescription")) {
      warn("위치 권한 문구가 Info.plist에 있습니다. 실제로 위치를 쓰지 않으면 제거하세요.", infoPlist);
    } else {
      pass("사용하지 않는 위치 권한 문구를 찾지 못했습니다.");
    }
    if (contents.includes("ITSAppUsesNonExemptEncryption")) {
      pass("Info.plist에 export compliance key가 있습니다.", "ITSAppUsesNonExemptEncryption");
    } else {
      warn("Info.plist에 ITSAppUsesNonExemptEncryption이 없습니다.");
    }
  }

  const privacyManifest = valueAt(config, "ios.privacyManifest");
  if (isConcrete(privacyManifest) && existsSync(repoPath(privacyManifest))) {
    lintPlist(privacyManifest);
  }

  const appIconSet = valueAt(config, "ios.appIconSet");
  if (isConcrete(appIconSet) && existsSync(repoPath(appIconSet))) {
    const iconFiles = listFiles(appIconSet).filter((name) => name.endsWith(".png"));
    if (iconFiles.length === 0) {
      fail("AppIcon.appiconset에 PNG 파일이 없습니다.", appIconSet);
    } else {
      pass("AppIcon.appiconset에 PNG 파일이 있습니다.", `${iconFiles.length}개`);
    }
    for (const required of ["Icon-App-76x76@2x.png", "Icon-App-83.5x83.5@2x.png", "Icon-App-1024x1024@1x.png"]) {
      if (!iconFiles.includes(required)) {
        fail("필수 AppIcon PNG가 없습니다.", required);
      } else {
        pass("필수 AppIcon PNG가 있습니다.", required);
      }
    }
  }

  const projectPath = valueAt(config, "ios.project");
  const pbxPath = projectPath == null ? null : join(projectPath, "project.pbxproj");
  if (pbxPath != null && existsSync(repoPath(pbxPath))) {
    const pbx = readFileSync(repoPath(pbxPath), "utf8");
    const projectBundleId = parsePbxSetting(pbx, "PRODUCT_BUNDLE_IDENTIFIER");
    if (bundleId != null && projectBundleId !== bundleId) {
      fail("config bundleId와 Xcode PRODUCT_BUNDLE_IDENTIFIER가 다릅니다.", `${bundleId} != ${projectBundleId}`);
    } else if (projectBundleId != null) {
      pass("Xcode PRODUCT_BUNDLE_IDENTIFIER를 확인했습니다.", projectBundleId);
    }

    const targetedDeviceFamily = parsePbxSetting(pbx, "TARGETED_DEVICE_FAMILY");
    if (targetedDeviceFamily !== valueAt(config, "ios.targetedDeviceFamily")) {
      warn("config targetedDeviceFamily와 Xcode 설정이 다릅니다.", `${valueAt(config, "ios.targetedDeviceFamily")} != ${targetedDeviceFamily}`);
    } else {
      pass("Xcode TARGETED_DEVICE_FAMILY를 확인했습니다.", targetedDeviceFamily);
    }

    const codeSignIdentity = parsePbxSetting(pbx, "CODE_SIGN_IDENTITY\\[sdk=iphoneos\\*\\]");
    if (codeSignIdentity != null && codeSignIdentity.includes("Developer")) {
      fail("Release signing identity가 App Store용이 아닙니다.", codeSignIdentity);
    } else if (codeSignIdentity != null) {
      pass("Release signing identity를 확인했습니다.", codeSignIdentity);
    } else {
      fail("Release signing identity를 확인할 수 없습니다.");
    }

    if (!pbx.includes("DEVELOPMENT_TEAM")) {
      fail("Xcode project에 DEVELOPMENT_TEAM이 없습니다.");
    }
    if (!pbx.includes("PROVISIONING_PROFILE_SPECIFIER")) {
      fail("Xcode project에 PROVISIONING_PROFILE_SPECIFIER가 없습니다.");
    }
  }

  const podfileLock = "apps/mobile/ios/Podfile.lock";
  const workspace = valueAt(config, "ios.workspace");
  if (!existsSync(repoPath(podfileLock)) || !existsSync(repoPath(workspace))) {
    fail("iOS CocoaPods 설치 산출물이 없습니다.", "apps/mobile/ios에서 bundle exec pod install 필요");
  } else {
    pass("iOS CocoaPods 설치 산출물이 있습니다.");
  }

  for (const [gate, value] of Object.entries(config.manualGates ?? {})) {
    if (!isConcrete(value)) {
      fail(`수동 App Store Connect gate가 남아 있습니다: ${gate}`, String(value));
    }
  }
}

if (result.failures.length > 0) {
  result.status = "fail";
} else if (result.warnings.length > 0) {
  result.status = "warn";
}

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`App Store readiness: ${result.status}`);
  for (const [label, items] of [
    ["PASS", result.passes],
    ["WARN", result.warnings],
    ["FAIL", result.failures],
  ]) {
    if (items.length === 0) {
      continue;
    }
    console.log(`\n${label}`);
    for (const item of items) {
      console.log(`- ${item.message}${item.detail == null ? "" : ` (${item.detail})`}`);
    }
  }
}

process.exit(result.failures.length > 0 ? 1 : 0);
