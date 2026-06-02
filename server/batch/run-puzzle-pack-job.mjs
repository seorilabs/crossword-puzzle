import { spawn } from "node:child_process";
import path from "node:path";

function readEnvBoolean(name) {
  const value = process.env[name];
  return value === "1" || value === "true";
}

function readEnvBooleanWithDefault(name, defaultValue) {
  const value = process.env[name];

  if (value == null || value === "") {
    return defaultValue;
  }

  return value === "1" || value === "true";
}

function getDateKey(timeZone, date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone });
}

function makeDefaultSeed(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return String((hash >>> 0) || 1);
}

function parseArgs(argv) {
  const options = {
    dryRun: readEnvBoolean("PUZZLE_PUBLISH_DRY_RUN"),
    generatorArgs: [],
    skipGenerate: readEnvBoolean("PUZZLE_SKIP_GENERATE"),
    skipPublish: readEnvBoolean("PUZZLE_SKIP_PUBLISH"),
    skipValidate: readEnvBoolean("PUZZLE_SKIP_VALIDATE"),
  };

  for (const arg of argv) {
    if (arg === "--dryRun") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--skipGenerate") {
      options.skipGenerate = true;
      continue;
    }
    if (arg === "--skipPublish") {
      options.skipPublish = true;
      continue;
    }
    if (arg === "--skipValidate") {
      options.skipValidate = true;
      continue;
    }

    options.generatorArgs.push(arg);
  }

  return options;
}

function getArgValue(args, key) {
  const prefix = `--${key}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

function ensureArg(args, key, value) {
  if (value == null || value === "") {
    return args;
  }

  if (getArgValue(args, key) != null) {
    return args;
  }

  return [...args, `--${key}=${value}`];
}

async function runNode(scriptPath, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${scriptPath} exited with code ${code}`));
    });
  });
}

function getGeneratorArgs(options) {
  const hostingBaseUrl = process.env.PUZZLE_HOSTING_BASE_URL;
  let args = [...options.generatorArgs];
  const now = new Date();
  const timeZone =
    getArgValue(args, "timeZone") ??
    process.env.PUZZLE_TIME_ZONE ??
    "Asia/Seoul";
  const publishedAt =
    getArgValue(args, "publishedAt") ??
    process.env.PUZZLE_PUBLISHED_AT ??
    now.toISOString();
  const publishedAtDate = new Date(publishedAt);
  const seedDate = Number.isNaN(publishedAtDate.getTime())
    ? now
    : publishedAtDate;
  const startDate =
    getArgValue(args, "start") ??
    process.env.PUZZLE_START_DATE ??
    getDateKey(timeZone, seedDate);
  const seed =
    getArgValue(args, "seed") ??
    process.env.PUZZLE_SEED ??
    makeDefaultSeed(`${timeZone}:${startDate}:${publishedAt}`);

  if (
    readEnvBooleanWithDefault("PUZZLE_APPEND", true) &&
    getArgValue(args, "append") == null
  ) {
    args = [...args, "--append"];
  }

  args = ensureArg(args, "days", process.env.PUZZLE_DAYS ?? "1");
  args = ensureArg(args, "start", startDate);
  args = ensureArg(args, "seed", seed);
  args = ensureArg(
    args,
    "outDir",
    process.env.PUZZLE_OUT_DIR ?? "public/puzzles",
  );
  args = ensureArg(args, "timeZone", timeZone);
  args = ensureArg(args, "keep", process.env.PUZZLE_KEEP ?? "84");
  args = ensureArg(
    args,
    "intervalHours",
    process.env.PUZZLE_INTERVAL_HOURS ?? "2",
  );
  args = ensureArg(args, "publishedAt", publishedAt);
  args = ensureArg(args, "hostingBaseUrl", hostingBaseUrl);
  args = ensureArg(
    args,
    "appendManifestUrl",
    process.env.PUZZLE_EXISTING_MANIFEST_URL ??
      (hostingBaseUrl == null
        ? undefined
        : `${hostingBaseUrl}/puzzles/manifest.json`),
  );

  for (const [envName, argName] of [
    ["PUZZLE_ATTEMPTS", "attempts"],
    ["PUZZLE_BEAM", "beam"],
    ["PUZZLE_BRANCH", "branch"],
    ["PUZZLE_CANDIDATES", "candidates"],
    ["PUZZLE_DENSE", "dense"],
    ["PUZZLE_MAX_AUTO", "maxAuto"],
    ["PUZZLE_MIN_CROSS", "minCross"],
    ["PUZZLE_MIN_DENSITY", "minDensity"],
    ["PUZZLE_MIN_ENTRIES", "minEntries"],
    ["PUZZLE_MIN_MULTI", "minMulti"],
    ["PUZZLE_RETRIES", "retries"],
    ["PUZZLE_SAMPLES", "samples"],
    ["PUZZLE_SIZE", "size"],
    ["PUZZLE_WORDS", "words"],
    ["PUZZLE_WORDBANK", "wordbank"],
  ]) {
    args = ensureArg(args, argName, process.env[envName]);
  }

  return args;
}

function getAssetRoot(outDir) {
  const resolvedOutDir = path.resolve(outDir);

  if (path.basename(resolvedOutDir) === "puzzles") {
    return path.dirname(resolvedOutDir);
  }

  return resolvedOutDir;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const generatorArgs = getGeneratorArgs(options);
  const outDir = getArgValue(generatorArgs, "outDir") ?? "public/puzzles";
  const manifestPath = path.join(outDir, "manifest.json");
  const publicDir = getAssetRoot(outDir);

  if (!options.skipGenerate) {
    await runNode("server/batch/generate-puzzle-pack.mjs", generatorArgs);
  }

  if (!options.skipValidate) {
    await runNode("scripts/validate-puzzle-pack.mjs", [
      `--manifest=${manifestPath}`,
      `--assetRoot=${publicDir}`,
    ]);
  }

  if (!options.skipPublish) {
    const publishArgs = [`--manifest=${manifestPath}`, `--publicDir=${publicDir}`];

    if (options.dryRun) {
      publishArgs.push("--dryRun");
    }

    await runNode("server/batch/publish-puzzle-pack.mjs", publishArgs);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
