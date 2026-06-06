#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SEMVER_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;
const VALID_BUMPS = new Set(["patch", "minor", "major"]);

function parseArgs(argv) {
  const args = { bump: "patch" };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--bump") {
      args.bump = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--bump=")) {
      args.bump = arg.slice("--bump=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!VALID_BUMPS.has(args.bump)) {
    throw new Error(
      `--bump must be one of: ${Array.from(VALID_BUMPS).join(", ")}`,
    );
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
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function parseTag(value) {
  const match = SEMVER_TAG_PATTERN.exec(value);
  if (match == null) {
    return null;
  }
  return {
    tag: value,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(left, right) {
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  );
}

function readPackageVersion() {
  const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  return parseVersion(packageJson.version, "package.json version");
}

function readSemverTags() {
  const output = execFileSync(
    "git",
    ["tag", "--list", "v[0-9]*.[0-9]*.[0-9]*"],
    {
      encoding: "utf8",
    },
  );

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseTag)
    .filter(Boolean)
    .sort(compareVersions);
}

function bumpVersion(version, bump) {
  if (bump === "major") {
    return { major: version.major + 1, minor: 0, patch: 0 };
  }
  if (bump === "minor") {
    return { major: version.major, minor: version.minor + 1, patch: 0 };
  }
  return {
    major: version.major,
    minor: version.minor,
    patch: version.patch + 1,
  };
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
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
const tags = readSemverTags();
const existingTags = new Set(tags.map((tag) => tag.tag));
const baseVersion = tags.at(-1) ?? readPackageVersion();
let nextVersion = bumpVersion(baseVersion, args.bump);
let nextTag = `v${formatVersion(nextVersion)}`;

while (existingTags.has(nextTag)) {
  nextVersion = bumpVersion(nextVersion, "patch");
  nextTag = `v${formatVersion(nextVersion)}`;
}

const version = formatVersion(nextVersion);
const base = formatVersion(baseVersion);

writeOutput({
  base_version: base,
  bump: args.bump,
  tag: nextTag,
  version,
});

console.log(`Next release tag: ${nextTag} (base ${base}, bump ${args.bump})`);
