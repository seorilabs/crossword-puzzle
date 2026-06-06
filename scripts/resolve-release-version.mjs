#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SEMVER_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;

function parseArgs(argv) {
  const args = { tag: "" };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--tag") {
      args.tag = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--tag=")) {
      args.tag = arg.slice("--tag=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function parseVersion(value, label) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (match == null) {
    throw new Error(
      `${label} must be a plain semver version. Received: ${value}`,
    );
  }

  return {
    version: value,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function parseTag(tag) {
  const match = SEMVER_TAG_PATTERN.exec(tag);
  if (match == null) {
    throw new Error(`release tag must match vX.Y.Z. Received: ${tag}`);
  }

  return {
    tag,
    version: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function readPackageVersion() {
  const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  return parseVersion(packageJson.version, "package.json version");
}

function androidVersionCode(version) {
  const code =
    version.major * 1_000_000 + version.minor * 1_000 + version.patch;
  return Math.max(code, 1);
}

function writeOutput(values) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  appendFileSync(
    outputPath,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
  );
}

const args = parseArgs(process.argv.slice(2));
const release = args.tag ? parseTag(args.tag) : readPackageVersion();
const tag = args.tag ? release.tag : `v${release.version}`;
const versionCode = androidVersionCode(release);

writeOutput({
  android_version_code: versionCode,
  release_name: tag,
  tag,
  version: release.version,
});

console.log(
  `Resolved release version: ${release.version} (${tag}), Android versionCode ${versionCode}`,
);
