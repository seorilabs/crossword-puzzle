import {
  validateGameContentV1,
  verifyGameContentChecksum,
  type GameContentV1,
} from "./gameContent.ts";
import {
  validateKoKrLaunchContentCatalogStructureV1,
  validateWorldMapGraphV1,
  type KoKrLaunchContentCatalogV1,
  type WorldMapGraphV1,
} from "./launchContentCatalog.ts";
import { canonicalizeForChecksum } from "./saveV2.ts";
import { sha256Checksum } from "./sha256.ts";

export const GAME_CONTENT_CURRENT_SCHEMA_VERSION =
  "game-content-current/1" as const;
export const GAME_CONTENT_PACK_INDEX_SCHEMA_VERSION =
  "game-content-pack-index/1" as const;
export const GAME_CONTENT_LICENSE_MANIFEST_SCHEMA_VERSION =
  "game-content-license-manifest/1" as const;
export const KO_KR_GAME_CONTENT_CURRENT_PATH =
  "/game-content/v1/ko-KR/current.json" as const;
export const KO_KR_GAME_CONTENT_LICENSE_MANIFEST_PATH =
  "/game-content/v1/ko-KR/license-manifest.json" as const;

const CONTENT_ROOT = "/game-content/v1/ko-KR";
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;

type UnknownRecord = Record<string, unknown>;

export type GameContentArtifactReferenceV1 = {
  path: string;
  sha256: string;
};

export type GameContentCurrentPointerV1 = {
  schemaVersion: typeof GAME_CONTENT_CURRENT_SCHEMA_VERSION;
  artifactStatus: "approved";
  activationApproved: true;
  contentLocale: "ko-KR";
  catalog: GameContentArtifactReferenceV1;
  worldMap: GameContentArtifactReferenceV1;
  packIndex: GameContentArtifactReferenceV1;
  license: GameContentArtifactReferenceV1;
};

export type GameContentPackIndexRowV1 = {
  puzzleId: string;
  packId: string;
  contentChecksum: string;
  path: string;
};

export type ApprovedGameContentPackIndexV1 = {
  schemaVersion: typeof GAME_CONTENT_PACK_INDEX_SCHEMA_VERSION;
  artifactStatus: "approved";
  activationApproved: true;
  contentLocale: "ko-KR";
  catalogId: string;
  packs: GameContentPackIndexRowV1[];
};

export type PinnedGameContentLicenseManifestV1 = UnknownRecord & {
  schemaVersion: typeof GAME_CONTENT_LICENSE_MANIFEST_SCHEMA_VERSION;
  artifactStatus: "candidate";
  activationApproved: false;
  contentLocale: "ko-KR";
  manifestId: string;
};

export type ApprovedGameContentMetadataV1 = {
  pointer: GameContentCurrentPointerV1;
  catalog: KoKrLaunchContentCatalogV1;
  worldMap: WorldMapGraphV1;
  packIndex: ApprovedGameContentPackIndexV1;
  license: PinnedGameContentLicenseManifestV1;
};

/** Network, origin, cache, and authentication policy belongs to its adapter. */
export type GameContentArtifactFetchPort = {
  fetch(path: string): Promise<string | Uint8Array>;
};

export type ProductionGameContentRepository = {
  loadMetadata(): Promise<ApprovedGameContentMetadataV1>;
  loadPack(
    metadata: ApprovedGameContentMetadataV1,
    puzzleId: string,
  ): Promise<GameContentV1 | null>;
};

export type ProductionContentErrorCode =
  | "artifact_fetch_failed"
  | "checksum_mismatch"
  | "duplicate_json_key"
  | "invalid_artifact"
  | "invalid_json"
  | "invalid_path"
  | "invalid_pointer";

export class ProductionContentError extends Error {
  readonly code: ProductionContentErrorCode;
  readonly artifactPath?: string;

