#!/usr/bin/env node
import { readFileSync } from "node:fs";

const expected = {
  publisherId: "pub-9932778305312246",
  catalogLogicalId: "app/crossword-puzzle/admob/public-identifiers",
  packageId: "com.seorilabs.crosswordpuzzle",
  android: {
    appId: "ca-app-pub-9932778305312246~7356925389",
    rewardedHint: "ca-app-pub-9932778305312246/1613644113",
  },
  ios: {
    appId: "ca-app-pub-9932778305312246~5361317430",
    rewardedHint: "ca-app-pub-9932778305312246/5603016700",
  },
};

const failures = [];
const read = (path) => readFileSync(path, "utf8");
const json = (path) => JSON.parse(read(path));
const fail = (message) => failures.push(message);
const equal = (actual, wanted, label) => {
  if (actual !== wanted) fail(`${label}: configured value mismatch`);
};
const includes = (content, value, label) => {
  if (!content.includes(value)) fail(`${label}: required value missing`);
};
const excludes = (content, value, label) => {
  if (content.includes(value)) fail(`${label}: forbidden value present`);
};
const excludesPattern = (content, pattern, label) => {
  if (pattern.test(content)) fail(`${label}: forbidden pattern present`);
};

const play = json("play-store/google-play.config.json");
const appStore = json("app-store/app-store.config.json");
const appJson = json("apps/mobile/app.json");
const mobileAds = read("apps/mobile/mobileAds.ts");
const androidManifest = read(
  "apps/mobile/android/app/src/main/AndroidManifest.xml",
);

for (const [label, config, platform] of [
  ["Google Play", play, "android"],
  ["App Store", appStore, "ios"],
]) {
  equal(
    config.packageName ?? config.bundleId,
    expected.packageId,
    `${label} package/bundle ID`,
  );
  equal(config.adMob?.publisherId, expected.publisherId, `${label} publisher`);
  equal(
    config.adMob?.catalogLogicalId,
    expected.catalogLogicalId,
    `${label} catalog logical ID`,
  );
  equal(config.adMob?.appId, expected[platform].appId, `${label} app ID`);
  equal(
    config.adMob?.adUnits?.rewardedHint,
    expected[platform].rewardedHint,
    `${label} rewardedHint`,
  );
  const placements = Object.keys(config.adMob?.adUnits ?? {}).sort();
  if (placements.join(",") !== "rewardedHint") {
    fail(`${label} placements: unexpected placement set`);
  }
}

equal(
  appJson["react-native-google-mobile-ads"]?.android_app_id,
  expected.android.appId,
  "app.json Android app ID",
);
equal(
  appJson["react-native-google-mobile-ads"]?.ios_app_id,
  expected.ios.appId,
  "app.json iOS app ID",
);
includes(androidManifest, expected.android.appId, "Android manifest");
includes(mobileAds, expected.android.rewardedHint, "Android rewarded source");
includes(mobileAds, expected.ios.rewardedHint, "iOS rewarded source");
excludes(mobileAds, "showInterstitialAd", "unused interstitial implementation");

for (const [path, content] of [
  ["apps/mobile/app.json", JSON.stringify(appJson)],
  ["play-store/google-play.config.json", JSON.stringify(play)],
  ["app-store/app-store.config.json", JSON.stringify(appStore)],
  ["apps/mobile/mobileAds.ts", mobileAds],
  ["AndroidManifest.xml", androidManifest],
]) {
  excludes(content, "2444587584524186", `${path} legacy publisher`);
  excludes(
    content,
    "ca-app-pub-3940256099942544",
    `${path} Google test publisher`,
  );
}

const dimensions = read("packages/crossword-core/src/releaseVersion.ts");
const gameAnalytics = read("packages/crossword-core/src/gameAnalytics.ts");
const webAnalytics = read("src/adapters/analyticsSinks.ts");
const mobileAnalytics = read("apps/mobile/analyticsSinks.ts");
for (const key of ["app_market", "runtime_platform", "release_version"]) {
  includes(dimensions, `"${key}"`, "analytics standard dimensions");
}
includes(gameAnalytics, "app_market: input.market", "game analytics market");
excludesPattern(
  gameAnalytics,
  /(?:^|[\s,{])market\s*:\s*input\.market\b/m,
  "legacy emitted market",
);
includes(webAnalytics, "appMarket: currentMarket", "AIT analytics dimensions");
includes(webAnalytics, 'runtimePlatform: "web"', "AIT runtime platform");
includes(
  mobileAnalytics,
  "appMarket: currentMarket",
  "mobile analytics dimensions",
);
includes(
  mobileAnalytics,
  "runtimePlatform: currentRuntimePlatform",
  "mobile runtime platform",
);

const presenceCore = read("packages/crossword-core/src/platformPresence.ts");
const webPresence = read("src/adapters/platformAuth.ts");
const mobilePresence = read("apps/mobile/platformAuth.ts");
const webLifecycle = read("src/main.tsx");
const mobileLifecycle = read("apps/mobile/index.js");
includes(
  presenceCore,
  "PLATFORM_PRESENCE_ENABLED = true",
  "Presence opt-in stays enabled",
);
for (const [label, content] of [
  ["web", webPresence],
  ["mobile", mobilePresence],
]) {
  includes(
    content,
    "presenceEnabled: PLATFORM_PRESENCE_ENABLED",
    `${label} Presence gate`,
  );
}
for (const [label, content] of [
  ["web", webLifecycle],
  ["mobile", mobileLifecycle],
]) {
  includes(content, "startPlatformPresence();", `${label} Presence start`);
  includes(content, "stopPlatformPresence();", `${label} Presence stop`);
  includes(content, "resumePlatformPresence();", `${label} Presence resume`);
}

if (failures.length > 0) {
  console.error("AdMob·Analytics·Presence release contract check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AdMob·Analytics·Presence release contract check passed.");
