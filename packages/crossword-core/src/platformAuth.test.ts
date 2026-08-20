import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPlatformAuthParams,
  ensurePlatformSignIn,
  type FirebaseIdentity,
  type PlatformSignInDependencies,
} from "./platformAuth.ts";

const bridgeResult = {
  firebaseCustomToken: "custom-token",
  appUserId: "pb_abc",
};

function defaultDependencies(
  overrides: Partial<PlatformSignInDependencies> = {},
): PlatformSignInDependencies {
  return {
    getFirebaseIdentity: async () => null,
    requestFirebaseCustomToken: async () => bridgeResult,
    signInWithCustomToken: async () => ({
      uid: "pb_abc",
      idToken: "firebase-id-token",
    }),
    signInPlatform: async () => ({ appUserId: "pb_abc" }),
    ...overrides,
  };
}

test("신규 사용자는 SDK bridge, Firebase 로그인, firebase-id-token 세션 순서로 인증한다", async () => {
  const calls: string[] = [];
  let receivedCredential: unknown;

  const outcome = await ensurePlatformSignIn(
    defaultDependencies({
      getFirebaseIdentity: async () => {
        calls.push("restore");
        return null;
      },
      requestFirebaseCustomToken: async () => {
        calls.push("bridge");
        return bridgeResult;
      },
      signInWithCustomToken: async (customToken) => {
        calls.push("firebase");
        assert.equal(customToken, "custom-token");
        return { uid: "pb_abc", idToken: "firebase-id-token" };
      },
      signInPlatform: async (credential) => {
        calls.push("platform");
        receivedCredential = credential;
        return { appUserId: "pb_abc" };
      },
    }),
  );

  assert.deepEqual(calls, ["restore", "bridge", "firebase", "platform"]);
  assert.deepEqual(receivedCredential, {
    kind: "firebase-id-token",
    value: "firebase-id-token",
  });
  assert.deepEqual(outcome, { status: "signed-in", appUserId: "pb_abc" });
});

test("재실행 시 기존 Firebase 신원을 그대로 쓰고 bridge를 다시 호출하지 않는다", async () => {
  const existing: FirebaseIdentity = {
    uid: "pb_existing",
    idToken: "existing-id-token",
  };
  let bridgeCalls = 0;
  let firebaseSignInCalls = 0;

  const outcome = await ensurePlatformSignIn(
    defaultDependencies({
      getFirebaseIdentity: async () => existing,
      requestFirebaseCustomToken: async () => {
        bridgeCalls += 1;
        return bridgeResult;
      },
      signInWithCustomToken: async () => ({
        uid: String(++firebaseSignInCalls),
        idToken: "unexpected-id-token",
      }),
      signInPlatform: async (credential) => {
        assert.deepEqual(credential, {
          kind: "firebase-id-token",
          value: "existing-id-token",
        });
        return { appUserId: "pb_existing" };
      },
    }),
  );

  assert.equal(bridgeCalls, 0);
  assert.equal(firebaseSignInCalls, 0);
  assert.deepEqual(outcome, {
    status: "signed-in",
    appUserId: "pb_existing",
  });
});

test("세션 교환에서 만료를 감지하면 강제 갱신 ID token으로 한 번 재시도한다", async () => {
  const refreshFlags: boolean[] = [];
  const credentials: unknown[] = [];

  const outcome = await ensurePlatformSignIn(
    defaultDependencies({
      getFirebaseIdentity: async (forceRefresh = false) => {
        refreshFlags.push(forceRefresh);
        return {
          uid: "pb_abc",
          idToken: forceRefresh ? "fresh-id-token" : "existing-id-token",
        };
      },
      signInPlatform: async (credential) => {
        credentials.push(credential);
        if (credential.value === "existing-id-token") {
          throw { code: "auth_invalid" };
        }
        return { appUserId: "pb_abc" };
      },
    }),
  );

  assert.deepEqual(refreshFlags, [false, true]);
  assert.deepEqual(credentials, [
    { kind: "firebase-id-token", value: "existing-id-token" },
    { kind: "firebase-id-token", value: "fresh-id-token" },
  ]);
  assert.equal(outcome.status, "signed-in");
});

test("네트워크 실패는 예외 대신 failed 결과가 되어 게임 흐름을 막지 않는다", async () => {
  const outcome = await ensurePlatformSignIn(
    defaultDependencies({
      requestFirebaseCustomToken: async () => {
        throw { code: "network_error" };
      },
    }),
  );

  assert.deepEqual(outcome, { status: "failed", code: "network_error" });
});

test("Firebase 로그인 실패도 failed 결과로 흡수한다", async () => {
  const outcome = await ensurePlatformSignIn(
    defaultDependencies({
      signInWithCustomToken: async () => {
        throw { code: "auth/invalid-custom-token" };
      },
    }),
  );

  assert.deepEqual(outcome, {
    status: "failed",
    code: "auth/invalid-custom-token",
  });
});

test("bridge uid와 Firebase uid가 다르면 세션을 열지 않는다", async () => {
  let platformCalls = 0;
  const outcome = await ensurePlatformSignIn(
    defaultDependencies({
      signInWithCustomToken: async () => ({
        uid: "different-user",
        idToken: "firebase-id-token",
      }),
      signInPlatform: async () => {
        platformCalls += 1;
        return { appUserId: "different-user" };
      },
    }),
  );

  assert.deepEqual(outcome, {
    status: "failed",
    code: "firebase_uid_mismatch",
  });
  assert.equal(platformCalls, 0);
});

test("Platform session appUserId가 Firebase uid와 다르면 실패로 닫는다", async () => {
  const outcome = await ensurePlatformSignIn(
    defaultDependencies({
      signInPlatform: async () => ({ appUserId: "different-user" }),
    }),
  );

  assert.deepEqual(outcome, {
    status: "failed",
    code: "platform_uid_mismatch",
  });
});

test("계측 파라미터에는 uid와 token을 싣지 않는다", () => {
  const params = buildPlatformAuthParams(
    { status: "signed-in", appUserId: "pb_abc" },
    812.4,
  );

  assert.deepEqual(params, { outcome: "signed-in", elapsed_ms: 812 });
  assert.ok(!Object.values(params).includes("pb_abc"));
  assert.ok(!Object.values(params).includes("custom-token"));
});

test("실패·미지원 결과만 각 진단 값을 계측한다", () => {
  assert.deepEqual(
    buildPlatformAuthParams({ status: "failed", code: "network_error" }),
    { outcome: "failed", code: "network_error" },
  );
  assert.deepEqual(
    buildPlatformAuthParams({ status: "skipped", reason: "unsupported" }),
    { outcome: "skipped", reason: "unsupported" },
  );
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
