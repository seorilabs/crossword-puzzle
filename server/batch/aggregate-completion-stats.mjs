import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_OPTIONS = {
  analyticsDataset: process.env.FIREBASE_ANALYTICS_DATASET,
  analyticsTablePattern:
    process.env.FIREBASE_ANALYTICS_TABLE_PATTERN ?? "events_*",
  corsOrigin: process.env.PUZZLE_CORS_ORIGIN ?? "*",
  dryRun: readEnvBoolean("STATS_DRY_RUN"),
  fromSuffix: process.env.STATS_FROM_SUFFIX,
  hostingBaseUrl: process.env.PUZZLE_HOSTING_BASE_URL,
  location: process.env.BIGQUERY_LOCATION ?? "asia-southeast3",
  lookbackDays: Number(process.env.STATS_LOOKBACK_DAYS ?? 14),
  manifestPath: process.env.STATS_MANIFEST_PATH,
  manifestUrl: process.env.STATS_MANIFEST_URL,
  outputPath: process.env.STATS_OUTPUT_PATH,
  project:
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT,
  publicDir: process.env.STATS_PUBLIC_DIR ?? "public",
  site: process.env.FIREBASE_HOSTING_SITE,
  skipHydrate: readEnvBoolean("STATS_SKIP_HYDRATE"),
  skipPublish: readEnvBoolean("STATS_SKIP_PUBLISH"),
  skipQuery: readEnvBoolean("STATS_SKIP_QUERY"),
  sourceProject:
    process.env.BIGQUERY_SOURCE_PROJECT ??
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT,
  toSuffix: process.env.STATS_TO_SUFFIX,
};

function readEnvBoolean(name) {
  const value = process.env[name];
  return value === "1" || value === "true";
}

function parseArgs(argv) {
  const options = { ...DEFAULT_OPTIONS };

  for (const arg of argv) {
    const [key, rawValue] = arg.replace(/^--/, "").split("=");
    const numericValue = Number(rawValue);

    if (key === "analyticsDataset" && rawValue) {
      options.analyticsDataset = rawValue;
    }
    if (key === "analyticsTablePattern" && rawValue) {
      options.analyticsTablePattern = rawValue;
    }
    if (key === "corsOrigin" && rawValue) {
      options.corsOrigin = rawValue;
    }
    if (key === "dryRun") {
      options.dryRun = true;
    }
    if (key === "fromSuffix" && rawValue) {
      options.fromSuffix = rawValue;
    }
    if (key === "hostingBaseUrl" && rawValue) {
      options.hostingBaseUrl = rawValue;
    }
    if (key === "location" && rawValue) {
      options.location = rawValue;
    }
    if (key === "lookbackDays" && Number.isFinite(numericValue)) {
      options.lookbackDays = numericValue;
    }
    if (key === "manifest" && rawValue) {
      options.manifestPath = rawValue;
    }
    if (key === "manifestUrl" && rawValue) {
      options.manifestUrl = rawValue;
    }
    if (key === "output" && rawValue) {
      options.outputPath = rawValue;
    }
    if (key === "project" && rawValue) {
      options.project = rawValue;
    }
    if (key === "publicDir" && rawValue) {
      options.publicDir = rawValue;
    }
    if (key === "site" && rawValue) {
      options.site = rawValue;
    }
    if (key === "skipHydrate") {
      options.skipHydrate = true;
    }
    if (key === "skipPublish") {
      options.skipPublish = true;
    }
    if (key === "skipQuery") {
      options.skipQuery = true;
    }
    if (key === "sourceProject" && rawValue) {
      options.sourceProject = rawValue;
    }
    if (key === "toSuffix" && rawValue) {
      options.toSuffix = rawValue;
    }
  }

  if (options.site != null && options.hostingBaseUrl == null) {
    options.hostingBaseUrl = `https://${options.site}.web.app`;
  }

  if (options.manifestUrl == null && options.hostingBaseUrl != null) {
    options.manifestUrl = `${options.hostingBaseUrl.replace(
      /\/+$/,
      "",
    )}/puzzles/manifest.json`;
  }

  const publicDir = path.resolve(options.publicDir);

  return {
    ...options,
    lookbackDays: Number.isFinite(options.lookbackDays)
      ? Math.max(1, Math.round(options.lookbackDays))
      : 14,
    manifestPath:
      options.manifestPath == null
        ? path.join(publicDir, "puzzles", "manifest.json")
        : path.resolve(options.manifestPath),
    outputPath:
      options.outputPath == null
        ? path.join(publicDir, "puzzle-stats", "completions.json")
        : path.resolve(options.outputPath),
    publicDir,
  };
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.*-]+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function getDateKey(timeZone, date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone });
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function compactDateKey(dateKey) {
  return dateKey.replaceAll("-", "");
}

