// platform 인증 브리지의 AIT WebView adapter 테스트(vitest/jsdom). 계약과 실패 흡수는
// core(platformAuth.test.ts)가 덮고, 여기서는 Firebase Web SDK 배선만 고정한다.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PLATFORM_AUTH_EVENT } from "../../packages/crossword-core/src";

const getFirebaseApp = vi.fn();
const authStateReady = vi.fn(() => Promise.resolve());
const signInWithCustomToken = vi.fn<(customToken: string) => Promise<void>>(
  () => Promise.resolve(),
);
const impression = vi.fn();

let currentUser: { uid: string } | null = null;

vi.mock("./firebaseClient", () => ({
  getFirebaseApp: () => getFirebaseApp(),
}));

vi.mock("./telemetry", () => ({
  telemetry: {
    screen: vi.fn(),
    impression: (name: string, params?: unknown) => impression(name, params),
    click: vi.fn(),
  },
}));

vi.mock("firebase/auth", () => ({
  getAuth: () => ({
    authStateReady,
    get currentUser() {
      return currentUser;
    },
  }),
  signInWithCustomToken: (_auth: unknown, token: string) =>
    signInWithCustomToken(token),
}));

function bridgeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const signedInBody = {
  ok: true,
  result: { firebaseCustomToken: "custom-token", appUserId: "pb_abc" },
};

// 어댑터는 모듈 수준에서 결과를 memoize하므로 테스트마다 새로 로드한다.
async function loadAdapter() {
  vi.resetModules();
  return (await import("./platformAuth")).ensurePlatformAuth;
}

describe("ensurePlatformAuth (웹 adapter)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks는 호출 기록만 지운다. 앞 테스트가 심은 구현이 남지 않게 되돌린다.
    authStateReady.mockImplementation(() => Promise.resolve());
    signInWithCustomToken.mockImplementation(() => Promise.resolve());
    currentUser = null;
    getFirebaseApp.mockResolvedValue({ name: "crossword-puzzle" });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(bridgeResponse(signedInBody))),
    );
  });

  it("미로그인 상태면 브리지 토큰으로 로그인하고 결과를 계측한다", async () => {
    const ensurePlatformAuth = await loadAdapter();

    await expect(ensurePlatformAuth()).resolves.toEqual({
      status: "signed-in",
      appUserId: "pb_abc",
    });
    expect(signInWithCustomToken).toHaveBeenCalledWith("custom-token");

    const [name, params] = impression.mock.calls[0];
    expect(name).toBe(PLATFORM_AUTH_EVENT);
    expect(params.outcome).toBe("signed-in");
    // appUserId는 platform 사용자 식별자다. 계측으로 새어 나가면 안 된다.
    expect(Object.values(params)).not.toContain("pb_abc");
  });

  // 복원 전 currentUser는 항상 null이다. 기다리지 않으면 재실행마다 새 계정이 생긴다.
  it("로그인 상태를 읽기 전에 authStateReady를 기다린다", async () => {
    // 복원은 authStateReady가 끝나는 시점에 일어난다. 어댑터가 먼저 읽으면 null을 보고
    // 브리지를 호출해 새 계정을 만들게 되므로, 결과가 already-signed-in이어야 한다.
    authStateReady.mockImplementation(() => {
      currentUser = { uid: "pb_existing" };
      return Promise.resolve();
    });
    const ensurePlatformAuth = await loadAdapter();

    await expect(ensurePlatformAuth()).resolves.toEqual({
      status: "skipped",
      reason: "already-signed-in",
    });
    expect(authStateReady).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  // 로컬 브라우저와 QR 샌드박스에는 Firebase 설정 env가 없다. 실패가 아니라 미시도다.
  it("Firebase 설정이 없으면 실패가 아니라 unsupported로 건너뛴다", async () => {
    getFirebaseApp.mockResolvedValue(null);
    const ensurePlatformAuth = await loadAdapter();

    await expect(ensurePlatformAuth()).resolves.toEqual({
      status: "skipped",
      reason: "unsupported",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(impression.mock.calls[0][1].reason).toBe("unsupported");
  });

  it("한 세션에서 여러 번 불러도 브리지 호출은 한 번이다", async () => {
    const ensurePlatformAuth = await loadAdapter();

    await Promise.all([ensurePlatformAuth(), ensurePlatformAuth()]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(impression).toHaveBeenCalledTimes(1);
  });
});
