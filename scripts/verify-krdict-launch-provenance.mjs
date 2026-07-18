#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import { XMLParser } from "fast-xml-parser";

import {
  KRDIC_SOURCE_ARTIFACTS,
  KRDIC_SOURCE_COMMIT,
  KRDIC_SOURCE_MIRROR,
  verifyKrdictSourceArtifact,
} from "./krdict-source-lock.mjs";

const EXPECTED_CANDIDATE_COUNT = 2_400;
const EXPECTED_SOURCE_ARTIFACT_COUNT = KRDIC_SOURCE_ARTIFACTS.length;
const CANDIDATE_PATH =
  "data/game-content/v1/ko-KR/reviews/editorial-candidates.json";
const LICENSE_MANIFEST_PATH =
  "data/game-content/v1/ko-KR/license-manifest.json";
const INDEX_PATH = "data/game-content/v1/ko-KR/source-provenance-index.json";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDefinition(value) {
  return normalizeText(value)
    .replace(/\.$/, "")
    .replace(/^[「『](.*)[」』]$/, "$1");
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function canonicalCandidateDefinition(candidate, contentLocale) {
  return JSON.stringify({
    contentLocale,
    sourceEntryId: candidate.sourceEntryId,
    answer: candidate.answer,
    definition: candidate.definition,
  });
}

function canonicalSourceRecord(record) {
  return JSON.stringify({
    sourceEntryId: record.sourceEntryId,
    writtenForms: record.writtenForms,
    partOfSpeech: record.partOfSpeech,
    vocabularyLevels: record.vocabularyLevels,
    definitions: record.definitions,
  });
}

function canonicalSourceLock(sourceLocks) {
  return JSON.stringify({
    datasetId: sourceLocks.datasetId,
    sourceMirror: sourceLocks.sourceMirror,
    sourceMirrorCommit: sourceLocks.sourceMirrorCommit,
    licenseId: sourceLocks.licenseId,
    sourceArtifacts: sourceLocks.artifacts.map(
      ({ file, bytes, rawSha256, gitBlobSha1 }) => ({
        file,
        bytes,
        rawSha256,
        gitBlobSha1,
      }),
    ),
  });
}

function compareUtf16Strings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareSourceEntryIds(left, right) {
  const numericDifference =
    Number(left.sourceEntryId) - Number(right.sourceEntryId);
  if (numericDifference !== 0) return numericDifference;
  return compareUtf16Strings(left.answer, right.answer);
}

function getFeatValues(node, attribute) {
  return asArray(node?.feat)
    .filter((item) => item?.att === attribute)
    .map((item) => normalizeText(item?.val))
    .filter(Boolean);
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareUtf16Strings);
}

function extractSourceRecord(entry) {
  return {
    sourceEntryId: normalizeText(entry?.val),
    writtenForms: sortedUnique(getFeatValues(entry?.Lemma, "writtenForm")),
    partOfSpeech: sortedUnique(getFeatValues(entry, "partOfSpeech")),
    vocabularyLevels: sortedUnique(getFeatValues(entry, "vocabularyLevel")),
    definitions: sortedUnique(
      asArray(entry?.Sense).flatMap((sense) =>
        getFeatValues(sense, "definition")
          .map(normalizeDefinition)
          .filter(Boolean),
      ),
    ),
  };
}

function normalizeMirror(value) {
  return String(value ?? "")
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\/$/, "");
}

