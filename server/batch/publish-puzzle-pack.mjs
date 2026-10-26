import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { gzipSync } from "node:zlib";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const execFileAsync = promisify(execFile);

const DEFAULT_OPTIONS = {
  corsOrigin: "*",
  manifest: "public/puzzles/manifest.json",
  publicDir: "public",
};

function readEnvBoolean(name) {
  const value = process.env[name];
  return value === "1" || value === "true";
}

function parseArgs(argv) {
  const options = {
    ...DEFAULT_OPTIONS,
    corsOrigin: process.env.PUZZLE_CORS_ORIGIN ?? DEFAULT_OPTIONS.corsOrigin,
    dryRun: readEnvBoolean("PUZZLE_PUBLISH_DRY_RUN"),
    hostingBaseUrl: process.env.PUZZLE_HOSTING_BASE_URL,
    manifest: process.env.PUZZLE_MANIFEST_PATH ?? DEFAULT_OPTIONS.manifest,
    project:
      process.env.FIREBASE_PROJECT_ID ??
      process.env.GOOGLE_CLOUD_PROJECT ??
      process.env.GCLOUD_PROJECT,
    publicDir: process.env.PUZZLE_PUBLIC_DIR ?? DEFAULT_OPTIONS.publicDir,
    site: process.env.FIREBASE_HOSTING_SITE,
    skipHosting: readEnvBoolean("PUZZLE_SKIP_HOSTING"),
  };

  for (const arg of argv) {
    const [key, rawValue] = arg.replace(/^--/, "").split("=");

    if (key === "corsOrigin" && rawValue) options.corsOrigin = rawValue;
    if (key === "dryRun") options.dryRun = true;
    if (key === "hostingBaseUrl" && rawValue) options.hostingBaseUrl = rawValue;
    if (key === "manifest" && rawValue) options.manifest = rawValue;
    if (key === "project" && rawValue) options.project = rawValue;
    if (key === "publicDir" && rawValue) options.publicDir = rawValue;
    if (key === "site" && rawValue) options.site = rawValue;
    if (key === "skipHosting") options.skipHosting = true;
    if (key === "expectedRelease" && rawValue)
      options.expectedRelease = rawValue;
  }

  if (options.site != null && options.hostingBaseUrl == null) {
    options.hostingBaseUrl = `https://${options.site}.web.app`;
  }

  return options;
}

function getPuzzleHostingHeaders(options) {
  const headers = {
    "Cache-Control": "public, max-age=300, s-maxage=300",
  };
  const corsOrigin = options.corsOrigin?.trim();

  if (corsOrigin) {
    headers["Access-Control-Allow-Origin"] = corsOrigin;
  }

  return [
    {
      glob: "/puzzles/**",
      headers,
    },
  ];
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function getAccessToken() {
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
    // Local execution uses the registered automation wrapper below.
  }

  try {
    const { stdout } = await execFileAsync(
      path.join(homedir(), ".config/seorilabs/scripts/gcloud-cli.sh"),
      ["auth", "print-access-token"],
    );
    const token = stdout.trim();

    if (token) {
      return token;
    }
  } catch (error) {
    throw new Error(
      `Could not resolve Google access token. Set GOOGLE_OAUTH_ACCESS_TOKEN or configure the registered gcloud wrapper. ${error.message}`,
    );
  }

  throw new Error("Could not resolve Google access token.");
}