function getSuffixRange(options) {
  const toDateKey =
    options.toSuffix == null
      ? getDateKey("Asia/Seoul")
      : `${options.toSuffix.slice(0, 4)}-${options.toSuffix.slice(
          4,
          6,
        )}-${options.toSuffix.slice(6, 8)}`;
  const fromDateKey =
    options.fromSuffix == null
      ? addDays(toDateKey, -options.lookbackDays)
      : `${options.fromSuffix.slice(0, 4)}-${options.fromSuffix.slice(
          4,
          6,
        )}-${options.fromSuffix.slice(6, 8)}`;

  return {
    fromSuffix: options.fromSuffix ?? compactDateKey(fromDateKey),
    toSuffix: options.toSuffix ?? compactDateKey(toDateKey),
  };
}

async function readJsonOptional(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function fetchJsonOptional(url) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`Could not fetch ${url}: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn(`Could not fetch ${url}: ${error.message}`);
    return null;
  }
}

function resolvePublicPath(publicDir, filePath) {
  return path.resolve(publicDir, filePath.replace(/^\//, ""));
}

function resolveRemotePuzzleUrl(item, options) {
  if (typeof item.path !== "string") {
    return null;
  }

  if (/^https?:\/\//.test(item.path)) {
    return item.path;
  }

  if (options.hostingBaseUrl != null) {
    return new URL(item.path, options.hostingBaseUrl).toString();
  }

  if (options.manifestUrl != null) {
    return new URL(item.path, options.manifestUrl).toString();
  }

  return null;
}

async function hydrateRemotePuzzleFiles(options) {
  if (!options.skipHydrate && options.manifestUrl != null) {
    const remoteManifest = await fetchJsonOptional(options.manifestUrl);

    if (remoteManifest != null) {
      await mkdir(path.dirname(options.manifestPath), { recursive: true });
      await writeFile(
        options.manifestPath,
        `${JSON.stringify(remoteManifest, null, 2)}\n`,
      );

      for (const item of remoteManifest.puzzles ?? []) {
        const remoteUrl = resolveRemotePuzzleUrl(item, options);
        const outputPath = resolvePublicPath(options.publicDir, item.path);

        if (remoteUrl == null) {
          continue;
        }

        const puzzle = await fetchJsonOptional(remoteUrl);

        if (puzzle == null) {
          continue;
        }

        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, `${JSON.stringify(puzzle, null, 2)}\n`);
      }

      console.log(
        `Hydrated remote puzzle public files from ${options.manifestUrl}`,
      );
      return remoteManifest;
    }
  }

  return await readJsonOptional(options.manifestPath);
}

function getPuzzleIds(manifest) {
  const puzzleIds = [];
  const seen = new Set();

  for (const item of manifest?.puzzles ?? []) {
    if (typeof item.puzzleId !== "string" || seen.has(item.puzzleId)) {
      continue;
    }

    puzzleIds.push(item.puzzleId);
    seen.add(item.puzzleId);
  }

  return puzzleIds;
}

async function getAccessToken() {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) {
    return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  }

  if (process.env.GCLOUD_ACCESS_TOKEN) {
    return process.env.GCLOUD_ACCESS_TOKEN;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      {
        headers: { "Metadata-Flavor": "Google" },
        signal: controller.signal,
      },
    ).finally(() => clearTimeout(timeout));

    if (response.ok) {
      const token = await response.json();
      if (token.access_token) {
        return token.access_token;
      }
    }
  } catch {
    // Fall back to local ADC below.
  }

  throw new Error(
    "Could not resolve Google access token. Run in Cloud Run or set GOOGLE_OAUTH_ACCESS_TOKEN.",
  );
}

function parseJsonText(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestJsonResponse(url, { method = "GET", token, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body == null ? {} : { "Content-Type": "application/json" }),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();

  return {
    data: parseJsonText(text),
    ok: response.ok,
    status: response.status,
    text,
  };
}

async function requestJson(url, { method = "GET", token, body } = {}) {
  const response = await requestJsonResponse(url, { body, method, token });

  if (!response.ok) {
    throw new Error(
      `${method} ${url} failed with ${response.status}: ${response.text}`,
    );
  }

  return response.data;
}

function getTableSuffix(tableId, tablePattern) {
  const wildcardIndex = tablePattern.indexOf("*");

  if (wildcardIndex === -1) {
    return tableId === tablePattern ? "" : null;
  }

  const prefix = tablePattern.slice(0, wildcardIndex);
  const suffix = tablePattern.slice(wildcardIndex + 1);

  if (!tableId.startsWith(prefix) || !tableId.endsWith(suffix)) {
    return null;
  }

  return tableId.slice(prefix.length, tableId.length - suffix.length);
}

function getTableDateSuffix(tableId, tablePattern) {
  const suffix = getTableSuffix(tableId, tablePattern);

  if (suffix == null) {
    return null;
  }

  if (/^\d{8}$/.test(suffix)) {
    return suffix;
  }

  return /^intraday_(\d{8})$/.exec(suffix)?.[1] ?? null;
}

async function listBigQueryTables(options, token) {
  const tableIds = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(
        options.sourceProject,
      )}/datasets/${encodeURIComponent(options.analyticsDataset)}/tables`,
    );
    url.searchParams.set("maxResults", "1000");

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await requestJsonResponse(url.toString(), { token });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `GET ${url.toString()} failed with ${response.status}: ${response.text}`,
      );
    }

    for (const table of response.data?.tables ?? []) {
      const tableId = table.tableReference?.tableId;

      if (typeof tableId === "string") {
        tableIds.push(tableId);
      }
    }

    pageToken = response.data?.nextPageToken ?? "";
  } while (pageToken);

  return tableIds;
}

