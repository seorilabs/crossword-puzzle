import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GAME_CONTENT_PATH_CLASS = "**/game-content/**";

const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x02014b50;
const ZIP_MINIMUM_END_RECORD_BYTES = 22;
const ZIP_MAXIMUM_COMMENT_BYTES = 0xffff;

export function hasGameContentPathSegment(candidatePath) {
  return candidatePath
    .replaceAll("\\", "/")
    .split("/")
    .some((segment) => segment === "game-content");
}

async function listArtifactPaths(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    const artifactPath = path
      .relative(root, entryPath)
      .split(path.sep)
      .join("/");
    paths.push(artifactPath);
    if (entry.isDirectory()) {
      paths.push(...(await listArtifactPaths(root, entryPath)));
    }
  }

  return paths;
}

export async function assertNoGameContentInDirectory(directory) {
  const root = path.resolve(directory);
  const rootStats = await stat(root).catch(() => null);
  if (rootStats == null || !rootStats.isDirectory()) {
    throw new Error(`Build artifact directory is unavailable: ${root}`);
  }
  const forbidden = (await listArtifactPaths(root)).filter(
    hasGameContentPathSegment,
  );
  if (forbidden.length > 0) {
    throw new Error(
      `Build artifact contains forbidden ${GAME_CONTENT_PATH_CLASS}: ${forbidden[0]}`,
    );
  }
}

export async function removeGameContentFromBuildOutput(directory) {
  const root = path.resolve(directory);
  await rm(path.join(root, "game-content"), { recursive: true, force: true });
  await assertNoGameContentInDirectory(root);
}

function findZipEndOfCentralDirectory(buffer) {
  const firstPossibleOffset = Math.max(
    0,
    buffer.length - ZIP_MINIMUM_END_RECORD_BYTES - ZIP_MAXIMUM_COMMENT_BYTES,
  );
  for (
    let offset = buffer.length - ZIP_MINIMUM_END_RECORD_BYTES;
    offset >= firstPossibleOffset;
    offset -= 1
  ) {
    if (
      buffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      const commentBytes = buffer.readUInt16LE(offset + 20);
      const recordEnd = offset + ZIP_MINIMUM_END_RECORD_BYTES + commentBytes;
      const entryCount = buffer.readUInt16LE(offset + 10);
      const centralDirectoryBytes = buffer.readUInt32LE(offset + 12);
      const centralDirectoryZipOffset = buffer.readUInt32LE(offset + 16);
      const centralDirectoryOffset = offset - centralDirectoryBytes;
      if (
        recordEnd <= buffer.length &&
        buffer.readUInt16LE(offset + 4) === 0 &&
        buffer.readUInt16LE(offset + 6) === 0 &&
        buffer.readUInt16LE(offset + 8) === entryCount &&
        centralDirectoryOffset >= 0 &&
        centralDirectoryOffset - centralDirectoryZipOffset >= 0 &&
        (entryCount === 0 ||
          (centralDirectoryOffset + 4 <= offset &&
            buffer.readUInt32LE(centralDirectoryOffset) ===
              ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE))
      ) {
        return offset;
      }
    }
  }
  throw new Error("AIT artifact has no ZIP central directory");
}

export function listEmbeddedZipEntryNames(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const endOffset = findZipEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(endOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralDirectoryBytes = buffer.readUInt32LE(endOffset + 12);
  const centralDirectoryZipOffset = buffer.readUInt32LE(endOffset + 16);
  const commentBytes = buffer.readUInt16LE(endOffset + 20);

  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== entryCount
  ) {
    throw new Error("AIT artifact uses unsupported multi-disk ZIP data");
  }
  if (
    entryCount === 0xffff ||
    centralDirectoryBytes === 0xffffffff ||
    centralDirectoryZipOffset === 0xffffffff
  ) {
    throw new Error("AIT artifact uses unsupported ZIP64 data");
  }
  if (endOffset + ZIP_MINIMUM_END_RECORD_BYTES + commentBytes > buffer.length) {
    throw new Error("AIT artifact ZIP end record is truncated");
  }

  const centralDirectoryOffset = endOffset - centralDirectoryBytes;
  const zipPrefixBytes = centralDirectoryOffset - centralDirectoryZipOffset;
  if (centralDirectoryOffset < 0 || zipPrefixBytes < 0) {
    throw new Error("AIT artifact ZIP central directory offset is invalid");
  }

  const names = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > endOffset ||
      buffer.readUInt32LE(offset) !==
        ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE
    ) {
      throw new Error("AIT artifact ZIP central directory is invalid");
    }
    const nameBytes = buffer.readUInt16LE(offset + 28);
    const extraBytes = buffer.readUInt16LE(offset + 30);
    const entryCommentBytes = buffer.readUInt16LE(offset + 32);
    const nextOffset = offset + 46 + nameBytes + extraBytes + entryCommentBytes;
    if (nextOffset > endOffset) {
      throw new Error("AIT artifact ZIP entry is truncated");
    }
    names.push(
      buffer.subarray(offset + 46, offset + 46 + nameBytes).toString(),
    );
    offset = nextOffset;
  }

  return names;
}

export async function assertNoGameContentInAitArtifact(artifactPath) {
  const resolvedPath = path.resolve(artifactPath);
  const entries = listEmbeddedZipEntryNames(await readFile(resolvedPath));
  const forbidden = entries.filter(hasGameContentPathSegment);
  if (forbidden.length > 0) {
    throw new Error(
      `AIT artifact contains forbidden ${GAME_CONTENT_PATH_CLASS}: ${forbidden[0]}`,
    );
  }
}

export function gameContentPublishBoundaryPlugin() {
  let outputDirectory = null;

  return {
    name: "crossword-game-content-publish-boundary",
    apply: "build",
    configResolved(config) {
      outputDirectory = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      if (outputDirectory == null) {
        throw new Error("Vite build output directory was not resolved");
      }
      await removeGameContentFromBuildOutput(outputDirectory);
    },
  };
}

async function run() {
  const [directory = "dist", artifactPath = "crossword-puzzle.ait"] =
    process.argv.slice(2);
  await assertNoGameContentInDirectory(directory);
  await assertNoGameContentInAitArtifact(artifactPath);
  console.log(
    `Verified game-content publish boundary: ${path.resolve(directory)} and ${path.resolve(artifactPath)}`,
  );
}

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
