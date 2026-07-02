// 공유 전달 공통 로직(deliverShareText) 폴백 계약 테스트 (vitest + jsdom)
// navigator.share 우선 → 실패 시 클립보드 폴백 → 미지원/실패 시 failed.
import { afterEach, describe, expect, it, vi } from "vitest";

import { deliverShareText } from "./useShareResult";

type NavigatorPatch = {
  share?: (data: { text: string }) => Promise<void>;
  clipboard?: { writeText?: (text: string) => Promise<void> };
};

// jsdom navigator에 share/clipboard를 주입한다(테스트 후 원복).
function patchNavigator(patch: NavigatorPatch) {
  vi.stubGlobal("navigator", { ...patch });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deliverShareText", () => {
  it("navigator.share 성공 시 shared를 반환하고 클립보드를 쓰지 않는다", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    patchNavigator({
      share: vi.fn(() => Promise.resolve()),
      clipboard: { writeText },
    });

    await expect(deliverShareText("본문")).resolves.toBe("shared");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("사용자가 공유 시트를 닫으면(AbortError) aborted — 폴백 없음", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const abort = new Error("cancelled");
    abort.name = "AbortError";
    patchNavigator({
      share: vi.fn(() => Promise.reject(abort)),
      clipboard: { writeText },
    });

    await expect(deliverShareText("본문")).resolves.toBe("aborted");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("share가 다른 오류로 실패하면 클립보드로 폴백해 copied", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    patchNavigator({
      share: vi.fn(() => Promise.reject(new Error("boom"))),
      clipboard: { writeText },
    });

    await expect(deliverShareText("본문")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("본문");
  });

  it("share 미지원이면 클립보드 복사로 copied", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    patchNavigator({ clipboard: { writeText } });

    await expect(deliverShareText("본문")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("본문");
  });

  it("클립보드 미지원이면 failed", async () => {
    patchNavigator({});
    await expect(deliverShareText("본문")).resolves.toBe("failed");
  });

  it("클립보드 쓰기가 실패하면 failed", async () => {
    patchNavigator({
      clipboard: { writeText: vi.fn(() => Promise.reject(new Error("nope"))) },
    });
    await expect(deliverShareText("본문")).resolves.toBe("failed");
  });
});