  constructor(
    code: ProductionContentErrorCode,
    message: string,
    artifactPath?: string,
  ) {
    super(message);
    this.name = "ProductionContentError";
    this.code = code;
    this.artifactPath = artifactPath;
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function fail(
  code: ProductionContentErrorCode,
  message: string,
  artifactPath?: string,
): never {
  throw new ProductionContentError(code, message, artifactPath);
}

function requireRecord(
  value: unknown,
  label: string,
  code: ProductionContentErrorCode = "invalid_artifact",
): UnknownRecord {
  if (!isRecord(value)) fail(code, `${label} must be an object`);
  return value;
}

function requireExactKeys(
  value: UnknownRecord,
  expected: readonly string[],
  label: string,
  code: ProductionContentErrorCode = "invalid_artifact",
) {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (
    actual.length !== required.length ||
    actual.some((key, index) => key !== required[index])
  ) {
    fail(code, `${label} keys must be exactly ${required.join(",")}`);
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail("invalid_artifact", `${label} must be a non-empty string`);
  }
  return value;
}

function requireApprovedEnvelope(value: UnknownRecord, label: string) {
  if (
    value.artifactStatus !== "approved" ||
    value.activationApproved !== true
  ) {
    fail(
      "invalid_artifact",
      `${label} must be explicitly approved and activationApproved`,
    );
  }
}

function requireKoKr(value: UnknownRecord, label: string) {
  if (value.contentLocale !== "ko-KR") {
    fail("invalid_artifact", `${label} contentLocale must be ko-KR`);
  }
}

/** A checksum-pinned absolute path is immutable to the reader. */
function requireImmutableKoKrPath(path: unknown, label: string): string {
  if (typeof path !== "string") fail("invalid_path", `${label} must be a path`);
  const lower = path.toLowerCase();
  if (
    !path.startsWith(`${CONTENT_ROOT}/`) ||
    path === KO_KR_GAME_CONTENT_CURRENT_PATH ||
    !path.endsWith(".json") ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.includes("?") ||
    path.includes("#") ||
    path.includes("//") ||
    path.split("/").some((segment) => segment === "." || segment === "..") ||
    lower.includes("/candidates/") ||
    /%(?:2e|2f|5c)/i.test(path)
  ) {
    fail("invalid_path", `${label} is not an immutable ko-KR artifact path`);
  }
  return path;
}

function requireSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail("invalid_artifact", `${label} must be a lowercase SHA-256 checksum`);
  }
  return value;
}

function readJsonStringEnd(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (code === 0x22) return index + 1;
    if (code < 0x20)
      fail("invalid_json", "JSON string contains a control byte");
    if (code === 0x5c) {
      index += 1;
      const escaped = text[index];
      if (escaped === "u") {
        if (!/^[0-9a-fA-F]{4}$/.test(text.slice(index + 1, index + 5))) {
          fail(
            "invalid_json",
            "JSON string contains an invalid unicode escape",
          );
        }
        index += 5;
        continue;
      }
      if (escaped == null || !'"\\/bfnrt'.includes(escaped)) {
        fail("invalid_json", "JSON string contains an invalid escape");
      }
    }
    index += 1;
  }
  fail("invalid_json", "JSON string is unterminated");
}

/** JSON.parse drops duplicate keys, so scan the original document first. */
function assertNoDuplicateJsonKeys(text: string) {
  let index = 0;
  const whitespace = /\s/;
  const skip = () => {
    while (index < text.length && whitespace.test(text[index])) index += 1;
  };
  const scanValue = (): void => {
    skip();
    const token = text[index];
    if (token === "{") {
      index += 1;
      skip();
      const keys = new Set<string>();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      while (true) {
        skip();
        if (text[index] !== '"')
          fail("invalid_json", "JSON object key expected");
        const start = index;
        index = readJsonStringEnd(text, start);
        let key: string;
        try {
          key = JSON.parse(text.slice(start, index)) as string;
        } catch {
          fail("invalid_json", "JSON object key is invalid");
        }
        if (keys.has(key))
          fail("duplicate_json_key", `duplicate JSON key: ${key}`);
        keys.add(key);
        skip();
        if (text[index] !== ":") fail("invalid_json", "JSON colon expected");
        index += 1;
        scanValue();
        skip();
        if (text[index] === "}") {
          index += 1;
          return;
        }
        if (text[index] !== ",") fail("invalid_json", "JSON comma expected");
        index += 1;
      }
    }
    if (token === "[") {
      index += 1;
      skip();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      while (true) {
        scanValue();
        skip();
        if (text[index] === "]") {
          index += 1;
          return;
        }
        if (text[index] !== ",") fail("invalid_json", "JSON comma expected");
        index += 1;
      }
    }
    if (token === '"') {
      index = readJsonStringEnd(text, index);
      return;
    }
    const primitive = text
      .slice(index)
      .match(
        /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/,
      )?.[0];
    if (primitive == null) fail("invalid_json", "invalid JSON value");
    index += primitive.length;
  };
  scanValue();
  skip();
  if (index !== text.length) fail("invalid_json", "trailing JSON content");
}