async function getBigQueryReadiness(options, token) {
  if (options.skipQuery) {
    return { ready: true, reason: "BigQuery query skipped." };
  }

  if (options.project == null) {
    throw new Error("Missing --project or FIREBASE_PROJECT_ID.");
  }

  if (options.analyticsDataset == null) {
    throw new Error(
      "Missing --analyticsDataset or FIREBASE_ANALYTICS_DATASET.",
    );
  }

  assertIdentifier(options.sourceProject, "sourceProject");
  assertIdentifier(options.analyticsDataset, "analyticsDataset");
  assertIdentifier(options.analyticsTablePattern, "analyticsTablePattern");

  const datasetUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(
    options.sourceProject,
  )}/datasets/${encodeURIComponent(options.analyticsDataset)}`;
  const datasetResponse = await requestJsonResponse(datasetUrl, { token });

  if (datasetResponse.status === 404) {
    return {
      ready: false,
      reason: `BigQuery dataset is not available yet: ${options.sourceProject}.${options.analyticsDataset}`,
    };
  }

  if (!datasetResponse.ok) {
    throw new Error(
      `GET ${datasetUrl} failed with ${datasetResponse.status}: ${datasetResponse.text}`,
    );
  }

  const tableIds = await listBigQueryTables(options, token);

  if (tableIds == null) {
    return {
      ready: false,
      reason: `BigQuery dataset is not available yet: ${options.sourceProject}.${options.analyticsDataset}`,
    };
  }

  const { fromSuffix, toSuffix } = getSuffixRange(options);
  const matchingTableIds = tableIds.filter((tableId) => {
    const dateSuffix = getTableDateSuffix(
      tableId,
      options.analyticsTablePattern,
    );

    return (
      dateSuffix != null && dateSuffix >= fromSuffix && dateSuffix <= toSuffix
    );
  });

  if (matchingTableIds.length === 0) {
    return {
      ready: false,
      reason: `No GA4 export tables match ${options.analyticsDataset}.${options.analyticsTablePattern} between ${fromSuffix} and ${toSuffix}.`,
    };
  }

  return {
    ready: true,
    reason: `Found ${matchingTableIds.length} GA4 export table(s): ${matchingTableIds
      .slice(0, 5)
      .join(", ")}`,
  };
}

function isBigQueryUnavailableError(error) {
  return /Not found: Dataset|Not found: Table|Wildcard table .* did not match any table/i.test(
    error.message,
  );
}

function getQuery(options, puzzleIds) {
  assertIdentifier(options.sourceProject, "sourceProject");
  assertIdentifier(options.analyticsDataset, "analyticsDataset");
  assertIdentifier(options.analyticsTablePattern, "analyticsTablePattern");

  const table = `\`${options.sourceProject}.${options.analyticsDataset}.${options.analyticsTablePattern}\``;
  const puzzleFilter =
    puzzleIds.length === 0 ? "" : "AND puzzle_id IN UNNEST(@puzzle_ids)";

  // mission_complete carries elapsed_seconds / hint_count / attempt_number as
  // GA4 event params, so we dedupe to each user's first completion per puzzle
  // and derive the median solve time, no-hint clear rate, average attempts and
  // first-try clear rate alongside the participant/completion counts.
  return `
WITH event_base AS (
  SELECT
    user_pseudo_id,
    event_name,
    TIMESTAMP_MICROS(event_timestamp) AS event_at,
    (
      SELECT COALESCE(value.string_value, CAST(value.int_value AS STRING))
      FROM UNNEST(event_params)
      WHERE key = 'puzzle_id'
      LIMIT 1
    ) AS puzzle_id,
    (
      SELECT COALESCE(value.int_value, CAST(value.double_value AS INT64), SAFE_CAST(value.string_value AS INT64))
      FROM UNNEST(event_params)
      WHERE key = 'elapsed_seconds'
      LIMIT 1
    ) AS elapsed_seconds,
    (
      SELECT COALESCE(value.int_value, CAST(value.double_value AS INT64), SAFE_CAST(value.string_value AS INT64))
      FROM UNNEST(event_params)
      WHERE key = 'hint_count'
      LIMIT 1
    ) AS hint_count,
    (
      SELECT COALESCE(value.int_value, CAST(value.double_value AS INT64), SAFE_CAST(value.string_value AS INT64))
      FROM UNNEST(event_params)
      WHERE key = 'attempt_number'
      LIMIT 1
    ) AS attempt_number
  FROM ${table}
  WHERE (
      _TABLE_SUFFIX BETWEEN @from_suffix AND @to_suffix
      OR REGEXP_EXTRACT(_TABLE_SUFFIX, r'^intraday_(\\d{8})$') BETWEEN @from_suffix AND @to_suffix
    )
    AND event_name IN ('mission_start', 'mission_complete')
),
filtered AS (
  SELECT *
  FROM event_base
  WHERE puzzle_id IS NOT NULL
    ${puzzleFilter}
),
participants AS (
  SELECT
    puzzle_id,
    COUNT(DISTINCT user_pseudo_id) AS participant_count,
    MAX(event_at) AS last_event_at
  FROM filtered
  GROUP BY puzzle_id
),
completer AS (
  SELECT
    puzzle_id,
    user_pseudo_id,
    ARRAY_AGG(elapsed_seconds IGNORE NULLS ORDER BY event_at LIMIT 1)[SAFE_OFFSET(0)] AS elapsed_seconds,
    ARRAY_AGG(hint_count IGNORE NULLS ORDER BY event_at LIMIT 1)[SAFE_OFFSET(0)] AS hint_count,
    ARRAY_AGG(attempt_number IGNORE NULLS ORDER BY event_at LIMIT 1)[SAFE_OFFSET(0)] AS attempt_number
  FROM filtered
  WHERE event_name = 'mission_complete'
  GROUP BY puzzle_id, user_pseudo_id
),
completion_agg AS (
  SELECT
    puzzle_id,
    COUNT(*) AS completion_count,
    AVG(elapsed_seconds) AS average_elapsed_seconds,
    APPROX_QUANTILES(elapsed_seconds, 2)[SAFE_OFFSET(1)] AS median_elapsed_seconds,
    SAFE_DIVIDE(COUNTIF(hint_count = 0), COUNT(*)) AS no_hint_completion_rate,
    AVG(attempt_number) AS average_attempts,
    -- attemptsUsed starts at 1 on the first attempt, so first-try clear = attempt_number 1.
    SAFE_DIVIDE(COUNTIF(attempt_number = 1), COUNT(*)) AS first_try_completion_rate
  FROM completer
  GROUP BY puzzle_id
)
SELECT
  p.puzzle_id,
  p.participant_count,
  COALESCE(c.completion_count, 0) AS completion_count,
  SAFE_DIVIDE(COALESCE(c.completion_count, 0), p.participant_count) AS completion_rate,
  c.average_elapsed_seconds,
  c.median_elapsed_seconds,
  c.no_hint_completion_rate,
  c.average_attempts,
  c.first_try_completion_rate,
  FORMAT_TIMESTAMP('%FT%TZ', p.last_event_at, 'UTC') AS last_aggregated_at
FROM participants p
LEFT JOIN completion_agg c USING (puzzle_id)
ORDER BY p.puzzle_id
`;
}