function parseSourceLocks(candidateDocument, manifestDocument) {
  const dataset = candidateDocument?.sourceDataset;
  assert(dataset != null, "candidate sourceDataset is missing");
  assert(
    normalizeMirror(dataset.sourceMirror) === KRDIC_SOURCE_MIRROR,
    `unexpected candidate source mirror: ${dataset.sourceMirror}`,
  );
  assert(
    dataset.sourceMirrorCommit === KRDIC_SOURCE_COMMIT,
    `candidate sourceMirrorCommit is not the shared source lock: ${dataset.sourceMirrorCommit}`,
  );
  assert(
    dataset.licenseId === "CC-BY-SA-2.0-KR",
    `unexpected candidate license: ${dataset.licenseId}`,
  );

  const candidateArtifacts = asArray(dataset.sourceXmlBlobs);
  assert(
    candidateArtifacts.length === EXPECTED_SOURCE_ARTIFACT_COUNT,
    `expected ${EXPECTED_SOURCE_ARTIFACT_COUNT} candidate source artifacts, received ${candidateArtifacts.length}`,
  );

  const manifestSource = asArray(manifestDocument?.sources).find(
    (source) => source?.sourceId === "nikl-krdict-text-2019",
  );
  assert(manifestSource != null, "KRDIC license manifest source is missing");
  assert(
    normalizeMirror(manifestSource.sourceMirror) === KRDIC_SOURCE_MIRROR,
    `unexpected manifest source mirror: ${manifestSource.sourceMirror}`,
  );
  assert(
    manifestSource.sourceMirrorCommit === dataset.sourceMirrorCommit,
    "candidate and manifest source commits differ",
  );
  assert(
    manifestSource.licenseId === dataset.licenseId,
    "candidate and manifest source licenses differ",
  );

  const manifestArtifacts = new Map(
    asArray(manifestSource.sourceArtifacts).map((artifact) => [
      artifact.file,
      artifact,
    ]),
  );
  assert(
    manifestArtifacts.size === candidateArtifacts.length,
    "candidate and manifest source artifact counts differ",
  );

  const seenFiles = new Set();
  const pinnedArtifacts = new Map(
    KRDIC_SOURCE_ARTIFACTS.map((artifact) => [artifact.file, artifact]),
  );
  const artifacts = candidateArtifacts.map((artifact) => {
    assert(
      /^[1-9][0-9]*\.xml$/.test(artifact?.file ?? ""),
      `unsafe or invalid source artifact file: ${artifact?.file}`,
    );
    assert(
      !seenFiles.has(artifact.file),
      `duplicate source artifact: ${artifact.file}`,
    );
    seenFiles.add(artifact.file);
    assert(
      /^[0-9a-f]{40}$/.test(artifact.gitBlobSha1 ?? ""),
      `invalid Git blob SHA-1 for ${artifact.file}`,
    );
    assert(
      /^sha256:[0-9a-f]{64}$/.test(artifact.rawSha256 ?? ""),
      `invalid raw SHA-256 for ${artifact.file}`,
    );
    assert(
      Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0,
      `invalid byte length for ${artifact.file}`,
    );

    const pinnedArtifact = pinnedArtifacts.get(artifact.file);
    assert(
      pinnedArtifact != null &&
        pinnedArtifact.bytes === artifact.bytes &&
        pinnedArtifact.rawSha256 === artifact.rawSha256 &&
        pinnedArtifact.gitBlobSha1 === artifact.gitBlobSha1,
      `candidate source artifact does not match shared lock: ${artifact.file}`,
    );

    const manifestArtifact = manifestArtifacts.get(artifact.file);
    assert(
      manifestArtifact != null,
      `manifest source artifact missing: ${artifact.file}`,
    );
    assert(
      manifestArtifact.rawSha256 === artifact.rawSha256,
      `candidate and manifest raw SHA-256 differ for ${artifact.file}`,
    );
    if (manifestArtifact.gitBlobSha1 != null) {
      assert(
        manifestArtifact.gitBlobSha1 === artifact.gitBlobSha1,
        `candidate and manifest Git blob SHA-1 differ for ${artifact.file}`,
      );
    }
    if (manifestArtifact.bytes != null) {
      assert(
        manifestArtifact.bytes === artifact.bytes,
        `candidate and manifest byte lengths differ for ${artifact.file}`,
      );
    }

    return {
      file: artifact.file,
      rawUrl: pinnedArtifact.rawUrl,
      bytes: artifact.bytes,
      rawSha256: artifact.rawSha256,
      gitBlobSha1: artifact.gitBlobSha1,
    };
  });

  return {
    datasetId: dataset.datasetId,
    sourceMirror: KRDIC_SOURCE_MIRROR,
    sourceMirrorCommit: dataset.sourceMirrorCommit,
    licenseId: dataset.licenseId,
    artifacts,
  };
}

