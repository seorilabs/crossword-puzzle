import { beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.fn();
const shouldPrompt = vi.fn();
const markPrompted = vi.fn();
const mountUpdateGate = vi.fn();
const firebaseCustomToken = vi.fn();
const platformSignIn = vi.fn();
const getFirebaseApp = vi.fn();

const createPlatform = vi.fn<(options: unknown) => unknown>(() => ({
  identity: { firebaseCustomToken },
  presence: { start: vi.fn(), stop: vi.fn(), resume: vi.fn() },
  signIn: platformSignIn,
  config: { gate, shouldPrompt, markPrompted },
}));

vi.mock("@seorilabs/platform-sdk", () => ({
  createPlatform: (options: unknown) => createPlatform(options),
}));

vi.mock("@seorilabs/platform-sdk/gate-dom", () => ({
  mountUpdateGate: (options: unknown) => mountUpdateGate(options),
}));

vi.mock("./firebaseClient", () => ({
  getFirebaseApp: () => getFirebaseApp(),
}));

vi.mock("./telemetry", () => ({
  telemetry: { screen: vi.fn(), impression: vi.fn(), click: vi.fn() },
}));

async function loadAdapter() {
  vi.resetModules();
  return await import("./platformAuth");
}

describe("#390 업데이트 게이트 (웹/AIT adapter)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 인증 자체는 이 테스트의 관심사가 아니다 — Firebase 미설정으로 skip 처리해 흡수한다.
    getFirebaseApp.mockResolvedValue(null);
    gate.mockReturnValue({ kind: "ok" });
    shouldPrompt.mockResolvedValue(true);
    markPrompted.mockResolvedValue(undefined);
    mountUpdateGate.mockReturnValue(vi.fn());
  });

  it("ok면 아무것도 띄우지 않는다", async () => {
    const { ensurePlatformAuth } = await loadAdapter();

    await ensurePlatformAuth();

    expect(shouldPrompt).not.toHaveBeenCalled();
    expect(mountUpdateGate).not.toHaveBeenCalled();
    expect(markPrompted).not.toHaveBeenCalled();
  });

  it("recommended면 게이트를 띄우고 노출 이력을 남긴다", async () => {
    const state = {
      kind: "recommended",
      message: "새 버전이 나왔어요",
      updateUrl: "https://play.google.com/store/apps/details?id=x",
    };
    gate.mockReturnValue(state);

    const { ensurePlatformAuth } = await loadAdapter();
    await ensurePlatformAuth();

    expect(shouldPrompt).toHaveBeenCalledWith(state);
    expect(mountUpdateGate).toHaveBeenCalledWith(
      expect.objectContaining({ state }),
    );
    expect(markPrompted).toHaveBeenCalledWith(state);
  });

  it("required면 하루 제한과 무관하게 띄운다", async () => {
    const state = { kind: "required", message: "업데이트가 필요해요" };
    gate.mockReturnValue(state);

    const { ensurePlatformAuth } = await loadAdapter();
    await ensurePlatformAuth();

    expect(mountUpdateGate).toHaveBeenCalledWith(
      expect.objectContaining({ state }),
    );
  });

  it("이미 하루 안에 띄웠으면(shouldPrompt=false) 다시 띄우지 않는다", async () => {
    gate.mockReturnValue({ kind: "recommended", message: "새 버전" });
    shouldPrompt.mockResolvedValue(false);

    const { ensurePlatformAuth } = await loadAdapter();
    await ensurePlatformAuth();

    expect(mountUpdateGate).not.toHaveBeenCalled();
    expect(markPrompted).not.toHaveBeenCalled();
  });

  it("설정 조회가 던져도 로그인 결과는 그대로 돌아온다", async () => {
    gate.mockImplementation(() => {
      throw new Error("config boom");
    });

    const { ensurePlatformAuth } = await loadAdapter();

    await expect(ensurePlatformAuth()).resolves.toEqual({
      status: "skipped",
      reason: "unsupported",
    });
  });
});