function getQueryParameters(options, puzzleIds) {
  const { fromSuffix, toSuffix } = getSuffixRange(options);
  const queryParameters = [
    {
      name: "from_suffix",
      parameterType: { type: "STRING" },
      parameterValue: { value: fromSuffix },
    },
    {
      name: "to_suffix",
      parameterType: { type: "STRING" },
      parameterValue: { value: toSuffix },
    },
  ];

  if (puzzleIds.length > 0) {
    queryParameters.push({
      name: "puzzle_ids",
      parameterType: {
        arrayType: { type: "STRING" },
        type: "ARRAY",
      },
      parameterValue: {
        arrayValues: puzzleIds.map((puzzleId) => ({ value: puzzleId })),
      },
    });
  }

  return queryParameters;
}

async function getQueryResults({ initialResult, options, token }) {
  let result = initialResult;
  const jobId = result.jobReference?.jobId;
  const queryProject = result.jobReference?.projectId ?? options.project;

  while (!result.jobComplete) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    result = await requestJson(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(
        queryProject,
      )}/queries/${encodeURIComponent(jobId)}?location=${encodeURIComponent(
        options.location,
      )}`,
      { token },
    );
  }

  const rows = [...(result.rows ?? [])];
  let pageToken = result.pageToken;

  while (pageToken) {
    const nextPage = await requestJson(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(
        queryProject,
      )}/queries/${encodeURIComponent(jobId)}?location=${encodeURIComponent(
        options.location,
      )}&pageToken=${encodeURIComponent(pageToken)}`,
      { token },
    );
    rows.push(...(nextPage.rows ?? []));
    pageToken = nextPage.pageToken;
  }

  return {
    rows,
    schema: result.schema,
  };
}

