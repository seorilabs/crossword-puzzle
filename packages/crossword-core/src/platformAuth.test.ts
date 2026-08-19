import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPlatformAuthParams,
  ensurePlatformSignIn,
  PLATFORM_API_BASE_URL,
  PLATFORM_APP_HEADER,
  PLATFORM_AUTH_APP_ID,
  PLATFORM_CUSTOM_TOKEN_PATH,
  PlatformAuthError,
  requestPlatformCustomToken,
} from "./platformAuth.ts";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function okBridge(
  captured?: { request?: Request },
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (captured != null) {
      captured.request = new Request(input as RequestInfo, init);
    }
    return jsonResponse(200, {
      ok: true,
      result: { firebaseCustomToken: "custom-token", appUserId: "pb_abc" },
    });
  }) as typeof fetch;
}

test("브리지 요청은 등록된 app id를 본문과 힌트 헤더 양쪽에 싣는다", async () => {
  const captured: { request?: Request } = {};

  const result = await requestPlatformCustomToken(okBridge(captured));

  const request = captured.request;
  assert.ok(request != null);
  assert.equal(
    request.url,
    `${PLATFORM_API_BASE_URL}${PLATFORM_CUSTOM_TOKEN_PATH}`,
  );
  assert.equal(request.method, "POST");
  assert.equal(request.headers.get(PLATFORM_APP_HEADER), PLATFORM_AUTH_APP_ID);
  assert.deepEqual(await request.json(), { appId: PLATFORM_AUTH_APP_ID });
  assert.deepEqual(result, {
    firebaseCustomToken: "custom-token",
    appUserId: "pb_abc",
  });
});

test("서버 에러 봉투는 code를 보존한 PlatformAuthError가 된다", async () => {
  const fetchImpl = (async () =>
    jsonResponse(403, {
      ok: false,
      error: { code: "app_paused", message: "잠시 중단됐어요" },
    })) as typeof fetch;

  await assert.rejects(
    () => requestPlatformCustomToken(fetchImpl),
    (error: unknown) => {
      assert.ok(error instanceof PlatformAuthError);
      assert.equal(error.code, "app_paused");
      assert.equal(error.status, 403);
      return true;
    },
  );
});

test("ok=true인데 result가 비면 응답 무효로 본다", async () => {
  const fetchImpl = (async () =>
    jsonResponse(200, { ok: true, result: { appUserId: "pb_abc" } })) as typeof fetch;

  await assert.rejects(
    () => requestPlatformCustomToken(fetchImpl),
    (error: unknown) =>
      error instanceof PlatformAuthError &&
      error.code === "platform_response_invalid",
  );
});

// HTTP 200이어도 ok=false면 실패다. status와 ok가 어긋난 응답을 성공으로 읽으면 안 된다.
test("status 200 + ok=false는 성공이 아니다", async () => {
  const fetchImpl = (async () =>
    jsonResponse(200, { ok: false, error: { code: "request_invalid" } })) as typeof fetch;

  await assert.rejects(
    () => requestPlatformCustomToken(fetchImpl),
    (error: unknown) =>
      error instanceof PlatformAuthError && error.code === "request_invalid",
  );
});

test("성공하면 받은 custom token으로 로그인하고 appUserId를 돌려준다", async () => {
  const signedIn: string[] = [];

  const outcome = await ensurePlatformSignIn({
    getCurrentUserId: async () => null,
    signInWithCustomToken: async (token) => {
      signedIn.push(token);
    },
    fetchImpl: okBridge(),
  });

  assert.deepEqual(outcome, { status: "signed-in", appUserId: "pb_abc" });
  assert.deepEqual(signedIn, ["custom-token"]);
});

test("이미 로그인했으면 브리지를 부르지 않는다", async () => {
  let called = 0;

  const outcome = await ensurePlatformSignIn({
    getCurrentUserId: async () => "pb_existing",
    signInWithCustomToken: async () => {
      throw new Error("호출되면 안 된다");
    },
    fetchImpl: (async () => {
      called += 1;
      throw new Error("호출되면 안 된다");
    }) as typeof fetch,
  });

  assert.deepEqual(outcome, { status: "skipped", reason: "already-signed-in" });
  assert.equal(called, 0);
});

// 인증은 부가 기능이다. 어떤 실패도 예외로 새어 나가 게임 흐름을 끊으면 안 된다.
test("네트워크 실패는 예외 대신 failed 결과가 된다", async () => {
  const outcome = await ensurePlatformSignIn({
    getCurrentUserId: async () => null,
    signInWithCustomToken: async () => {},
    fetchImpl: (async () => {
      throw new TypeError("network down");
    }) as typeof fetch,
  });

  assert.deepEqual(outcome, { status: "failed", code: "platform_unavailable" });
});

test("Firebase 로그인 실패도 failed 결과로 흡수한다", async () => {
  const outcome = await ensurePlatformSignIn({
    getCurrentUserId: async () => null,
    signInWithCustomToken: async () => {
      throw new Error("auth/invalid-custom-token");
    },
    fetchImpl: okBridge(),
  });

  assert.deepEqual(outcome, { status: "failed", code: "platform_unavailable" });
});

// 영속 복원 자체가 실패해도 예외가 새면 안 된다.
test("로그인 상태 조회 실패는 failed 결과가 된다", async () => {
  const outcome = await ensurePlatformSignIn({
    getCurrentUserId: async () => {
      throw new Error("persistence unavailable");
    },
    signInWithCustomToken: async () => {},
    fetchImpl: okBridge(),
  });

  assert.deepEqual(outcome, { status: "failed", code: "platform_unavailable" });
});

test("계측 파라미터는 결과 종류별로 필요한 값만 싣는다", () => {
  assert.deepEqual(
    buildPlatformAuthParams({ status: "signed-in", appUserId: "pb_abc" }, 812.4),
    { outcome: "signed-in", elapsed_ms: 812 },
  );
  assert.deepEqual(
    buildPlatformAuthParams({ status: "skipped", reason: "already-signed-in" }),
    { outcome: "skipped", reason: "already-signed-in" },
  );
  assert.deepEqual(
    buildPlatformAuthParams({ status: "failed", code: "platform_unavailable" }),
    { outcome: "failed", code: "platform_unavailable" },
  );
});

// appUserId는 platform이 만든 사용자 식별자다. GA4로 새어 나가면 안 된다.
test("계측 파라미터에 appUserId를 싣지 않는다", () => {
  const params = buildPlatformAuthParams({
    status: "signed-in",
    appUserId: "pb_abc",
  });

  assert.ok(!Object.values(params).includes("pb_abc"));
});

test("음수나 NaN 경과 시간은 싣지 않는다", () => {
  const outcome = { status: "signed-in", appUserId: "pb_abc" } as const;

  assert.deepEqual(buildPlatformAuthParams(outcome, -1), {
    outcome: "signed-in",
  });
  assert.deepEqual(buildPlatformAuthParams(outcome, Number.NaN), {
    outcome: "signed-in",
  });
});