function validateCandidates(candidateDocument) {
  assert(
    candidateDocument?.contentLocale === "ko-KR",
    `unexpected candidate locale: ${candidateDocument?.contentLocale}`,
  );
  const candidates = asArray(candidateDocument?.candidates);
  assert(
    candidates.length === EXPECTED_CANDIDATE_COUNT,
    `expected ${EXPECTED_CANDIDATE_COUNT} candidates, received ${candidates.length}`,
  );

  const bySourceEntryId = new Map();
  for (const candidate of candidates) {
    const sourceEntryId = normalizeText(candidate?.sourceEntryId);
    const answer = normalizeText(candidate?.answer);
    const definition = normalizeDefinition(candidate?.definition);
    assert(
      /^[0-9]+$/.test(sourceEntryId),
      `invalid sourceEntryId: ${sourceEntryId}`,
    );
    assert(answer !== "", `candidate ${sourceEntryId} has no answer`);
    assert(definition !== "", `candidate ${sourceEntryId} has no definition`);
    assert(
      sourceEntryId === candidate.sourceEntryId &&
        answer === candidate.answer &&
        definition === candidate.definition,
      `candidate ${sourceEntryId} is not NFC/whitespace normalized`,
    );
    assert(
      candidate.definitionChecksum ===
        sha256(
          canonicalCandidateDefinition(
            candidate,
            candidateDocument.contentLocale,
          ),
        ),
      `candidate definition checksum mismatch: ${sourceEntryId}`,
    );
    assert(
      !bySourceEntryId.has(sourceEntryId),
      `duplicate candidate sourceEntryId: ${sourceEntryId}`,
    );
    bySourceEntryId.set(sourceEntryId, candidate);
  }
  return bySourceEntryId;
}

async function readContext() {
  const candidateAbsolutePath = path.join(repositoryRoot, CANDIDATE_PATH);
  const manifestAbsolutePath = path.join(repositoryRoot, LICENSE_MANIFEST_PATH);
  const [candidateBuffer, manifestBuffer] = await Promise.all([
    readFile(candidateAbsolutePath),
    readFile(manifestAbsolutePath),
  ]);
  const candidateDocument = JSON.parse(candidateBuffer.toString("utf8"));
  const manifestDocument = JSON.parse(manifestBuffer.toString("utf8"));
  const sourceLocks = parseSourceLocks(candidateDocument, manifestDocument);
  const candidatesBySourceEntryId = validateCandidates(candidateDocument);

  return {
    candidateDocument,
    candidateFileSha256: sha256(candidateBuffer),
    sourceLocks,
    sourceLockSha256: sha256(canonicalSourceLock(sourceLocks)),
    candidatesBySourceEntryId,
  };
}

async function download(url, destination) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(180_000),
        headers: { "user-agent": "crossword-puzzle-provenance-verifier/1" },
      });
      assert(response.ok, `download failed (${response.status}): ${url}`);
      assert(response.body != null, `download returned no body: ${url}`);
      await pipeline(
        Readable.fromWeb(response.body),
        createWriteStream(destination, { flags: "w" }),
      );
      return;
    } catch (error) {
      lastError = error;
      await rm(destination, { force: true });
      if (attempt < 3) {
        console.warn(
          `retrying ${url} after attempt ${attempt}: ${error.message}`,
        );
      }
    }
  }
  throw lastError;
}

async function verifyAndExtractArtifact(
  artifact,
  temporaryDirectory,
  candidatesBySourceEntryId,
  locatedRecords,
) {
  const temporaryPath = path.join(temporaryDirectory, artifact.file);
  console.log(`downloading ${artifact.file} from pinned commit`);
  await download(artifact.rawUrl, temporaryPath);

  const rawBuffer = await readFile(temporaryPath);
  verifyKrdictSourceArtifact(rawBuffer, artifact);

  const parser = new XMLParser({
    allowBooleanAttributes: true,
    attributeNamePrefix: "",
    ignoreAttributes: false,
    isArray: (name) => ["LexicalEntry", "Sense", "feat"].includes(name),
  });
  const document = parser.parse(rawBuffer.toString("utf8"));
  const entries = asArray(document?.LexicalResource?.Lexicon?.LexicalEntry);
  let matchedCount = 0;

  for (const entry of entries) {
    const sourceEntryId = normalizeText(entry?.val);
    const candidate = candidatesBySourceEntryId.get(sourceEntryId);
    if (candidate == null) continue;
    const sourceRecord = extractSourceRecord(entry);
    // KRDIC reuses some numeric IDs for related idiom/proverb LexicalEntry
    // records. The reviewed tuple (ID + written form + definition), rather than
    // the numeric ID alone, is therefore the provenance identity.
    if (
      !sourceRecord.writtenForms.includes(candidate.answer) ||
      !sourceRecord.definitions.includes(candidate.definition)
    ) {
      continue;
    }
    const existing = locatedRecords.get(sourceEntryId);
    if (existing != null) {
      assert(
        existing.artifact.file === artifact.file &&
          canonicalSourceRecord(existing.sourceRecord) ===
            canonicalSourceRecord(sourceRecord),
        `source tuple ${sourceEntryId}/${candidate.answer} is ambiguous across LexicalEntry records`,
      );
      continue;
    }
    locatedRecords.set(sourceEntryId, {
      candidate,
      artifact,
      sourceRecord,
    });
    matchedCount += 1;
  }

  await rm(temporaryPath, { force: true });
  console.log(
    `verified ${artifact.file}: ${artifact.bytes} bytes, ${matchedCount} candidate records`,
  );
}

