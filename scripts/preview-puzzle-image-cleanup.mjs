import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { planImageCleanup } from "../server/batch/imageRetention.mjs";

const { values } = parseArgs({
  options: {
    images: { type: "string" },
    inUse: { type: "string" },
    now: { type: "string" },
  },
});
if (!values.images || !values.inUse)
  throw new Error("--images and --inUse inventory files are required");
const rows = JSON.parse(readFileSync(values.images, "utf8"));
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
