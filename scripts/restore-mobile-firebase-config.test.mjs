import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = fileURLToPath(
  new URL("./restore-mobile-firebase-config.mjs", import.meta.url),
);
const expectedPackage = "com.seorilabs.crosswordpuzzle";
const androidConfigPath = "apps/mobile/android/app/google-services.json";
const iosConfigPath =
  "apps/mobile/ios/CrosswordPuzzleMobile/GoogleService-Info.plist";

function cleanEnvironment(overrides = {}) {
  const environment = { ...process.env };
  delete environment.FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64;
  delete environment.FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64;
  return { ...environment, ...overrides };
}

function withTemporaryRoot(run) {
  const root = mkdtempSync(join(tmpdir(), "crossword-firebase-restore-test-"));

  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function restore(root, args, environment = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    env: cleanEnvironment(environment),
    encoding: "utf8",
  });
}

function encode(value) {
  return Buffer.from(value).toString("base64");
}

function androidConfig(packageName) {
  return JSON.stringify({
    client: [
      {
        client_info: {
          android_client_info: { package_name: packageName },
        },
      },
    ],
  });
}

function iosConfig(bundleId, unrelatedValue = "fixture") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>BUNDLE_ID</key>
  <string>${bundleId}</string>
  <key>UNRELATED</key>
  <string>${unrelatedValue}</string>
</dict>
</plist>`;
}

test("restores Android config only for the expected package", () => {
  withTemporaryRoot((root) => {
    const content = androidConfig(expectedPackage);
    const result = restore(root, ["--android", "--require"], {
      FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64: encode(content),
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(root, androidConfigPath), "utf8"), content);
  });
});

test("rejects Android config for a different package", () => {
  withTemporaryRoot((root) => {
    const result = restore(root, ["--android", "--require"], {
      FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64: encode(
        androidConfig("com.invalid.crossword"),
      ),
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /package mismatch/);
    assert.equal(existsSync(join(root, androidConfigPath)), false);
  });
});

test("restores iOS config only for the expected BUNDLE_ID", () => {
  withTemporaryRoot((root) => {
    const content = iosConfig(expectedPackage);
    const result = restore(root, ["--ios", "--require"], {
      FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64: encode(content),
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(root, iosConfigPath), "utf8"), content);
  });
});

test("rejects an unrelated expected ID when BUNDLE_ID is different", () => {
  withTemporaryRoot((root) => {
    const result = restore(root, ["--ios", "--require"], {
      FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64: encode(
        iosConfig("com.invalid.crossword", expectedPackage),
      ),
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /bundle ID mismatch/);
    assert.equal(existsSync(join(root, iosConfigPath)), false);
  });
});

test("fails closed when a required config environment variable is missing", () => {
  withTemporaryRoot((root) => {
    const result = restore(root, ["--android", "--require"]);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64 is required/,
    );
  });
});