function buildIndex(context, locatedRecords) {
  const entries = [...locatedRecords.values()]
    .map(({ candidate, artifact, sourceRecord }) => ({
      sourceEntryId: candidate.sourceEntryId,
      answer: candidate.answer,
      definitionChecksum: candidate.definitionChecksum,
      sourceArtifact: {
        file: artifact.file,
        rawSha256: artifact.rawSha256,
        gitBlobSha1: artifact.gitBlobSha1,
      },
      sourceRecordSha256: sha256(canonicalSourceRecord(sourceRecord)),
      sourceRecord,
    }))
    .sort(compareSourceEntryIds);

  return {
    schemaVersion: "krdict-launch-source-provenance/1",
    contentLocale: context.candidateDocument.contentLocale,
    candidateFile: {
      path: CANDIDATE_PATH,
      sha256: context.candidateFileSha256,
    },
    sourceDataset: {
      datasetId: context.sourceLocks.datasetId,
      sourceMirror: context.sourceLocks.sourceMirror,
      sourceMirrorCommit: context.sourceLocks.sourceMirrorCommit,
      licenseId: context.sourceLocks.licenseId,
      sourceLockSha256: context.sourceLockSha256,
      sourceArtifacts: context.sourceLocks.artifacts,
    },
    summary: {
      candidateCount: context.candidatesBySourceEntryId.size,
      sourceRecordCount: entries.length,
      sourceArtifactCount: context.sourceLocks.artifacts.length,
    },
    entries,
  };
}