function optionalNonNegative(key, rawValue) {
  if (rawValue == null) {
    return {};
  }

  const value = Number(rawValue);
  return Number.isFinite(value) && value >= 0 ? { [key]: value } : {};
}

function optionalRatio(key, rawValue) {
  if (rawValue == null) {
    return {};
  }

  const value = Number(rawValue);
  return Number.isFinite(value)
    ? { [key]: Math.max(0, Math.min(1, value)) }
    : {};
}

function parseBigQueryRows({ rows, schema }) {
  const fieldNames = schema?.fields?.map((field) => field.name) ?? [];

  return rows
    .map((row) =>
      Object.fromEntries(
        fieldNames.map((fieldName, index) => [fieldName, row.f[index]?.v]),
      ),
    )
    .map((row) => {
      const participantCount = Math.max(
        0,
        Math.round(Number(row.participant_count)),
      );
      const completionCount = Math.max(
        0,
        Math.round(Number(row.completion_count)),
      );
      const completionRate = Number(row.completion_rate);

      return {
        completionCount,
        completionRate: Number.isFinite(completionRate)
          ? Math.max(0, Math.min(1, completionRate))
          : 0,
        lastAggregatedAt: String(row.last_aggregated_at),
        participantCount,
        puzzleId: String(row.puzzle_id),
        ...optionalNonNegative(
          "averageElapsedSeconds",
          row.average_elapsed_seconds,
        ),
        ...optionalNonNegative(
          "medianElapsedSeconds",
          row.median_elapsed_seconds,
        ),
        ...optionalRatio("noHintCompletionRate", row.no_hint_completion_rate),
        ...optionalNonNegative("averageAttempts", row.average_attempts),
        ...optionalRatio(
          "firstTryCompletionRate",
          row.first_try_completion_rate,
        ),
      };
    })
    .filter((entry) => entry.puzzleId !== "null");
}

