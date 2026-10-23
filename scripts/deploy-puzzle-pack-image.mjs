import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { deployProtectedImage } from "../server/batch/imageRetention.mjs";

const { values: options } = parseArgs({
  options: {
    project: { type: "string" },
    region: { type: "string", default: "asia-northeast3" },
    generator: { type: "string", default: "crossword-puzzle-pack-generator" },
    health: { type: "string", default: "crossword-puzzle-pack-health" },
    image: { type: "string" },
    env: { type: "string" },
    serviceAccount: { type: "string" },
    memory: { type: "string", default: "1Gi" },
    cpu: { type: "string", default: "1" },
    timeout: { type: "string", default: "1800s" },
    buildConfig: { type: "string" },
  },
});
if (
  !options.project ||
  !options.image ||
  !options.env ||
  !options.serviceAccount
) {
  throw new Error(
    "--project, --image, --env and --serviceAccount are required",
  );
}
const directory = mkdtempSync(join(tmpdir(), "crossword-image-rollout-"));
let preserve = false;
const common = ["--project", options.project, "--region", options.region];
const gcloud = (...args) => {
  try {
    return execFileSync(process.env.GCLOUD_BIN ?? "gcloud", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    throw new Error(String(error.stderr || "gcloud command failed"), {
      cause: error,
    });
  }
};
const resolveImage = (uri) => {
  const result = JSON.parse(
    gcloud(
      "artifacts",
      "docker",
      "images",
      "describe",
      uri,
      "--project",
      options.project,
      "--format=json",
    ),
  );
  const digest = result.image_summary?.fully_qualified_digest;
  if (!digest?.includes("@sha256:"))
    throw new Error("Could not resolve an immutable image digest");
  return digest;
};
const packageUri = options.image.split("@")[0].replace(/:[^/]*$/, "");
const readOptionalTag = (tag) => {
  try {
    return resolveImage(`${packageUri}:${tag}`);
  } catch (error) {
    if (/NOT_FOUND|not found/i.test(error.message)) return null;
    throw error;
  }
};
try {
  const next = async () => {
    if (options.buildConfig) {
      const id = gcloud(
        "builds",
        "submit",
        ".",
        "--project",
        options.project,
        "--config",
        options.buildConfig,
        "--async",
        "--format=value(id)",
        "--quiet",
      );
      if (!id) throw new Error("Cloud Build did not return an ID");
      console.log(`Cloud Build: ${id}`);
      for (;;) {
        const status = gcloud(
          "builds",
          "describe",
          id,
          "--project",
          options.project,
          "--region",
          "global",
          "--format=value(status)",
        );
        if (status === "SUCCESS") break;
        if (!["QUEUED", "PENDING", "WORKING"].includes(status))
          throw new Error(`Cloud Build failed: ${status}`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    return resolveImage(options.image);
  };
  const api = {
    snapshot: async () => {
      const configs = {};
      const images = {};
      for (const [role, job] of [
        ["generator", options.generator],
        ["health", options.health],
      ]) {
        configs[role] = join(directory, `${role}.yaml`);
        writeFileSync(
          configs[role],
          gcloud("run", "jobs", "describe", job, ...common, "--format=export"),
          { mode: 0o600 },
        );
        images[role] = resolveImage(
          gcloud(
            "run",
            "jobs",
            "describe",
            job,
            ...common,
            "--format=value(spec.template.spec.template.spec.containers[0].image)",
          ),
        );
        if (!images[role].startsWith(`${packageUri}@`))
          throw new Error("Existing job uses a different image package");
      }
      const tags = Object.fromEntries(
        ["runtime-current", "runtime-rollback", "latest"].map((tag) => [
          tag,
          readOptionalTag(tag),
        ]),
      );
      return { ...images, tags, configs };
    },
    assertReadable: async (uri) => {
      resolveImage(uri);
    },
    setTag: async (tag, uri) => {
      if (uri)
        gcloud(
          "artifacts",
          "docker",
          "tags",
          "add",
          uri,
          `${packageUri}:${tag}`,
          "--project",
          options.project,
          "--quiet",
        );
      else if (readOptionalTag(tag))
        gcloud(
          "artifacts",
          "docker",
          "tags",
          "delete",
          `${packageUri}:${tag}`,
          "--project",
          options.project,
          "--quiet",
        );
    },
    updateJobs: async (uri) => {
      gcloud(
        "run",
        "jobs",
        "update",
        options.generator,
        ...common,
        "--image",
        uri,
        "--service-account",
        options.serviceAccount,
        "--memory",
        options.memory,
        "--cpu",
        options.cpu,
        "--task-timeout",
        options.timeout,
        "--max-retries",
        "0",
        "--set-env-vars",
        options.env,
        "--quiet",
      );
      gcloud(
        "run",
        "jobs",
        "update",
        options.health,
        ...common,
        "--image",
        uri,
        "--quiet",
      );
    },
    restoreJobs: async (before) => {
      const errors = [];
      for (const role of ["generator", "health"]) {
        try {
          gcloud(
            "run",
            "jobs",
            "replace",
            before.configs[role],
            ...common,
            "--quiet",
          );
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length)
        throw new AggregateError(
          errors,
          "Could not restore all job configurations",
        );
    },
    checkHealth: async () => {
      gcloud("run", "jobs", "execute", options.health, ...common, "--wait");
    },
  };
  const result = await deployProtectedImage(
    api,
    options.buildConfig ? next : resolveImage(options.image),
  );
  console.log(JSON.stringify({ status: "PASS", ...result }));
} catch (error) {
  preserve = error instanceof AggregateError;
  console.error(error.message);
  if (preserve) console.error(`Rollback configurations retained: ${directory}`);
  process.exitCode = 1;
} finally {
  if (!preserve) rmSync(directory, { recursive: true, force: true });
}
