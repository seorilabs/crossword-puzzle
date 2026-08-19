#!/usr/bin/env node
// Xcode Cloud 빌드를 릴리즈 태그 대상으로 트리거하고 완료까지 기다린다.
//
// 왜 GitHub Actions에서 archive하지 않는가: Xcode 26.5부터 Firebase가 정적 라이브러리
// 지원을 끝내 use_frameworks! + RNFB 혼합 링키지가 필요해졌고, macOS runner 분량도
// 유한하다. Apple archive/upload는 Xcode Cloud로 이관했다(org 릴리즈 정책). 서명은
// Xcode Cloud 매니지드 서명이 처리하므로 인증서·프로비저닝 프로파일 시크릿이 필요 없다.
//
// Backoffice(seorilabs-backoffice src/lib/xcode-cloud/dispatch.ts)가 같은 ASC 경로를
// 쓴다. 여기서는 GitHub Actions 진입점에서도 같은 경로를 타게 해, 어느 쪽으로
// 배포하든 App Store가 조용히 빠지거나 macOS runner로 새지 않게 한다.

import { createSign } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const ASC_BASE = "https://api.appstoreconnect.apple.com";

// 태그 push와 Xcode Cloud의 SCM 인덱싱 사이 지연을 흡수한다. POST 전 조회만
// 반복하므로 중복 빌드를 만들지 않는다.
const TAG_REF_RETRY_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

const POLL_INTERVAL_MS = 30_000;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(`${name} 환경변수가 필요합니다.`);
  }
  return value;
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** ASC용 ES256 JWT. 유효기간은 Apple이 허용하는 20분 이내로 둔다. */
function createAscToken({ keyId, issuerId, privateKey }) {
  const header = base64url(
    JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }),
  );
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      iss: issuerId,
      iat: now,
      exp: now + 19 * 60,
      aud: "appstoreconnect-v1",
    }),
  );

  const signer = createSign("SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });

  return `${header}.${payload}.${base64url(signature)}`;
}

