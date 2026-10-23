import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Only the provider boundary is replaced; execute the real rollout CLI.
const provider = `#!/usr/bin/env node
const fs=require('fs'),p=process.env.PUZZLE_FAKE_STATE,s=JSON.parse(fs.readFileSync(p)),a=process.argv.slice(2);
const get=k=>a[a.indexOf(k)+1];const base='region-docker.pkg.dev/project/repo/puzzle-pack-job';
const digest=k=>base+'@sha256:'+k.repeat(64);let out='';
if(a.slice(0,4).join(' ')==='artifacts docker images describe'){
 const input=a[4];out=JSON.stringify({image_summary:{fully_qualified_digest:input.includes('@')?input:digest(s.tags[input.split(':').at(-1)])}});
}else if(a.slice(0,2).join(' ')==='builds submit'){
 s.tags.latest='b';out='fixture-build';
}else if(a.slice(0,2).join(' ')==='builds describe'){
 out='SUCCESS';
}else if(a.slice(0,3).join(' ')==='run jobs describe'){
 const j=s.jobs[a[3]];if(!j)throw Error('NOT_FOUND');out=a.includes('--format=export')?JSON.stringify(j):j.image;
}else if(a.slice(0,3).join(' ')==='run jobs update'){
 const j=s.jobs[a[3]];j.image=get('--image');if(a.includes('--set-env-vars'))j.env=get('--set-env-vars');s.writes++;
}else if(a.slice(0,3).join(' ')==='run jobs replace'){
 const j=JSON.parse(fs.readFileSync(a[3]));s.jobs[j.name]=j;s.writes++;
}else if(a.slice(0,3).join(' ')==='run jobs execute'){
 if(s.failHealth){console.error('health failed');process.exit(1)}
}else if(a.slice(0,4).join(' ')==='artifacts docker tags add'){
 s.tags[a[5].split(':').at(-1)]=a[4].split('sha256:')[1][0];s.writes++;
}else if(a.slice(0,4).join(' ')==='artifacts docker tags delete'){
 delete s.tags[a[4].split(':').at(-1)];s.writes++;
}else throw Error('Unexpected provider command');
fs.writeFileSync(p,JSON.stringify(s));console.log(out);
`;

for (const build of [false, true])
  for (const failHealth of [false, true])
    test(`OPS-3/6: real rollout CLI build=${build} healthFailure=${failHealth}`, () => {
      const dir = mkdtempSync(join(tmpdir(), "crossword-ops-test-"));
      try {
        const bin = join(dir, "gcloud");
        const statePath = join(dir, "state.json");
        const old =
          "region-docker.pkg.dev/project/repo/puzzle-pack-job" +
          (build ? ":latest" : "@sha256:" + "a".repeat(64));
        const before = {
          jobs: {
            generator: { name: "generator", image: old, env: "OLD=1" },
            health: { name: "health", image: old, env: "HEALTH=1" },
          },
          tags: {
            candidate: "b",
            "runtime-current": "a",
            "runtime-rollback": "c",
            latest: build ? "a" : "c",
          },
          writes: 0,
          failHealth,
        };
        writeFileSync(bin, provider, { mode: 0o700 });
        writeFileSync(statePath, JSON.stringify(before));
        const run = () =>
          execFileSync(
            process.execPath,
            [
              "scripts/deploy-puzzle-pack-image.mjs",
              "--project",
              "project",
              "--generator",
              "generator",
              "--health",
              "health",
              "--image",
              "region-docker.pkg.dev/project/repo/puzzle-pack-job:" +
                (build ? "latest" : "candidate"),
              "--env",
              "NEW=1",
              "--serviceAccount",
              "runtime@example",
              ...(build ? ["--buildConfig", "fixture.yml"] : []),
            ],
            {
              encoding: "utf8",
              env: {
                ...process.env,
                GCLOUD_BIN: bin,
                PUZZLE_FAKE_STATE: statePath,
              },
              stdio: ["ignore", "pipe", "pipe"],
            },
          );
        if (failHealth) assert.throws(run);
        else assert.match(run(), /"status":"PASS"/);
        const after = JSON.parse(readFileSync(statePath, "utf8"));
        if (failHealth) {
          assert.deepEqual(after.jobs, before.jobs);
          assert.deepEqual(after.tags, before.tags);
        } else {
          assert.equal(after.jobs.generator.image, after.jobs.health.image);
          assert.equal(after.jobs.generator.env, "NEW=1");
          assert.equal(after.tags["runtime-rollback"], "a");
          assert.equal(after.tags["runtime-current"], "b");
          assert.equal(after.tags.latest, "b");
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

test("OPS-3: outer setup reaches protected rollout with skip-build under system bash", () => {
  const dir = mkdtempSync(join(tmpdir(), "crossword-setup-test-"));
  try {
    const capture = join(dir, "node-args.txt");
    writeFileSync(
      join(dir, "gcloud"),
      '#!/bin/sh\nif [ "$1 $2" = "projects describe" ]; then echo 123; fi\n',
      { mode: 0o700 },
    );
    writeFileSync(
      join(dir, "node"),
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$PUZZLE_SETUP_CAPTURE"\n',
      { mode: 0o700 },
    );
    execFileSync(
      "/bin/bash",
      [
        "scripts/setup-puzzle-pack-cloud-run-job.sh",
        "--project-id",
        "fixture",
        "--firebase-hosting-site",
        "fixture",
        "--skip-build",
      ],
      {
        env: {
          ...process.env,
          PATH: dir + ":" + process.env.PATH,
          PUZZLE_SETUP_CAPTURE: capture,
        },
        stdio: "pipe",
      },
    );
    const args = readFileSync(capture, "utf8").split("\n");
    assert.equal(args[0], "scripts/deploy-puzzle-pack-image.mjs");
    assert.ok(args.includes("--health"));
    assert.ok(!args.includes("--buildConfig"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("OPS-2: cleanup preview collects tags and retains inactive rollback", () => {
  const dir = mkdtempSync(join(tmpdir(), "crossword-preview-test-"));
  try {
    const base = "region-docker.pkg.dev/project/repo/image";
    const rows = ["a", "b", "c", "d"].map((letter, i) => ({
      package: base,
      version: "sha256:" + letter.repeat(64),
      createTime: `2026-0${9 - i}-01T00:00:00Z`,
      tags: i === 3 ? ["runtime-rollback"] : [],
      metadata: { imageSizeBytes: "12" },
    }));
    const bin = join(dir, "gcloud");
    const capture = join(dir, "args.json");
    writeFileSync(
      bin,
      "#!" +
        process.execPath +
        '\nconst fs=require("fs");fs.writeFileSync(process.env.PUZZLE_PREVIEW_CAPTURE,JSON.stringify(process.argv.slice(2)));console.log(' +
        JSON.stringify(JSON.stringify(rows)) +
        ");\n",
      { mode: 0o700 },
    );
    const used = join(dir, "in-use.json");
    writeFileSync(used, JSON.stringify([base + "@" + rows[0].version]));
    const output = execFileSync(
      process.execPath,
      [
        "scripts/preview-puzzle-image-cleanup.mjs",
        "--repository",
        "region-docker.pkg.dev/project/repo",
        "--inUse",
        used,
        "--now",
        "2026-10-23T00:00:00Z",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GCLOUD_BIN: bin,
          PUZZLE_PREVIEW_CAPTURE: capture,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    assert.ok(
      JSON.parse(readFileSync(capture, "utf8")).includes("--include-tags"),
    );
    assert.deepEqual(
      JSON.parse(output).candidates.map((row) => row.digest),
      [rows[2].version],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
