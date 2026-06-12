#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const root = process.cwd();
const placeholders = new Set(["", "확정 필요", "TODO", "TBD", "FIXME"]);

function parseArgs(argv) {
  const args = {
    clean: true,
    configPath: "app-store/app-store.config.json",
    outputPath: "app-store/deliver",
    skipMetadata: false,
    skipScreenshots: false,
    useSuggestedUrls: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--no-clean") {
      args.clean = false;
      continue;
    }
    if (arg === "--metadata-only") {
      args.skipScreenshots = true;
      continue;
    }
    if (arg === "--screenshots-only") {
      args.skipMetadata = true;
      continue;
    }
    if (arg === "--use-suggested-urls") {
      args.useSuggestedUrls = true;
      continue;
    }
    if (arg === "--config") {
      args.configPath = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--config=")) {
      args.configPath = arg.slice("--config=".length);
      continue;
    }
    if (arg === "--output") {
      args.outputPath = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--output=")) {
      args.outputPath = arg.slice("--output=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function repoPath(path) {
  return resolve(root, path);
}

function readJson(path) {
  return JSON.parse(readFileSync(repoPath(path), "utf8"));
}

function localeValue(values, locale) {
  return values?.[locale];
}

function isConfirmed(value) {
  if (typeof value !== "string") {
    return value != null;
  }
  return !placeholders.has(value.trim());
}

function writeTextFile(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${value.trim()}\n`, "utf8");
}

function writeConfirmedText(path, value, summary, label) {
  if (!isConfirmed(value)) {
    summary.skippedMetadata.push(label);
    return;
  }
  writeTextFile(path, value);
  summary.metadata.push(label);
}

function suggestedOrConfirmed(primary, suggested, useSuggestedUrls) {
  if (isConfirmed(primary)) {
    return primary;
  }
  if (useSuggestedUrls && isConfirmed(suggested)) {
    return suggested;
  }
  return primary;
}

function screenshotOutputName(sourcePath, index, family) {
  const sequence = String(index + 1).padStart(2, "0");
  const extension = basename(sourcePath).split(".").pop() ?? "png";
  if (family === "ipad") {
    return `${sequence}-iPad Pro (12.9-inch) (3rd generation).${extension}`;
  }
  return `${sequence}-iPhone.${extension}`;
}

function copyScreenshots(paths, family, localeDir, summary) {
  paths.forEach((path, index) => {
    if (!existsSync(repoPath(path))) {
      summary.missingScreenshots.push(path);
      return;
    }

    const outputName = screenshotOutputName(path, index, family);
    const outputPath = join(localeDir, outputName);
    copyFileSync(repoPath(path), outputPath);
    summary.screenshots.push({ family, source: path, output: outputName });
  });
}

const args = parseArgs(process.argv.slice(2));
const config = readJson(args.configPath);
const locale = config.defaultLanguage ?? "ko-KR";
const outputRoot = repoPath(args.outputPath);
const metadataLocaleDir = join(outputRoot, "metadata", locale);
const screenshotsLocaleDir = join(outputRoot, "screenshots", locale);
const summary = {
  output: args.outputPath,
  locale,
  metadata: [],
  skippedMetadata: [],
  screenshots: [],
  missingScreenshots: [],
};

if (args.clean) {
  rmSync(outputRoot, { recursive: true, force: true });
}

if (!args.skipMetadata) {
  mkdirSync(metadataLocaleDir, { recursive: true });
  const listing = config.storeListing ?? {};
  const support = config.support ?? {};
  const compliance = config.compliance ?? {};

  writeConfirmedText(
    join(metadataLocaleDir, "name.txt"),
    localeValue(listing.appName, locale),
    summary,
    "name",
  );
  writeConfirmedText(
    join(metadataLocaleDir, "subtitle.txt"),
    localeValue(listing.subtitle, locale),
    summary,
    "subtitle",
  );
  writeConfirmedText(
    join(metadataLocaleDir, "promotional_text.txt"),
    localeValue(listing.promotionalText, locale),
    summary,
    "promotional_text",
  );
  writeConfirmedText(
    join(metadataLocaleDir, "description.txt"),
    localeValue(listing.description, locale),
    summary,
    "description",
  );
  writeConfirmedText(
    join(metadataLocaleDir, "keywords.txt"),
    localeValue(listing.keywords, locale),
    summary,
    "keywords",
  );
  writeConfirmedText(
    join(metadataLocaleDir, "release_notes.txt"),
    localeValue(listing.releaseNotes, locale) ??
      localeValue(config.releaseNotes, locale),
    summary,
    "release_notes",
  );
  writeConfirmedText(
    join(metadataLocaleDir, "support_url.txt"),
    suggestedOrConfirmed(
      support.supportUrl,
      support.suggestedSupportUrl,
      args.useSuggestedUrls,
    ),
    summary,
    "support_url",
  );
  writeConfirmedText(
    join(metadataLocaleDir, "marketing_url.txt"),
    suggestedOrConfirmed(
      support.marketingUrl,
      support.suggestedMarketingUrl,
      args.useSuggestedUrls,
    ),
    summary,
    "marketing_url",
  );
  writeConfirmedText(
    join(metadataLocaleDir, "privacy_url.txt"),
    suggestedOrConfirmed(
      compliance.privacyPolicyUrl,
      compliance.suggestedPrivacyPolicyUrl,
      args.useSuggestedUrls,
    ),
    summary,
    "privacy_url",
  );
}

if (!args.skipScreenshots) {
  mkdirSync(screenshotsLocaleDir, { recursive: true });
  copyScreenshots(
    config.assets?.iphoneScreenshots ?? [],
    "iphone",
    screenshotsLocaleDir,
    summary,
  );
  copyScreenshots(
    config.assets?.ipadScreenshots ?? [],
    "ipad",
    screenshotsLocaleDir,
    summary,
  );
}

console.log(JSON.stringify(summary, null, 2));
