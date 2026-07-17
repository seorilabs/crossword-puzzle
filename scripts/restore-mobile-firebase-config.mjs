#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const requireConfig = args.has("--require");
const restoreAndroid = args.has("--android") || args.has("--all");
const restoreIos = args.has("--ios") || args.has("--all");

if (!restoreAndroid && !restoreIos) {
  console.error(
    "Usage: node scripts/restore-mobile-firebase-config.mjs --android|--ios|--all [--require]",
  );
  process.exit(1);
}

function decodeBase64Env(name) {
  const value = process.env[name]?.trim();
  if (value == null || value === "") {
    if (requireConfig) {
      throw new Error(`${name} is required.`);
    }
    return null;
  }

  return Buffer.from(value, "base64");
}

function writeConfig(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(`Restored ${path}`);
}

function readPlistString(text, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `<key>\\s*${escapedKey}\\s*</key>\\s*<string>\\s*([^<]+?)\\s*</string>`,
    "s",
  ).exec(text);

  return match?.[1]?.trim() ?? null;
}

if (restoreAndroid) {
  const content = decodeBase64Env(
    "FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64",
  );
  if (content != null) {
    const parsed = JSON.parse(content.toString("utf8"));
    const packageName =
      parsed.client?.[0]?.client_info?.android_client_info?.package_name;
    if (packageName !== "com.seorilabs.crosswordpuzzle") {
      throw new Error(`google-services.json package mismatch: ${packageName}`);
    }
    writeConfig(
      join(root, "apps/mobile/android/app/google-services.json"),
      content,
    );
  }
}

if (restoreIos) {
  const content = decodeBase64Env(
    "FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64",
  );
  if (content != null) {
    const text = content.toString("utf8");
    const bundleId = readPlistString(text, "BUNDLE_ID");
    if (bundleId !== "com.seorilabs.crosswordpuzzle") {
      throw new Error("GoogleService-Info.plist bundle ID mismatch.");
    }
    writeConfig(
      join(
        root,
        "apps/mobile/ios/CrosswordPuzzleMobile/GoogleService-Info.plist",
      ),
      content,
    );
  }
}