function decodeUtf8Bytes(value: Uint8Array): string {
  let output = "";
  let index = 0;
  while (index < value.length) {
    const first = value[index++];
    if (first <= 0x7f) {
      output += String.fromCharCode(first);
      continue;
    }

    let codePoint: number;
    let continuationCount: number;
    let secondMin = 0x80;
    let secondMax = 0xbf;
    if (first >= 0xc2 && first <= 0xdf) {
      codePoint = first & 0x1f;
      continuationCount = 1;
    } else if (first >= 0xe0 && first <= 0xef) {
      codePoint = first & 0x0f;
      continuationCount = 2;
      if (first === 0xe0) secondMin = 0xa0;
      if (first === 0xed) secondMax = 0x9f;
    } else if (first >= 0xf0 && first <= 0xf4) {
      codePoint = first & 0x07;
      continuationCount = 3;
      if (first === 0xf0) secondMin = 0x90;
      if (first === 0xf4) secondMax = 0x8f;
    } else {
      fail("invalid_json", "artifact is not valid UTF-8");
    }

    if (index + continuationCount > value.length) {
      fail("invalid_json", "artifact is not valid UTF-8");
    }
    for (let offset = 0; offset < continuationCount; offset += 1) {
      const next = value[index + offset];
      const minimum = offset === 0 ? secondMin : 0x80;
      const maximum = offset === 0 ? secondMax : 0xbf;
      if (next < minimum || next > maximum) {
        fail("invalid_json", "artifact is not valid UTF-8");
      }
      codePoint = (codePoint << 6) | (next & 0x3f);
    }
    index += continuationCount;

    if (codePoint <= 0xffff) {
      output += String.fromCharCode(codePoint);
    } else {
      const surrogate = codePoint - 0x10000;
      output += String.fromCharCode(
        0xd800 + (surrogate >> 10),
        0xdc00 + (surrogate & 0x3ff),
      );
    }
  }
  return output;
}

function decodeArtifact(value: string | Uint8Array): string {
  return typeof value === "string" ? value : decodeUtf8Bytes(value);
}

function parseArtifact(value: string | Uint8Array, path: string): unknown {
  const text = decodeArtifact(value);
  try {
    assertNoDuplicateJsonKeys(text);
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof ProductionContentError) {
      throw new ProductionContentError(error.code, error.message, path);
    }
    fail("invalid_json", `artifact is not valid JSON: ${path}`, path);
  }
}

export function calculateCanonicalArtifactChecksum(value: unknown): string {
  return sha256Checksum(canonicalizeForChecksum(value));
}

