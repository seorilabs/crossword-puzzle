import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { planImageCleanup } from "../server/batch/imageRetention.mjs";

const { values } = parseArgs({
  options: {
    repository: { type: "string" },
    inUse: { type: "string" },
    now: { type: "string" },
  },
});
if (!values.repository || !values.inUse)
  throw new Error("--repository and --inUse inventory file are required");
// Collect directly so the caller cannot accidentally omit protected tags.
const rows = JSON.parse(
  execFileSync(
    process.env.GCLOUD_BIN ?? "gcloud",
    [
      "artifacts",
      "docker",
      "images",
      "list",
      values.repository,
      "--include-tags",
      "--format=json",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ),
);
if (!Array.isArray(rows)) throw new Error("Invalid image inventory");
const inUse = JSON.parse(readFileSync(values.inUse, "utf8"));
if (
  !Array.isArray(inUse) ||
  !inUse.length ||
  inUse.some((uri) => typeof uri !== "string" || !uri.includes("@sha256:"))
) {
  throw new Error(
    "Read all active jobs and services and resolve their immutable image references first",
  );
}
const images = rows.map((row) => ({
  image: `${row.package}@${row.version}`,
  package: row.package,
  digest: row.version,
  tags: row.tags,
  createdAt: row.createTime,
  bytes: Number(row.metadata?.imageSizeBytes ?? 0),
}));
if (inUse.some((uri) => !images.some((image) => image.image === uri)))
  throw new Error("An active image is absent from the image inventory");
const candidates = planImageCleanup(images, {
  now: values.now ?? new Date(),
  inUse,
});
console.log(
  JSON.stringify(
    {
      mode: "preview",
      candidates,
      retained: images.length - candidates.length,
    },
    null,
    2,
  ),
);