function createAscClient(token) {
  return async function asc(path, init = {}) {
    const response = await fetch(`${ASC_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `ASC ${init.method ?? "GET"} ${path} 실패: HTTP ${response.status} ${text.slice(0, 400)}`,
      );
    }
    return text === "" ? {} : JSON.parse(text);
  };
}

function asArray(data) {
  if (Array.isArray(data)) return data;
  return data == null ? [] : [data];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** bundleId로 Xcode Cloud 제품(ciProduct)을 찾는다. */
async function findProductId(asc, bundleId) {
  const doc = await asc("/v1/ciProducts?include=app&limit=200");
  const apps = doc.included ?? [];
  const product = asArray(doc.data).find((candidate) => {
    const appId = candidate.relationships?.app?.data?.id;
    return apps.find((app) => app.id === appId)?.attributes?.bundleId === bundleId;
  });

  if (!product) {
    throw new Error(`Xcode Cloud 제품이 없습니다(bundleId=${bundleId}).`);
  }
  return product.id;
}

function isAppStoreArchive(actions) {
  if (!Array.isArray(actions)) return false;
  return actions.some(
    (action) =>
      action?.actionType === "ARCHIVE" &&
      action?.platform === "IOS" &&
      action?.buildDistributionAudience === "APP_STORE_ELIGIBLE",
  );
}

/**
 * 같은 제품에 다른 앱의 잔존 workflow가 남아 있어도 요청 repo와 일치하는 활성
 * App Store Archive만 고른다. 0개나 2개 이상이면 임의 실행하지 않고 실패한다.
 */
function selectWorkflowForRepository(candidates, repoFullName) {
  const matched = candidates.filter(
    (candidate) =>
      candidate.repoFullName === repoFullName &&
      candidate.isEnabled &&
      isAppStoreArchive(candidate.actions),
  );

  if (matched.length !== 1) {
    const names = matched.map((candidate) => candidate.name).join(", ") || "없음";
    throw new Error(
      `Xcode Cloud workflow 선택 실패(repo=${repoFullName}, 일치=${matched.length}, 후보=${names})`,
    );
  }
  return matched[0].id;
}

async function pickWorkflowId(asc, productId, repoFullName) {
  const doc = await asc(`/v1/ciProducts/${productId}/workflows?limit=200`);

  // workflow마다 /repository를 한 번씩 더 부른다. 제품에 workflow가 많으면 병렬
  // 호출이 ASC rate limit에 걸리므로 순차로 돈다. 배포 1회의 준비 단계라 이 정도
  // 지연은 문제가 되지 않는다.
  const candidates = [];
  for (const workflow of asArray(doc.data)) {
    let workflowRepo = null;
    try {
      const repoDoc = await asc(
        `/v1/ciWorkflows/${encodeURIComponent(workflow.id)}/repository`,
      );
      const repo = asArray(repoDoc.data)[0];
      const owner = repo?.attributes?.ownerName;
      const name = repo?.attributes?.repositoryName;
      if (typeof owner === "string" && typeof name === "string") {
        workflowRepo = `${owner}/${name}`;
      }
    } catch {
      // 관계가 깨진 잔존 workflow는 후보에서 제외한다.
    }

    candidates.push({
      id: workflow.id,
      name: workflow.attributes?.name ?? workflow.id,
      repoFullName: workflowRepo,
      isEnabled: workflow.attributes?.isEnabled === true,
      actions: workflow.attributes?.actions,
    });
  }

  return selectWorkflowForRepository(candidates, repoFullName);
}

function findTagRefId(refs, tag) {
  return (
    refs.find(
      (ref) => ref.attributes?.kind === "TAG" && ref.attributes?.name === tag,
    )?.id ?? null
  );
}

async function resolveTagRefId(asc, productId, tag) {
  const repos = await asc(
    `/v1/ciProducts/${productId}/primaryRepositories?limit=10`,
  );
  const repoId = asArray(repos.data)[0]?.id;
  if (!repoId) {
    throw new Error("Xcode Cloud primary repository가 없습니다.");
  }

  for (const delayMs of TAG_REF_RETRY_DELAYS_MS) {
    if (delayMs > 0) await sleep(delayMs);
    const refs = await asc(
      `/v1/scmRepositories/${repoId}/gitReferences?limit=200`,
    );
    const refId = findTagRefId(asArray(refs.data), tag);
    if (refId) return refId;
  }

  const waitedSeconds = Math.ceil(
    TAG_REF_RETRY_DELAYS_MS.reduce((sum, delay) => sum + delay, 0) / 1000,
  );
  throw new Error(
    `태그 ref가 Xcode Cloud에 ${waitedSeconds}초 동안 동기화되지 않았습니다: ${tag}. ` +
      "workflow의 Manual Start - Tag(v*)와 SCM 연결 상태를 확인하세요.",
  );
}

/** 빌드가 끝날 때까지 기다린다. workflow 성공이 업로드 경로 증거가 되도록 한다. */
async function waitForBuildRun(asc, buildRunId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const doc = await asc(`/v1/ciBuildRuns/${buildRunId}`);
    const attributes = asArray(doc.data)[0]?.attributes ?? {};
    const { executionProgress: progress, completionStatus: completion } =
      attributes;

    if (progress === "COMPLETE") {
      return completion ?? "UNKNOWN";
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `빌드가 제한 시간 안에 끝나지 않았습니다(progress=${progress ?? "?"}). ` +
          "Xcode Cloud 콘솔에서 진행 상태를 확인하세요.",
      );
    }

    console.log(`  진행 중: progress=${progress ?? "?"}`);
    await sleep(POLL_INTERVAL_MS);
  }
}

function readPrivateKey() {
  const path = process.env.APP_STORE_CONNECT_API_KEY_PATH?.trim();
  if (path) {
    return readFileSync(path, "utf8");
  }

  const encoded = requireEnv("APP_STORE_CONNECT_PRIVATE_KEY_BASE64");
  return Buffer.from(encoded, "base64").toString("utf8");
}

async function main() {
  const { values } = parseArgs({
    options: {
      tag: { type: "string" },
      "bundle-id": { type: "string" },
      repo: { type: "string" },
      "timeout-minutes": { type: "string", default: "90" },
      // 빌드를 실제로 만들지 않고 제품·workflow·태그 ref 해석까지만 확인한다.
      "dry-run": { type: "boolean", default: false },
    },
  });

  const tag = values.tag?.trim();
  const bundleId = values["bundle-id"]?.trim();
  const repoFullName = values.repo?.trim();

  if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
    fail(`--tag는 vX.Y.Z 형식이어야 합니다. 받은 값: ${tag || "(없음)"}`);
  }
  if (!bundleId) fail("--bundle-id가 필요합니다.");
  if (!repoFullName) fail("--repo가 필요합니다(owner/name).");

  const timeoutMinutes = Number(values["timeout-minutes"]);
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
    fail(
      `--timeout-minutes는 양수여야 합니다. 받은 값: ${values["timeout-minutes"]}`,
    );
  }

  const asc = createAscClient(
    createAscToken({
      keyId: requireEnv("APP_STORE_CONNECT_API_KEY_ID"),
      issuerId: requireEnv("APP_STORE_CONNECT_ISSUER_ID"),
      privateKey: readPrivateKey(),
    }),
  );

  console.log(`Xcode Cloud 빌드 트리거: ${repoFullName} ${tag} (${bundleId})`);

  const productId = await findProductId(asc, bundleId);
  const [workflowId, refId] = await Promise.all([
    pickWorkflowId(asc, productId, repoFullName),
    resolveTagRefId(asc, productId, tag),
  ]);

  if (values["dry-run"]) {
    console.log(
      `dry-run: workflow=${workflowId} tagRef=${refId} — 빌드를 만들지 않고 종료합니다.`,
    );
    return;
  }

  const doc = await asc("/v1/ciBuildRuns", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "ciBuildRuns",
        relationships: {
          workflow: { data: { type: "ciWorkflows", id: workflowId } },
          sourceBranchOrTag: { data: { type: "scmGitReferences", id: refId } },
        },
      },
    }),
  });

  const run = asArray(doc.data)[0];
  const buildRunId = run?.id;
  const buildNumber = run?.attributes?.number ?? null;
  if (!buildRunId) {
    fail("ciBuildRuns 응답에 빌드런 id가 없습니다.");
  }

  console.log(`빌드 시작: #${buildNumber ?? "?"} (id=${buildRunId})`);
  writeSummary(`- Xcode Cloud 빌드: #${buildNumber ?? "?"} (id=\`${buildRunId}\`)`);

  const completion = await waitForBuildRun(
    asc,
    buildRunId,
    timeoutMinutes * 60_000,
  );

  writeSummary(`- 완료 상태: ${completion}`);

  if (completion !== "SUCCEEDED") {
    fail(`Xcode Cloud 빌드가 성공하지 않았습니다: ${completion}`);
  }

  console.log("빌드 성공. TestFlight 처리 상태는 App Store Connect에서 확인하세요.");
}

function writeSummary(line) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (path == null) return;
  appendFileSync(path, `${line}\n`);
}

try {
  await main();
} catch (error) {
  // ASC 오류는 메시지 자체가 원인을 담고 있다. CI 로그에 stack을 흘리지 않는다.
  fail(error instanceof Error ? error.message : String(error));
}