export function validateGameContentCurrentPointerV1(
  value: unknown,
): GameContentCurrentPointerV1 {
  const pointer = requireRecord(value, "current pointer", "invalid_pointer");
  requireExactKeys(
    pointer,
    [
      "schemaVersion",
      "artifactStatus",
      "activationApproved",
      "contentLocale",
      "catalog",
      "worldMap",
      "packIndex",
      "license",
    ],
    "current pointer",
    "invalid_pointer",
  );
  if (
    pointer.schemaVersion !== GAME_CONTENT_CURRENT_SCHEMA_VERSION ||
    pointer.artifactStatus !== "approved" ||
    pointer.activationApproved !== true ||
    pointer.contentLocale !== "ko-KR"
  ) {
    fail("invalid_pointer", "current pointer is not an approved ko-KR pointer");
  }

  const readReference = (
    key: "catalog" | "worldMap" | "packIndex" | "license",
  ) => {
    const reference = requireRecord(
      pointer[key],
      `current pointer ${key}`,
      "invalid_pointer",
    );
    requireExactKeys(
      reference,
      ["path", "sha256"],
      `current pointer ${key}`,
      "invalid_pointer",
    );
    return {
      path: requireImmutableKoKrPath(reference.path, `${key}.path`),
      sha256: requireSha256(reference.sha256, `${key}.sha256`),
    };
  };
  const catalog = readReference("catalog");
  const worldMap = readReference("worldMap");
  const packIndex = readReference("packIndex");
  const license = readReference("license");
  if (license.path !== KO_KR_GAME_CONTENT_LICENSE_MANIFEST_PATH) {
    fail(
      "invalid_pointer",
      `license.path must be ${KO_KR_GAME_CONTENT_LICENSE_MANIFEST_PATH}`,
    );
  }
  const paths = [catalog.path, worldMap.path, packIndex.path, license.path];
  if (new Set(paths).size !== paths.length) {
    fail("invalid_pointer", "current pointer artifact paths must be unique");
  }
  return {
    schemaVersion: GAME_CONTENT_CURRENT_SCHEMA_VERSION,
    artifactStatus: "approved",
    activationApproved: true,
    contentLocale: "ko-KR",
    catalog,
    worldMap,
    packIndex,
    license,
  };
}

function validateApprovedCatalog(value: unknown): {
  catalog: KoKrLaunchContentCatalogV1;
  artifactPaths: string[];
} {
  const raw = requireRecord(value, "catalog");
  requireExactKeys(
    raw,
    [
      "schemaVersion",
      "artifactStatus",
      "activationApproved",
      "generatedAt",
      "catalogId",
      "contentLocale",
      "releaseTimeZone",
      "languageProfile",
      "boards",
    ],
    "catalog",
  );
  requireApprovedEnvelope(raw, "catalog");
  requireKoKr(raw, "catalog");
  requireString(raw.generatedAt, "catalog.generatedAt");
  if (!Array.isArray(raw.boards))
    fail("invalid_artifact", "catalog.boards must be an array");
  const artifactPaths = raw.boards.map((board, index) => {
    const rawBoard = requireRecord(board, `catalog.boards[${index}]`);
    requireExactKeys(
      rawBoard,
      ["route", "content", "artifactPath"],
      `catalog.boards[${index}]`,
    );
    return requireImmutableKoKrPath(
      rawBoard.artifactPath,
      `catalog.boards[${index}].artifactPath`,
    );
  });
  const result = validateKoKrLaunchContentCatalogStructureV1(raw, {
    verifyContentChecksum: verifyGameContentChecksum,
  });
  if (!result.pass || result.catalog == null) {
    fail(
      "invalid_artifact",
      `catalog validation failed: ${result.issues.map((issue) => `${issue.code}:${issue.path}`).join(",")}`,
    );
  }
  return { catalog: result.catalog, artifactPaths };
}

function validateApprovedWorldMap(
  value: unknown,
  catalog: KoKrLaunchContentCatalogV1,
): WorldMapGraphV1 {
  const raw = requireRecord(value, "world map");
  requireExactKeys(
    raw,
    [
      "schemaVersion",
      "artifactStatus",
      "activationApproved",
      "graphId",
      "catalogId",
      "contentLocale",
      "nodes",
      "branchPoints",
    ],
    "world map",
  );
  requireApprovedEnvelope(raw, "world map");
  requireKoKr(raw, "world map");
  const result = validateWorldMapGraphV1(raw, catalog);
  if (!result.pass || result.graph == null) {
    fail(
      "invalid_artifact",
      `world map validation failed: ${result.issues.map((issue) => `${issue.code}:${issue.path}`).join(",")}`,
    );
  }
  return result.graph;
}

