import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { withCacheBust } from "./puzzlePackIo.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function waitForPublishedPack({
  baseUrl,
  outDir,
  languages = true,
  timeoutMs = 180_000,
  intervalMs = 5_000,
  fetcher = fetch,
  wait = sleep,
  clock = Date.now,
}) {
  const files = languages
    ? ["manifest.json", "ko/manifest.json", "en/manifest.json"]
    : ["manifest.json"];
  const expected = await Promise.all(
    files.map(async (file) => ({
      file,
      hash: hash(await readFile(path.join(outDir, file))),
    })),
  );
  const deadline = clock() + timeoutMs;
  for (;;) {
    const results = await Promise.all(
      expected.map(async (item) => {
        try {
          const response = await fetcher(
            withCacheBust(
              new URL(`/puzzles/${item.file}`, baseUrl),
              "publication",
            ),
            {
              cache: "no-store",
              signal: AbortSignal.timeout(
                Math.max(1, Math.min(15_000, deadline - clock())),
              ),
            },
          );
          return (
            response.ok &&
            hash(Buffer.from(await response.arrayBuffer())) === item.hash
          );
        } catch {
          return false;
        }
      }),
    );
    if (results.every(Boolean)) {
      console.log("[puzzle-pack-publication] staged manifests are visible");
      return;
    }
    const pending = expected
      .filter((_, index) => !results[index])
      .map((item) => item.file);
    const remaining = deadline - clock();
    if (remaining <= 0)
      throw new Error(
        `Published manifests did not match staged content: ${pending.join(", ")}`,
      );
    console.warn(`[puzzle-pack-publication] waiting for ${pending.join(", ")}`);
    await wait(Math.min(intervalMs, remaining));
  }
}
