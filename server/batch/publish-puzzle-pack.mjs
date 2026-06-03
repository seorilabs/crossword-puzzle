import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { gzipSync } from "node:zlib";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

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
    {
      glob: "/puzzle-stats/**",
      headers,
    },
  ];
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
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
    // Fall back to local gcloud ADC below.
  }

  try {
    const { stdout } = await execFileAsync("gcloud", [
      "auth",
      "application-default",
      "print-access-token",
    ]);
    const token = stdout.trim();

    if (token) {
      return token;
    }
  } catch (error) {
    throw new Error(
      `Could not resolve Google access token. Set GOOGLE_OAUTH_ACCESS_TOKEN or run gcloud ADC. ${error.message}`,
    );
  }

  throw new Error("Could not resolve Google access token.");
}

async function requestJson(url, { method = "GET", token, body } = {}) {
  const response = await fetch(url, {
    method,
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

async function deployHosting({ options, token }) {
  if (!options.project) {
    throw new Error("Missing --project or FIREBASE_PROJECT_ID.");
  }

  if (!options.site) {
    throw new Error("Missing --site or FIREBASE_HOSTING_SITE.");
  }

  const files = await collectFiles(options.publicDir);

  if (files.length === 0) {
    throw new Error(`No hosting files found in ${options.publicDir}.`);
  }

  const version = await requestJson(
    `https://firebasehosting.googleapis.com/v1beta1/sites/${encodeURIComponent(
      options.site,
    )}/versions`,
    {
      body: {
        config: {
          headers: getPuzzleHostingHeaders(options),
        },
      },
      method: "POST",
      token,
    },
  );
  const versionName = version.name;
  const filesByHash = new Map(files.map((file) => [file.hash, file]));

  for (const filesChunk of chunk(files, 1000)) {
    const populate = await requestJson(
      `https://firebasehosting.googleapis.com/v1beta1/${versionName}:populateFiles`,
      {
        body: {
          files: Object.fromEntries(
            filesChunk.map((file) => [file.path, file.hash]),
          ),
        },
        method: "POST",
        token,
      },
    );

    for (const hash of populate.uploadRequiredHashes ?? []) {
      const file = filesByHash.get(hash);

      if (file == null) {
        throw new Error(`Hosting API requested unknown hash: ${hash}`);
      }

      await uploadHostingFile(populate.uploadUrl, file, token);
    }
  }

  await requestJson(
    `https://firebasehosting.googleapis.com/v1beta1/${versionName}?update_mask=status`,
    {
      body: { status: "FINALIZED" },
      method: "PATCH",
      token,
    },
  );

  const releaseParams = new URLSearchParams({ versionName });
  const release = await requestJson(
    `https://firebasehosting.googleapis.com/v1beta1/sites/${encodeURIComponent(
      options.site,
    )}/releases?${releaseParams.toString()}`,
    {
      body: {},
      method: "POST",
      token,
    },
  );

  console.log(`Deployed Firebase Hosting release: ${release.name}`);
  console.log(`Hosting URL: ${options.hostingBaseUrl}`);
  return release;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await readJson(path.resolve(options.manifest));

  if (options.dryRun) {
    const files = await collectFiles(options.publicDir);
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

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
