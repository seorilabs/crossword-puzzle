import { spawn } from "node:child_process";
import path from "node:path";

import { resolveScheduledTheme } from "../../packages/crossword-core/src/themeRotation.ts";

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

// 발행 날짜(YYYY-MM-DD)의 요일(0=일 ~ 6=토)을 반환한다. dateKey 는 이미 해당
// 타임존 기준 달력일이라, UTC 자정 기준 요일이 그 달력일의 요일과 일치한다.
function getWeekday(dateKey) {
  const parsed = new Date(`${dateKey}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getUTCDay();
}

// 타임존 기준 시(0-23)를 반환한다. 생성기 makeSlotInfo 와 동일하게 hour12:false
// en-CA 포맷을 쓰고, 일부 런타임이 자정을 24 로 주는 경우를 24 로 정규화한다.
function getZonedHour(timeZone, date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(date);
  const raw = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  return Number.isFinite(raw) ? raw % 24 : 0;
}

// 슬롯 시작 시각을 intervalHours 경계로 내려 생성기 슬롯과 정렬한다.
function getSlotHour(timeZone, date, intervalHours) {
  const interval = intervalHours > 0 ? intervalHours : 1;
  return Math.floor(getZonedHour(timeZone, date) / interval) * interval;
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

  // 주제(테마) 명시 지정: PUZZLE_THEME/PUZZLE_THEME_LABEL 이 있으면 그대로 생성기에
  // 전달한다(themeLabel 미지정 시 생성기가 themeCategories 에서 해석). 명시 지정이
  // 없고 로테이션이 켜져 있으면 슬롯의 요일·시각으로 주제를 배정한다(#249).
  //
  // 로테이션 기본값은 off 다. 주제 단어의 검수 단서 커버리지가 아직 낮아(테마별
  // 3~5%) 주제 팩이 발행 게이트(needsManualClue<40%, validate:puzzles)를 통과하지
  // 못하기 때문이다. #250 으로 주제 검수 단서를 확대한 뒤 PUZZLE_THEME_ROTATION=1
  // 로 켜면 코드 변경 없이 활성화된다. 그 전에 켜더라도 아래 run()의 보강 경로가
  // 주제 제약을 풀어 일간 발행을 보호한다.
  args = ensureArg(args, "theme", process.env.PUZZLE_THEME);
  args = ensureArg(args, "themeLabel", process.env.PUZZLE_THEME_LABEL);

  if (
    getArgValue(args, "theme") == null &&
    readEnvBooleanWithDefault("PUZZLE_THEME_ROTATION", false)
  ) {
    const intervalHours = Number(getArgValue(args, "intervalHours") ?? "2");
    const rotationTheme = resolveScheduledTheme({
      weekday: getWeekday(getDateKey(timeZone, seedDate)),
      slotHour: getSlotHour(timeZone, seedDate, intervalHours),
    });

    if (rotationTheme != null) {
      console.log(
        `[theme-rotation] assigning theme=${rotationTheme} for slot date=${getDateKey(timeZone, seedDate)} weekday=${getWeekday(getDateKey(timeZone, seedDate))}`,
      );
      args = ensureArg(args, "theme", rotationTheme);
    }
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

// 로테이션으로 주제가 자동 배정된 인자에서 주제 제약을 제거한 사본을 만든다(#249).
function stripThemeArgs(args) {
  return args.filter(
    (arg) => !arg.startsWith("--theme=") && !arg.startsWith("--themeLabel="),
  );
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const generatorArgs = getGeneratorArgs(options);
  const outDir = getArgValue(generatorArgs, "outDir") ?? "public/puzzles";
  const manifestPath = path.join(outDir, "manifest.json");
  const publicDir = getAssetRoot(outDir);

  // 생성 → 검증을 하나의 단위로 실행한다. 주제 슬롯은 후보 부족(빈 풀)뿐 아니라
  // 검수 단서 비율 게이트(#250 대상)로 검증에서 걸릴 수 있어, 둘 중 어느 단계가
  // 실패하든 같은 보강 경로로 처리하려면 검증을 try 안에 둬야 한다.
  async function generateThenValidate(args) {
    if (!options.skipGenerate) {
      await runNode("server/batch/generate-puzzle-pack.mjs", args);
    }
    if (!options.skipValidate) {
      await runNode("scripts/validate-puzzle-pack.mjs", [
        `--manifest=${manifestPath}`,
        `--assetRoot=${publicDir}`,
      ]);
    }
  }

  // 로테이션이 자동 배정한 주제만 보강 대상이다. 명시 지정(PUZZLE_THEME)으로
  // 실패한 경우는 의도된 실패이므로 그대로 전파한다.
  const themeInjectedByRotation =
    (process.env.PUZZLE_THEME == null || process.env.PUZZLE_THEME === "") &&
    getArgValue(generatorArgs, "theme") != null;

  try {
    await generateThenValidate(generatorArgs);
  } catch (error) {
    if (!themeInjectedByRotation) {
      throw error;
    }

    // 주제 제약으로 생성/검증이 실패하면, 일간 발행이 끊기지 않도록 주제를 풀고
    // 한 번 더 생성·검증한다(보강). 검수 단서 커버리지가 오르면(#250) 이 폴백 없이
    // 주제 퍼즐이 그대로 발행된다.
    console.warn(
      `[theme-rotation] themed pack failed (${error.message}); retrying without theme constraint to keep the daily pack published.`,
    );
    await generateThenValidate(stripThemeArgs(generatorArgs));
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
