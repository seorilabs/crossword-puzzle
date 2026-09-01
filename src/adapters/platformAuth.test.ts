import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PLATFORM_API_BASE_URL,
  PLATFORM_AUTH_APP_ID,
  PLATFORM_AUTH_EVENT,
  PLATFORM_PRESENCE_ENABLED,
} from "../../packages/crossword-core/src";

const getFirebaseApp = vi.fn();
const authStateReady = vi.fn(() => Promise.resolve());
const firebaseCustomToken = vi.fn();
const platformSignIn = vi.fn();
const signInWithCustomToken = vi.fn();
const impression = vi.fn();
const presenceStart = vi.fn();
const presenceStop = vi.fn();
const presenceResume = vi.fn();
const createPlatform = vi.fn<(options: unknown) => unknown>(() => ({
  identity: { firebaseCustomToken },
  presence: {
    start: presenceStart,
    stop: presenceStop,
    resume: presenceResume,
  },
  signIn: platformSignIn,
}));

type FirebaseUserStub = {
  uid: string;
  getIdToken: ReturnType<typeof vi.fn>;
};

let currentUser: FirebaseUserStub | null = null;

vi.mock("@seorilabs/platform-sdk", () => ({
  createPlatform: (options: unknown) => createPlatform(options),
}));

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

function user(uid: string, idToken: string): FirebaseUserStub {
  return {
    uid,
    getIdToken: vi.fn(() => Promise.resolve(idToken)),
  };
}

async function loadAdapter() {
  vi.resetModules();
  return await import("./platformAuth");
}

