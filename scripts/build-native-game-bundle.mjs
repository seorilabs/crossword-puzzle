#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { build as viteBuild } from "vite";

export const NATIVE_GAME_ASSET_MANIFEST = "asset-manifest.json";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultBundleDirectory = join(repositoryRoot, "apps/mobile/game-bundle");
const nativeGameViteConfig = join(repositoryRoot, "vite.native-game.config.ts");
const pinnedPhaserModulePath = join(
  repositoryRoot,
  "node_modules/phaser/dist/phaser.esm.js",
)
  .split(sep)
  .join("/");
const executableTextExtensions = new Set([
  ".cjs",
  ".htm",
  ".html",
  ".js",
  ".mjs",
]);
const htmlExtensions = new Set([".htm", ".html"]);
const phaserDynamicGlobalFallback =
  /return this \|\| new Function\((["'])return this\1\)\(\);/gu;

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sanitizePhaserForNativeWebView(source) {
  let replacementCount = 0;
  const code = source.replace(phaserDynamicGlobalFallback, () => {
    replacementCount += 1;
    return "return this || globalThis;";
  });
  if (replacementCount !== 1) {
    throw new Error(
      `expected exactly one Phaser dynamic global fallback, found ${replacementCount}`,
    );
  }
  return code;
}

function phaserNativeWebViewCspPlugin() {
  return {
    name: "crossword-phaser-native-webview-csp",
    enforce: "pre",
    transform(source, id) {
      const modulePath = id.split("?", 1)[0].replaceAll("\\", "/");
      if (modulePath !== pinnedPhaserModulePath) {
        return null;
      }

      return { code: sanitizePhaserForNativeWebView(source), map: null };
    },
  };
}

function bytewisePathCompare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function normalizedRelativePath(root, path) {
  const normalized = relative(root, path).split(sep).join("/");
  if (
    normalized === "" ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("\0") ||
    normalized.includes("\n") ||
    normalized.includes("\r")
  ) {
    throw new Error(`invalid bundle asset path: ${normalized || "<empty>"}`);
  }
  return normalized;
}

async function listBundleFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    const assetPath = normalizedRelativePath(root, path);

    if (entry.isSymbolicLink()) {
      throw new Error(
        `symbolic links are forbidden in native game bundle: ${assetPath}`,
      );
    }
    if (entry.isDirectory()) {
      files.push(...(await listBundleFiles(root, path)));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`unsupported native game bundle entry: ${assetPath}`);
    }
    if (assetPath !== NATIVE_GAME_ASSET_MANIFEST) {
      files.push({ path, assetPath });
    }
  }

  return files;
}

function extensionOf(assetPath) {
  const match = /(?:^|\/)(?:[^/]+)(\.[^./]+)$/.exec(assetPath);
  return match?.[1]?.toLowerCase() ?? "";
}

function assertNoDynamicCode(assetPath, content) {
  if (/(^|[^\w$])eval\s*\(/u.test(content)) {
    throw new Error(`${assetPath}: eval(...) is forbidden`);
  }
  if (/\bnew\s+Function\s*\(/u.test(content)) {
    throw new Error(`${assetPath}: new Function(...) is forbidden`);
  }
}

function assertNoRemoteScripts(assetPath, content) {
  const scriptTagPattern = /<script\b[^>]*>/giu;
  const sourceAttributePattern =
    /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/iu;
  let scriptTag;

  while ((scriptTag = scriptTagPattern.exec(content)) != null) {
    const sourceMatch = sourceAttributePattern.exec(scriptTag[0]);
    const source = (
      sourceMatch?.[1] ??
      sourceMatch?.[2] ??
      sourceMatch?.[3]
    )?.trim();
    if (source != null && /^(?:https?:)?\/\//iu.test(source)) {
      throw new Error(
        `${assetPath}: remote script source is forbidden (${source})`,
      );
    }
  }
}

function assertAssetSecurity(assetPath, content) {
  const extension = extensionOf(assetPath);
  if (executableTextExtensions.has(extension)) {
    assertNoDynamicCode(assetPath, content.toString("utf8"));
  }
  if (htmlExtensions.has(extension)) {
    assertNoRemoteScripts(assetPath, content.toString("utf8"));
  }
}

function createAggregateChecksum(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.path, "utf8");
    hash.update("\0", "utf8");
    hash.update(String(file.bytes), "utf8");
    hash.update("\0", "utf8");
    hash.update(file.sha256, "utf8");
    hash.update("\n", "utf8");
  }
  return `sha256:${hash.digest("hex")}`;
}

export async function createNativeGameAssetManifest(bundleDirectory) {
  const bundleStats = await stat(bundleDirectory).catch(() => null);
  if (bundleStats == null || !bundleStats.isDirectory()) {
    throw new Error(
      `native game bundle directory is unavailable: ${bundleDirectory}`,
    );
  }

  const bundleFiles = await listBundleFiles(bundleDirectory);
  if (!bundleFiles.some((file) => file.assetPath === "index.html")) {
    throw new Error("native game bundle is missing index.html");
  }

  const files = [];
  for (const file of bundleFiles) {
    const content = await readFile(file.path);
    assertAssetSecurity(file.assetPath, content);
    files.push({
      path: file.assetPath,
      bytes: content.byteLength,
      sha256: sha256Hex(content),
    });
  }
  files.sort((left, right) => bytewisePathCompare(left.path, right.path));

  return {
    schemaVersion: 1,
    algorithm: "sha256",
    aggregateFormat: "path\\0bytes\\0sha256\\n",
    aggregateChecksum: createAggregateChecksum(files),
    files,
  };
}

export function serializeNativeGameAssetManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export async function writeNativeGameAssetManifest(bundleDirectory) {
  const manifest = await createNativeGameAssetManifest(bundleDirectory);
  await writeFile(
    join(bundleDirectory, NATIVE_GAME_ASSET_MANIFEST),
    serializeNativeGameAssetManifest(manifest),
    "utf8",
  );
  return manifest;
}

export async function checkNativeGameAssetManifest(bundleDirectory) {
  const manifestPath = join(bundleDirectory, NATIVE_GAME_ASSET_MANIFEST);
  const actual = await readFile(manifestPath, "utf8").catch(() => null);
  if (actual == null) {
    throw new Error(
      `native game asset manifest is unavailable: ${manifestPath}`,
    );
  }

  const expectedManifest = await createNativeGameAssetManifest(bundleDirectory);
  const expected = serializeNativeGameAssetManifest(expectedManifest);
  if (actual !== expected) {
    throw new Error(
      "native game asset manifest does not match bundle contents; rebuild the bundle",
    );
  }
  return expectedManifest;
}

export async function buildNativeGameBundle() {
  await viteBuild({
    configFile: nativeGameViteConfig,
    plugins: [phaserNativeWebViewCspPlugin()],
  });
  const manifest = await writeNativeGameAssetManifest(defaultBundleDirectory);
  await checkNativeGameAssetManifest(defaultBundleDirectory);
  return manifest;
}

async function main() {
  const command = process.argv[2] ?? "build";
  let manifest;

  if (command === "build") {
    manifest = await buildNativeGameBundle();
  } else if (command === "check") {
    manifest = await checkNativeGameAssetManifest(defaultBundleDirectory);
  } else {
    throw new Error(`unknown command: ${command}; expected build or check`);
  }

  console.log(
    `[native-game-bundle] ${command} passed: ${manifest.files.length} files, ${manifest.aggregateChecksum}`,
  );
}

const invokedPath = process.argv[1] == null ? null : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[native-game-bundle] ${message}`);
    process.exitCode = 1;
  });
}