async function requestJson(url, { method = "GET", token, body } = {}) {
  const response = await fetch(url, {
    method,
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body == null ? {} : { "Content-Type": "application/json" }),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${method} ${url} failed with ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function collectFiles(rootDir) {
  const root = path.resolve(rootDir);
  const files = [];

  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }

      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const bytes = await readFile(entryPath);
      const gzipped = gzipSync(bytes);
      const hash = createHash("sha256").update(gzipped).digest("hex");
      const relativePath = `/${path.relative(root, entryPath).split(path.sep).join("/")}`;

      files.push({
        bytes,
        gzipped,
        hash,
        path: relativePath,
      });
    }
  }

  await walk(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function uploadHostingFile(uploadUrl, file, token) {
  const response = await fetch(`${uploadUrl}/${file.hash}`, {
    body: file.gzipped,
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    method: "POST",
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Hosting upload failed for ${file.path}: ${response.status} ${text}`,
    );
  }
}

const HOSTING_API = "https://firebasehosting.googleapis.com/v1beta1";

export async function getLiveHostingRelease({ site, token }) {
  if (!site) throw new Error("Missing Firebase Hosting site");
  const channel = await requestJson(
    `${HOSTING_API}/sites/${encodeURIComponent(site)}/channels/live`,
    { token },
  );
  const release = channel.release;
  if (!release?.name || !release.version?.name)
    throw new Error(
      "Existing live Hosting release is required; refusing an empty replacement",
    );
  return release;
}

async function assertPublishedLanguagePuzzlesUnchanged({
  versionName,
  files,
  token,
}) {
  const staged = new Map(files.map((file) => [file.path, file.hash]));
  let pageToken;
  do {
    const query = new URLSearchParams({ status: "ACTIVE", pageSize: "1000" });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await requestJson(
      `${HOSTING_API}/${versionName}/files?${query}`,
      { token },
    );
    for (const file of page.files ?? []) {
      if (
        /^\/puzzles\/(ko|en)\/\1-\d{8}-[1-5]\.json$/.test(file.path) &&
        staged.has(file.path) &&
        staged.get(file.path) !== file.hash
      )
        throw new Error(
          `Refusing to replace an issued language puzzle: ${file.path}`,
        );
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
}

async function cloneLiveVersion({ site, sourceVersion, token }) {
  let operation = await requestJson(
    `${HOSTING_API}/sites/${encodeURIComponent(site)}/versions:clone`,
    { method: "POST", token, body: { sourceVersion, finalize: false } },
  );
  const deadline = Date.now() + 120000;
  while (!operation.done) {
    if (!operation.name || Date.now() >= deadline)
      throw new Error("Hosting clone operation did not finish");
    operation = await requestJson(`${HOSTING_API}/${operation.name}`, {
      token,
    });
    if (!operation.done) await sleep(1000);
  }
  if (operation.error)
    throw new Error(
      `Hosting clone failed: ${operation.error.message ?? operation.error.code}`,
    );
  const version = operation.response;
  if (!version?.name || version.status !== "CREATED")
    throw new Error("Hosting clone did not return a writable CREATED version");
  return version;
}

function mergeHostingConfig(config, options) {
  const puzzleHeader = getPuzzleHostingHeaders(options)[0];
  const existing = config.headers ?? [];
  const previous = existing
    .filter((header) => header.glob === puzzleHeader.glob)
    .reduce(
      (combined, header) => ({
        ...combined,
        ...header,
        headers: { ...combined.headers, ...header.headers },
      }),
      {},
    );
  const headers = existing.filter(
    (header) => header.glob !== puzzleHeader.glob,
  );
  headers.push({
    ...previous,
    ...puzzleHeader,
    headers: { ...previous?.headers, ...puzzleHeader.headers },
  });
  return { ...config, headers };
}

export async function deployHosting({ options, token }) {
  if (!options.project)
    throw new Error("Missing --project or FIREBASE_PROJECT_ID.");
  if (!options.site)
    throw new Error("Missing --site or FIREBASE_HOSTING_SITE.");

  // This publisher owns puzzle content only. Bundled web assets must never replace
  // newer live assets merely because they were copied into the job image.
  const files = (await collectFiles(options.publicDir)).filter((file) =>
    file.path.startsWith("/puzzles/"),
  );
  if (!files.length)
    throw new Error(`No puzzle hosting files found in ${options.publicDir}.`);
  const baseline = await getLiveHostingRelease({ site: options.site, token });
  if (options.expectedRelease && options.expectedRelease !== baseline.name)
    throw new Error("Hosting live release changed during puzzle generation");
  const previous = await requestJson(
    `${HOSTING_API}/${baseline.version.name}`,
    { token },
  );
  if (previous.status !== "FINALIZED" || !previous.config)
    throw new Error(
      "Cannot preserve the current finalized Hosting configuration",
    );

  await assertPublishedLanguagePuzzlesUnchanged({
    versionName: baseline.version.name,
    files,
    token,
  });

  // clone(finalize:false) retains every published file. Populate only the staged
  // puzzle changes, then expose all changes with a single releases.create call.
  const version = await cloneLiveVersion({
    site: options.site,
    sourceVersion: baseline.version.name,
    token,
  });
  const versionName = version.name;
  await requestJson(`${HOSTING_API}/${versionName}?update_mask=config`, {
    method: "PATCH",
    token,
    body: { config: mergeHostingConfig(previous.config, options) },
  });
  const filesByHash = new Map(files.map((file) => [file.hash, file]));
  for (const filesChunk of chunk(files, 1000)) {
    const populate = await requestJson(
      `${HOSTING_API}/${versionName}:populateFiles`,
      {
        method: "POST",
        token,
        body: {
          files: Object.fromEntries(
            filesChunk.map((file) => [file.path, file.hash]),
          ),
        },
      },
    );
    for (const hash of populate.uploadRequiredHashes ?? []) {
      const file = filesByHash.get(hash);
      if (!file) throw new Error(`Hosting API requested unknown hash: ${hash}`);
      await uploadHostingFile(populate.uploadUrl, file, token);
    }
  }
  await requestJson(`${HOSTING_API}/${versionName}?update_mask=status`, {
    method: "PATCH",
    token,
    body: { status: "FINALIZED" },
  });
  const current = await getLiveHostingRelease({ site: options.site, token });
  if (current.name !== baseline.name)
    throw new Error(
      "Hosting live release changed before publication; staged version was not released",
    );
  const release = await requestJson(
    `${HOSTING_API}/sites/${encodeURIComponent(options.site)}/releases?${new URLSearchParams({ versionName })}`,
    { method: "POST", token, body: {} },
  );
  console.log(`Deployed Firebase Hosting release: ${release.name}`);
  console.log(`Previous Hosting version: ${baseline.version.name}`);
  console.log(`Hosting URL: ${options.hostingBaseUrl}`);
  return release;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await readJson(path.resolve(options.manifest));

  if (options.dryRun) {
    const files = (await collectFiles(options.publicDir)).filter((file) =>
      file.path.startsWith("/puzzles/"),
    );
    console.log("Dry run: puzzle pack publish plan");
    console.log(`Project: ${options.project ?? "(not set)"}`);
    console.log(`Hosting site: ${options.site ?? "(not set)"}`);
    console.log(
      `Hosting files: ${files.length} from ${path.resolve(options.publicDir)}`,
    );
    console.log(`CORS origin: ${options.corsOrigin || "(not set)"}`);
    console.log(`Puzzle count: ${manifest.puzzles?.length ?? 0}`);
    return;
  }

  const token = await getAccessToken();

  if (!options.skipHosting) {
    await deployHosting({ options, token });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
