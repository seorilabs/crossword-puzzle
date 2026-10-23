const DAY = 86400000;
const PROTECTION_TAGS = ["runtime-current", "runtime-rollback"];

// Preview only. The provider policy is the authority for automatic deletion.
export function planImageCleanup(images, { now = new Date(), inUse }) {
  const timestamp = new Date(now).getTime();
  if (!Number.isFinite(timestamp) || !Array.isArray(inUse))
    throw new Error("A valid clock and in-use image inventory are required");
  const used = new Set(inUse);
  const recent = new Set();
  const packages = new Map();
  for (const image of images) {
    if (!image.package || !image.digest || !Array.isArray(image.tags))
      throw new Error("Invalid image inventory");
    const group = packages.get(image.package) ?? [];
    group.push(image);
    packages.set(image.package, group);
  }
  for (const group of packages.values()) {
    group
      .filter((i) => Number.isFinite(Date.parse(i.createdAt)))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 2)
      .forEach((i) => recent.add(i));
  }
  return images.filter((image) => {
    const createdAt = Date.parse(image.createdAt);
    return (
      Number.isFinite(createdAt) &&
      timestamp - createdAt > 14 * DAY &&
      !recent.has(image) &&
      !used.has(image.image) &&
      !used.has(image.digest) &&
      !image.tags.some((tag) =>
        PROTECTION_TAGS.some((prefix) =>
          tag.split("/").at(-1).split(":").at(-1).startsWith(prefix),
        ),
      )
    );
  });
}

export async function deployProtectedImage(api, next) {
  const before = await api.snapshot();
  if (!before.generator || before.generator !== before.health)
    throw new Error(
      "Generator and health must use the same image before deployment",
    );
  for (const uri of new Set(
    [
      before.generator,
      typeof next === "string" ? next : null,
      ...Object.values(before.tags),
    ].filter(Boolean),
  )) {
    await api.assertReadable(uri);
  }
  try {
    // A build can move a mutable tag. Snapshot the old digests before building.
    const candidate = typeof next === "function" ? await next() : next;
    if (typeof next === "function") await api.assertReadable(candidate);
    await api.setTag("runtime-rollback", before.generator);
    // Protect the candidate before changing either job. Health determines commit.
    await api.setTag("runtime-current", candidate);
    await api.updateJobs(candidate);
    await api.checkHealth();
    await api.setTag("latest", candidate);
    return { current: candidate, rollback: before.generator };
  } catch (error) {
    const failures = [];
    try {
      await api.restoreJobs(before);
    } catch (failure) {
      failures.push(failure);
    }
    for (const tag of [...PROTECTION_TAGS, "latest"]) {
      try {
        await api.setTag(tag, before.tags[tag] ?? null);
      } catch (failure) {
        failures.push(failure);
      }
    }
    if (failures.length)
      throw new AggregateError(
        [error, ...failures],
        "Deployment failed; rollback is incomplete",
      );
    throw error;
  }
}