function validateIndex(index, context) {
  assert(
    index?.schemaVersion === "krdict-launch-source-provenance/1",
    `unexpected provenance index schema: ${index?.schemaVersion}`,
  );
  assert(
    index.contentLocale === context.candidateDocument.contentLocale,
    "index locale mismatch",
  );
  assert(
    index.candidateFile?.path === CANDIDATE_PATH,
    "index candidate path mismatch",
  );
  assert(
    index.candidateFile?.sha256 === context.candidateFileSha256,
    "index candidate hash is stale; run with --refresh",
  );
  const indexedDataset = index.sourceDataset;
  assert(
    indexedDataset?.datasetId === context.sourceLocks.datasetId,
    "index dataset ID mismatch",
  );
  assert(
    indexedDataset?.sourceMirror === context.sourceLocks.sourceMirror,
    "index source mirror mismatch",
  );
  assert(
    indexedDataset?.sourceMirrorCommit ===
      context.sourceLocks.sourceMirrorCommit,
    "index source commit mismatch",
  );
  assert(
    indexedDataset?.licenseId === context.sourceLocks.licenseId,
    "index license mismatch",
  );
  assert(
    indexedDataset?.sourceLockSha256 === context.sourceLockSha256,
    "index source lock checksum mismatch",
  );
  assert(
    JSON.stringify(indexedDataset?.sourceArtifacts) ===
      JSON.stringify(context.sourceLocks.artifacts),
    "index source artifacts do not match candidate/manifest locks",
  );

  const entries = asArray(index.entries);
  assert(
    entries.length === context.candidatesBySourceEntryId.size,
    `index entry count mismatch: expected ${context.candidatesBySourceEntryId.size}, received ${entries.length}`,
  );
  assert(
    JSON.stringify(entries) ===
      JSON.stringify([...entries].sort(compareSourceEntryIds)),
    "index entries are not in deterministic sourceEntryId order",
  );

  const artifactsByFile = new Map(
    context.sourceLocks.artifacts.map((artifact) => [artifact.file, artifact]),
  );
  const seen = new Set();
  for (const entry of entries) {
    const candidate = context.candidatesBySourceEntryId.get(
      entry.sourceEntryId,
    );
    assert(
      candidate != null,
      `index has unknown sourceEntryId: ${entry.sourceEntryId}`,
    );
    assert(
      !seen.has(entry.sourceEntryId),
      `index has duplicate sourceEntryId: ${entry.sourceEntryId}`,
    );
    seen.add(entry.sourceEntryId);
    assert(
      entry.answer === candidate.answer,
      `index answer mismatch: ${entry.sourceEntryId}`,
    );
    assert(
      entry.definitionChecksum === candidate.definitionChecksum,
      `index definition checksum mismatch: ${entry.sourceEntryId}`,
    );
    assert(
      entry.sourceRecordSha256 ===
        sha256(canonicalSourceRecord(entry.sourceRecord)),
      `index source record checksum mismatch: ${entry.sourceEntryId}`,
    );
    assert(
      entry.sourceRecord?.sourceEntryId === entry.sourceEntryId,
      `index source record ID mismatch: ${entry.sourceEntryId}`,
    );
    assert(
      asArray(entry.sourceRecord?.writtenForms).includes(candidate.answer),
      `index source record does not contain answer: ${entry.sourceEntryId}`,
    );
    assert(
      asArray(entry.sourceRecord?.definitions).includes(candidate.definition),
      `index source record does not contain definition: ${entry.sourceEntryId}`,
    );

    const artifact = artifactsByFile.get(entry.sourceArtifact?.file);
    assert(
      artifact != null,
      `index source artifact is unknown: ${entry.sourceArtifact?.file}`,
    );
    assert(
      entry.sourceArtifact.rawSha256 === artifact.rawSha256 &&
        entry.sourceArtifact.gitBlobSha1 === artifact.gitBlobSha1,
      `index source artifact lock mismatch: ${entry.sourceEntryId}`,
    );
  }

  assert(
    index.summary?.candidateCount === context.candidatesBySourceEntryId.size &&
      index.summary?.sourceRecordCount === entries.length &&
      index.summary?.sourceArtifactCount ===
        context.sourceLocks.artifacts.length,
    "index summary mismatch",
  );
}

async function refresh() {
  const context = await readContext();
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "crossword-krdict-provenance-"),
  );
  const locatedRecords = new Map();

  try {
    for (const artifact of context.sourceLocks.artifacts) {
      await verifyAndExtractArtifact(
        artifact,
        temporaryDirectory,
        context.candidatesBySourceEntryId,
        locatedRecords,
      );
    }
    assert(
      locatedRecords.size === context.candidatesBySourceEntryId.size,
      `only ${locatedRecords.size}/${context.candidatesBySourceEntryId.size} candidate source records were found`,
    );

    const currentContext = await readContext();
    assert(
      currentContext.candidateFileSha256 === context.candidateFileSha256 &&
        currentContext.sourceLockSha256 === context.sourceLockSha256,
      "candidate or KRDIC source lock changed during refresh; retry with --refresh",
    );
    const index = buildIndex(context, locatedRecords);
    validateIndex(index, context);
    await writeFile(
      path.join(repositoryRoot, INDEX_PATH),
      `${JSON.stringify(index, null, 2)}\n`,
    );
    console.log(
      `wrote ${INDEX_PATH}: ${index.summary.sourceRecordCount} records from ${index.summary.sourceArtifactCount} verified XML artifacts`,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function validateLocal() {
  const context = await readContext();
  let indexBuffer;
  try {
    indexBuffer = await readFile(path.join(repositoryRoot, INDEX_PATH));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `provenance index is missing; run ${path.basename(import.meta.filename)} --refresh`,
      );
    }
    throw error;
  }
  const index = JSON.parse(indexBuffer.toString("utf8"));
  validateIndex(index, context);
  console.log(
    `verified ${INDEX_PATH}: ${index.summary.sourceRecordCount} records, pinned commit ${index.sourceDataset.sourceMirrorCommit}`,
  );
}

const argumentsSet = new Set(process.argv.slice(2));
assert(
  [...argumentsSet].every((argument) => argument === "--refresh"),
  `unknown argument: ${[...argumentsSet].find((argument) => argument !== "--refresh")}`,
);

(argumentsSet.has("--refresh") ? refresh() : validateLocal()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
