import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deployHosting } from "./publish-puzzle-pack.mjs";

function hostingApi({
  changedRelease = false,
  failedUpload = false,
  failedClone = false,
} = {}) {
  const calls = [];
  const oldConfig = {
    cleanUrls: true,
    rewrites: [{ glob: "/app/**", path: "/index.html" }],
    headers: [
      { glob: "/asset/**", headers: { "Cache-Control": "max-age=3600" } },
    ],
  };
  const versions = new Map([
    [
      "sites/test/versions/old",
      {
        config: oldConfig,
        files: {
          "/index.html": "remote-index",
          "/asset/logo.svg": "remote-logo",
          "/puzzles/ko/issued.json": "issued",
          "/puzzles/en/issued.json": "issued-en",
        },
      },
    ],
  ]);
  let reads = 0;
  let release;
  const fetcher = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const body =
      typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    calls.push({ path: url.pathname, method, body });
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status });
    if (url.pathname.endsWith("/channels/live"))
      return json({
        release: {
          name: `sites/test/releases/${changedRelease && reads++ > 0 ? "other" : "old"}`,
          version: { name: "sites/test/versions/old" },
        },
      });
    if (url.pathname === "/v1beta1/sites/test/versions/old")
      return json({
        name: "sites/test/versions/old",
        status: "FINALIZED",
        ...versions.get("sites/test/versions/old"),
      });
    if (url.pathname.endsWith("/versions/old/files"))
      return json({
        files: Object.entries(
          versions.get("sites/test/versions/old").files,
        ).map(([path, hash]) => ({ path, hash, status: "ACTIVE" })),
      });
    if (url.pathname.endsWith("/versions:clone")) {
      assert.equal(body.finalize, false);
      assert.equal(body.sourceVersion, "sites/test/versions/old");
      versions.set(
        "sites/test/versions/new",
        structuredClone(versions.get(body.sourceVersion)),
      );
      return json({ name: "projects/test/operations/clone", done: false });
    }
    if (url.pathname.endsWith("/operations/clone"))
      return json(
        failedClone
          ? { done: true, error: { code: 13, message: "clone failed" } }
          : {
              done: true,
              response: { name: "sites/test/versions/new", status: "CREATED" },
            },
      );
    // The old publisher takes this destructive create path; retain it in the fake
    // so the red assertion checks lost content rather than a missing test API.
    if (url.pathname.endsWith("/versions") && method === "POST") {
      versions.set("sites/test/versions/new", {
        config: body.config,
        files: {},
      });
      return json({ name: "sites/test/versions/new" });
    }
    if (url.pathname.endsWith(":populateFiles")) {
      Object.assign(versions.get("sites/test/versions/new").files, body.files);
      return json({
        uploadUrl: "https://upload-firebasehosting.googleapis.com/upload/test",
        uploadRequiredHashes: Object.values(body.files),
      });
    }
    if (url.hostname === "upload-firebasehosting.googleapis.com")
      return json({}, failedUpload ? 503 : 200);
    if (method === "PATCH") {
      if (body.config)
        versions.get("sites/test/versions/new").config = body.config;
      return json({
        name: "sites/test/versions/new",
        status: body.status ?? "CREATED",
      });
    }
    if (url.pathname.endsWith("/releases") && method === "POST") {
      release = versions.get(url.searchParams.get("versionName"));
      return json({ name: "sites/test/releases/new" });
    }
    throw new Error(`Unexpected mocked Hosting request: ${method} ${input}`);
  };
  return {
    fetcher,
    calls,
    oldConfig,
    get release() {
      return release;
    },
  };
}
async function withPublication(api, operation) {
  const publicDir = await mkdtemp(
    path.join(tmpdir(), "crossword-publish-test-"),
  );
  const oldFetch = globalThis.fetch;
  globalThis.fetch = api.fetcher;
  try {
    await mkdir(path.join(publicDir, "puzzles/en"), { recursive: true });
    await writeFile(
      path.join(publicDir, "puzzles/manifest.json"),
      '{"puzzles":[]}',
    );
    await writeFile(
      path.join(publicDir, "puzzles/en/manifest.json"),
      '{"language":"en","puzzles":[]}',
    );
    await writeFile(path.join(publicDir, "index.html"), "stale bundled index");
    return await operation({
      project: "test",
      site: "test",
      publicDir,
      corsOrigin: "*",
      hostingBaseUrl: "https://test.web.app",
    });
  } finally {
    globalThis.fetch = oldFetch;
    await rm(publicDir, { recursive: true, force: true });
  }
}
test("AC-2 publication preserves live files and config while replacing only generated puzzle paths", async () => {
  const api = hostingApi();
  await withPublication(api, (options) =>
    deployHosting({ options, token: "test-token" }),
  );
  assert.equal(api.release.files["/index.html"], "remote-index");
  assert.equal(api.release.files["/asset/logo.svg"], "remote-logo");
  assert.equal(api.release.files["/puzzles/ko/issued.json"], "issued");
  assert.equal(api.release.files["/puzzles/en/issued.json"], "issued-en");
  assert.ok(api.release.files["/puzzles/en/manifest.json"]);
  assert.equal(api.release.config.cleanUrls, true);
  assert.deepEqual(api.release.config.rewrites, api.oldConfig.rewrites);
  assert.ok(
    api.release.config.headers.some((header) => header.glob === "/asset/**"),
  );
  assert.equal(
    api.calls.filter(
      (call) => call.path.endsWith("/releases") && call.method === "POST",
    ).length,
    1,
  );
});
test("AC-2 concurrent live release change aborts before publishing", async () => {
  const api = hostingApi({ changedRelease: true });
  await withPublication(api, (options) =>
    assert.rejects(
      deployHosting({ options, token: "test-token" }),
      /live release changed/,
    ),
  );
  assert.equal(api.release, undefined);
});
test("AC-2 upload or clone failure leaves the current live release intact", async () => {
  for (const scenario of [{ failedUpload: true }, { failedClone: true }]) {
    const api = hostingApi(scenario);
    await withPublication(api, (options) =>
      assert.rejects(deployHosting({ options, token: "test-token" })),
    );
    assert.equal(api.release, undefined);
  }
});

test("AC-2 published language puzzle identities cannot be overwritten by a later staged board", async () => {
  const api = hostingApi();
  const baseFetcher = api.fetcher;
  api.fetcher = async (input, init) =>
    new URL(input).pathname.endsWith("/versions/old/files")
      ? new Response(
          JSON.stringify({
            files: [
              {
                path: "/puzzles/en/en-20261026-1.json",
                hash: "issued-hash",
                status: "ACTIVE",
              },
            ],
          }),
        )
      : baseFetcher(input, init);
  await withPublication(api, async (options) => {
    await writeFile(
      path.join(options.publicDir, "puzzles/en/en-20261026-1.json"),
      "different board",
    );
    await assert.rejects(
      deployHosting({ options, token: "test-token" }),
      /Refusing to replace an issued/,
    );
  });
  assert.equal(api.release, undefined);
  assert.equal(
    api.calls.some((call) => call.path.endsWith("/versions:clone")),
    false,
  );
});