function validateApprovedPackIndex(
  value: unknown,
  catalog: KoKrLaunchContentCatalogV1,
  catalogArtifactPaths: readonly string[],
): ApprovedGameContentPackIndexV1 {
  const raw = requireRecord(value, "pack index");
  requireExactKeys(
    raw,
    [
      "schemaVersion",
      "artifactStatus",
      "activationApproved",
      "contentLocale",
      "catalogId",
      "packs",
    ],
    "pack index",
  );
  requireApprovedEnvelope(raw, "pack index");
  requireKoKr(raw, "pack index");
  if (
    raw.schemaVersion !== GAME_CONTENT_PACK_INDEX_SCHEMA_VERSION ||
    raw.catalogId !== catalog.catalogId ||
    !Array.isArray(raw.packs) ||
    raw.packs.length !== catalog.boards.length
  ) {
    fail(
      "invalid_artifact",
      "pack index schema, catalog identity, or count mismatch",
    );
  }
  const packs = raw.packs.map((item, index): GameContentPackIndexRowV1 => {
    const row = requireRecord(item, `pack index.packs[${index}]`);
    requireExactKeys(
      row,
      ["puzzleId", "packId", "contentChecksum", "path"],
      `pack index.packs[${index}]`,
    );
    const board = catalog.boards[index];
    if (board == null)
      fail("invalid_artifact", "pack index contains an unknown row");
    const path = requireImmutableKoKrPath(
      row.path,
      `pack index.packs[${index}].path`,
    );
    const expectedPath = `${CONTENT_ROOT}/packs/${board.content.packId}/${board.content.contentChecksum}.json`;
    if (
      row.puzzleId !== board.content.puzzleId ||
      row.packId !== board.content.packId ||
      row.contentChecksum !== board.content.contentChecksum ||
      path !== expectedPath ||
      path !== catalogArtifactPaths[index]
    ) {
      fail(
        "invalid_artifact",
        `pack index row ${index} does not exactly join the catalog`,
      );
    }
    return {
      puzzleId: board.content.puzzleId,
      packId: board.content.packId,
      contentChecksum: board.content.contentChecksum,
      path,
    };
  });
  if (
    new Set(packs.map((row) => row.puzzleId)).size !== packs.length ||
    new Set(packs.map((row) => row.path)).size !== packs.length
  ) {
    fail(
      "invalid_artifact",
      "pack index puzzleId and path values must be unique",
    );
  }
  return {
    schemaVersion: GAME_CONTENT_PACK_INDEX_SCHEMA_VERSION,
    artifactStatus: "approved",
    activationApproved: true,
    contentLocale: "ko-KR",
    catalogId: catalog.catalogId,
    packs,
  };
}

function validatePinnedLicense(
  value: unknown,
): PinnedGameContentLicenseManifestV1 {
  const raw = requireRecord(value, "license manifest");
  // Provenance의 심층 policy 검증은 출시 최종 validator가 담당한다. Reader는
  // canonical checksum에 영향을 주는 top-level shape와 reviewed candidate 상태만
  // exact 고정한다. 실제 활성화 권한은 approved current pointer에만 있다.
  requireExactKeys(
    raw,
    [
      "schemaVersion",
      "manifestId",
      "contentLocale",
      "artifactStatus",
      "activationApproved",
      "generatedAt",
      "sourceInputLock",
      "licenses",
      "sources",
      "reviewEvidence",
      "sourceProvenanceIndex",
    ],
    "license manifest",
  );
  if (raw.artifactStatus !== "candidate" || raw.activationApproved !== false) {
    fail(
      "invalid_artifact",
      "license manifest must preserve its reviewed candidate identity",
    );
  }
  requireKoKr(raw, "license manifest");
  if (raw.schemaVersion !== GAME_CONTENT_LICENSE_MANIFEST_SCHEMA_VERSION) {
    fail("invalid_artifact", "license manifest schemaVersion is invalid");
  }
  requireString(raw.manifestId, "license manifest.manifestId");
  requireString(raw.generatedAt, "license manifest.generatedAt");
  requireRecord(raw.sourceInputLock, "license manifest.sourceInputLock");
  requireRecord(raw.reviewEvidence, "license manifest.reviewEvidence");
  requireRecord(
    raw.sourceProvenanceIndex,
    "license manifest.sourceProvenanceIndex",
  );
  if (!Array.isArray(raw.licenses) || !Array.isArray(raw.sources)) {
    fail(
      "invalid_artifact",
      "license manifest licenses and sources must be arrays",
    );
  }
  return raw as PinnedGameContentLicenseManifestV1;
}