async function queryCompletionStats(options, puzzleIds, token) {
  if (options.skipQuery) {
    return [];
  }

  if (options.project == null) {
    throw new Error("Missing --project or FIREBASE_PROJECT_ID.");
  }

  if (options.analyticsDataset == null) {
    throw new Error(
      "Missing --analyticsDataset or FIREBASE_ANALYTICS_DATASET.",
    );
  }

  const accessToken = token ?? (await getAccessToken());
  const initialResult = await requestJson(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(
      options.project,
    )}/queries`,
    {
      body: {
        location: options.location,
        query: getQuery(options, puzzleIds),
        queryParameters: getQueryParameters(options, puzzleIds),
        timeoutMs: 10000,
        useLegacySql: false,
      },
      method: "POST",
      token: accessToken,
    },
  );
  const result = await getQueryResults({
    initialResult,
    options,
    token: accessToken,
  });
  return parseBigQueryRows(result);
}

async function writeStats(options, stats, puzzleIds) {
  const order = new Map(puzzleIds.map((puzzleId, index) => [puzzleId, index]));
  const sortedStats = [...stats].sort((left, right) => {
    const leftIndex = order.get(left.puzzleId) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = order.get(right.puzzleId) ?? Number.MAX_SAFE_INTEGER;

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.puzzleId.localeCompare(right.puzzleId);
  });
  const payload = {
    generatedAt: new Date().toISOString(),
    stats: sortedStats,
  };

  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote completion stats: ${options.outputPath}`);
}

async function runPublish(options) {
  if (options.skipPublish) {
    return;
  }

  const args = [
    "server/batch/publish-puzzle-pack.mjs",
    `--manifest=${options.manifestPath}`,
    `--publicDir=${options.publicDir}`,
    `--corsOrigin=${options.corsOrigin}`,
  ];

  if (options.dryRun) {
    args.push("--dryRun");
  }

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit" });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`publish-puzzle-pack exited with code ${code}`));
    });
  });
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await hydrateRemotePuzzleFiles(options);
  const puzzleIds = getPuzzleIds(manifest);
  const token = options.skipQuery ? null : await getAccessToken();
  const readiness = await getBigQueryReadiness(options, token);

  if (!readiness.ready) {
    console.log(`Completion stats skipped: ${readiness.reason}`);
    return;
  }

  console.log(`Completion stats BigQuery ready: ${readiness.reason}`);

  let stats;

  try {
    stats = await queryCompletionStats(options, puzzleIds, token);
  } catch (error) {
    if (isBigQueryUnavailableError(error)) {
      console.log(`Completion stats skipped: ${error.message}`);
      return;
    }

    throw error;
  }

  await writeStats(options, stats, puzzleIds);
  await runPublish(options);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