describe("ensurePlatformAuth (웹/AIT adapter)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = null;
    getFirebaseApp.mockResolvedValue({ name: "crossword-puzzle" });
    authStateReady.mockResolvedValue(undefined);
    firebaseCustomToken.mockResolvedValue({
      firebaseCustomToken: "custom-token",
      appUserId: "pb_abc",
    });
    signInWithCustomToken.mockResolvedValue({
      user: user("pb_abc", "firebase-id-token"),
    });
    platformSignIn.mockResolvedValue({ appUserId: "pb_abc" });
  });

  it("같은 appId로 SDK를 만들고 firebase-id-token 세션을 한 번 연다", async () => {
    const { ensurePlatformAuth } = await loadAdapter();

    await expect(ensurePlatformAuth()).resolves.toEqual({
      status: "signed-in",
      appUserId: "pb_abc",
    });

    expect(createPlatform).toHaveBeenCalledWith({
      appId: PLATFORM_AUTH_APP_ID,
      baseUrl: PLATFORM_API_BASE_URL,
      presenceEnabled: PLATFORM_PRESENCE_ENABLED,
      presenceContext: {
        appVersion: expect.any(String),
        platform: "ait",
      },
      fetchImpl: expect.any(Function),
    });
    expect(firebaseCustomToken).toHaveBeenCalledWith();
    expect(signInWithCustomToken).toHaveBeenCalledWith("custom-token");
    expect(platformSignIn).toHaveBeenCalledTimes(1);
    expect(platformSignIn).toHaveBeenCalledWith({
      kind: "firebase-id-token",
      value: "firebase-id-token",
    });

    const [name, params] = impression.mock.calls[0];
    expect(name).toBe(PLATFORM_AUTH_EVENT);
    expect(params.outcome).toBe("signed-in");
    expect(Object.values(params)).not.toContain("pb_abc");
    expect(Object.values(params)).not.toContain("custom-token");
  });

  it("영속 복원 후 bridge 없이 기존 uid로 Platform session을 연다", async () => {
    const existing = user("pb_existing", "existing-id-token");
    authStateReady.mockImplementation(() => {
      currentUser = existing;
      return Promise.resolve();
    });
    platformSignIn.mockResolvedValue({ appUserId: "pb_existing" });
    const { ensurePlatformAuth } = await loadAdapter();

    await expect(ensurePlatformAuth()).resolves.toEqual({
      status: "signed-in",
      appUserId: "pb_existing",
    });

    expect(authStateReady).toHaveBeenCalledTimes(1);
    expect(existing.getIdToken).toHaveBeenCalledWith(false);
    expect(firebaseCustomToken).not.toHaveBeenCalled();
    expect(signInWithCustomToken).not.toHaveBeenCalled();
    expect(platformSignIn).toHaveBeenCalledWith({
      kind: "firebase-id-token",
      value: "existing-id-token",
    });
  });

  it("Firebase 설정이 없으면 실패가 아니라 unsupported로 건너뛴다", async () => {
    getFirebaseApp.mockResolvedValue(null);
    const { ensurePlatformAuth } = await loadAdapter();

    await expect(ensurePlatformAuth()).resolves.toEqual({
      status: "skipped",
      reason: "unsupported",
    });
    expect(firebaseCustomToken).not.toHaveBeenCalled();
    expect(platformSignIn).not.toHaveBeenCalled();
    expect(impression.mock.calls[0][1].reason).toBe("unsupported");
  });

  it("네트워크 실패를 흡수하고 퍼즐 진입 Promise를 reject하지 않는다", async () => {
    firebaseCustomToken.mockRejectedValue({ code: "network_error" });
    const { ensurePlatformAuth } = await loadAdapter();

    await expect(ensurePlatformAuth()).resolves.toEqual({
      status: "failed",
      code: "network_error",
    });
    expect(platformSignIn).not.toHaveBeenCalled();
    expect(impression.mock.calls[0][1].code).toBe("network_error");
  });

  it("한 런타임에서 여러 번 불러도 bridge와 세션 발급은 각각 한 번이다", async () => {
    const { ensurePlatformAuth } = await loadAdapter();

    await Promise.all([ensurePlatformAuth(), ensurePlatformAuth()]);

    expect(firebaseCustomToken).toHaveBeenCalledTimes(1);
    expect(platformSignIn).toHaveBeenCalledTimes(1);
    expect(impression).toHaveBeenCalledTimes(1);
  });

  it("비활성 기본값을 유지하면서 lifecycle을 SDK Presence에 연결한다", async () => {
    const {
      resumePlatformPresence,
      startPlatformPresence,
      stopPlatformPresence,
    } = await loadAdapter();

    startPlatformPresence();
    stopPlatformPresence();
    resumePlatformPresence();

    expect(presenceStart).toHaveBeenCalledTimes(2);
    expect(presenceStop).toHaveBeenCalledTimes(1);
    expect(presenceResume).toHaveBeenCalledTimes(1);
    expect(createPlatform.mock.calls[0][0]).not.toHaveProperty("userId");
    expect(createPlatform.mock.calls[0][0]).not.toHaveProperty("sessionId");
  });

  it("SDK lifecycle 오류가 제품 호출자에게 전파되지 않는다", async () => {
    presenceStart.mockImplementation(() => {
      throw new Error("503");
    });
    presenceStop.mockImplementation(() => {
      throw new Error("TLS");
    });
    presenceResume.mockImplementation(() => {
      throw new Error("timeout");
    });
    const lifecycle = await loadAdapter();

    expect(() => lifecycle.startPlatformPresence()).not.toThrow();
    expect(() => lifecycle.stopPlatformPresence()).not.toThrow();
    expect(() => lifecycle.resumePlatformPresence()).not.toThrow();
  });

  // #374 회귀: 브라우저 fetch는 this가 전역 객체가 아니면 Illegal invocation을 던지고,
  // SDK Transport는 `this.fetchImpl(url)` 형태(인스턴스 메서드)로 호출한다. adapter가
  // 바인딩되지 않은 fetch를 넘기거나 아예 넘기지 않으면 웹에서 모든 요청이 즉시 실패한다.
  it("this 바인딩을 요구하는 전역 fetch에서도 인증 경로가 network_error 없이 성공한다", async () => {
    const fetchedUrls: string[] = [];
    // Window.fetch의 this 검사 재현. bind(globalThis)를 거치지 않은 호출은 던진다.
    function strictFetch(this: unknown, url: string): Promise<unknown> {
      if (this !== globalThis) {
        throw new TypeError(
          "Failed to execute 'fetch' on 'Window': Illegal invocation",
        );
      }
      fetchedUrls.push(url);
      return Promise.resolve({ ok: true });
    }
    vi.stubGlobal("fetch", strictFetch);

    try {
      // SDK Transport의 실제 호출 형태를 재현: 옵션의 fetchImpl(없으면 전역 fetch)을
      // 인스턴스에 저장해 두고 메서드로 호출한다.
      createPlatform.mockImplementationOnce((options: unknown) => {
        const transport = {
          fetchImpl:
            (options as { fetchImpl?: typeof fetch }).fetchImpl ??
            globalThis.fetch,
        };
        return {
          identity: {
            firebaseCustomToken: async () => {
              await transport.fetchImpl(
                "https://platform.test/v1/identity/firebase-custom-token",
              );
              return firebaseCustomToken();
            },
          },
          presence: {
            start: presenceStart,
            stop: presenceStop,
            resume: presenceResume,
          },
          signIn: platformSignIn,
        };
      });
      const { ensurePlatformAuth } = await loadAdapter();

      await expect(ensurePlatformAuth()).resolves.toEqual({
        status: "signed-in",
        appUserId: "pb_abc",
      });
      expect(fetchedUrls).toEqual([
        "https://platform.test/v1/identity/firebase-custom-token",
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