function validateCatalogLicenseReferences(
  catalog: KoKrLaunchContentCatalogV1,
  license: PinnedGameContentLicenseManifestV1,
  checksum: string,
) {
  for (const [index, board] of catalog.boards.entries()) {
    if (
      board.content.licenseManifestId !== license.manifestId ||
      board.content.licenseManifestChecksum !== checksum
    ) {
      fail(
        "invalid_artifact",
        `catalog board ${index} license manifest identity mismatch`,
      );
    }
  }
}

async function fetchParsed(
  port: GameContentArtifactFetchPort,
  path: string,
): Promise<unknown> {
  let payload: string | Uint8Array;
  try {
    payload = await port.fetch(path);
  } catch {
    fail("artifact_fetch_failed", `artifact fetch failed: ${path}`, path);
  }
  return parseArtifact(payload, path);
}

function verifyReference(
  value: unknown,
  reference: GameContentArtifactReferenceV1,
) {
  if (calculateCanonicalArtifactChecksum(value) !== reference.sha256) {
    fail(
      "checksum_mismatch",
      `artifact checksum mismatch: ${reference.path}`,
      reference.path,
    );
  }
}

export function createProductionGameContentRepository(
  port: GameContentArtifactFetchPort,
): ProductionGameContentRepository {
  return {
    async loadMetadata() {
      const pointerValue = await fetchParsed(
        port,
        KO_KR_GAME_CONTENT_CURRENT_PATH,
      );
      const pointer = validateGameContentCurrentPointerV1(pointerValue);
      const [catalogValue, worldMapValue, packIndexValue, licenseValue] =
        await Promise.all([
          fetchParsed(port, pointer.catalog.path),
          fetchParsed(port, pointer.worldMap.path),
          fetchParsed(port, pointer.packIndex.path),
          fetchParsed(port, pointer.license.path),
        ]);
      verifyReference(catalogValue, pointer.catalog);
      verifyReference(worldMapValue, pointer.worldMap);
      verifyReference(packIndexValue, pointer.packIndex);
      verifyReference(licenseValue, pointer.license);
      const { catalog, artifactPaths } = validateApprovedCatalog(catalogValue);
      const worldMap = validateApprovedWorldMap(worldMapValue, catalog);
      const packIndex = validateApprovedPackIndex(
        packIndexValue,
        catalog,
        artifactPaths,
      );
      const license = validatePinnedLicense(licenseValue);
      validateCatalogLicenseReferences(
        catalog,
        license,
        pointer.license.sha256,
      );
      return { pointer, catalog, worldMap, packIndex, license };
    },

    async loadPack(metadata, puzzleId) {
      const index = metadata.packIndex.packs.findIndex(
        (row) => row.puzzleId === puzzleId,
      );
      if (index < 0) return null;
      const row = metadata.packIndex.packs[index];
      const board = metadata.catalog.boards[index];
      if (row == null || board == null) {
        fail("invalid_artifact", "metadata pack index drifted from catalog");
      }
      const value = await fetchParsed(port, row.path);
      const validation = validateGameContentV1(value, {
        requestedContentLocale: "ko-KR",
        verifyChecksum: verifyGameContentChecksum,
      });
      if (!validation.pass || validation.content == null) {
        fail(
          "invalid_artifact",
          `pack validation failed: ${validation.issues.map((issue) => `${issue.code}:${issue.path}`).join(",")}`,
          row.path,
        );
      }
      if (
        validation.content.puzzleId !== row.puzzleId ||
        validation.content.packId !== row.packId ||
        validation.content.contentChecksum !== row.contentChecksum ||
        canonicalizeForChecksum(validation.content) !==
          canonicalizeForChecksum(board.content)
      ) {
        fail(
          "invalid_artifact",
          "loaded pack does not exactly join metadata",
          row.path,
        );
      }
      return validation.content;
    },
  };
}
