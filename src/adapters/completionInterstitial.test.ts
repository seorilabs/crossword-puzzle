import { afterEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ load: vi.fn(), show: vi.fn() }));
vi.mock("@apps-in-toss/web-framework", () => ({
  loadFullScreenAd: Object.assign(sdk.load, { isSupported: () => true }),
  showFullScreenAd: Object.assign(sdk.show, { isSupported: () => true }),
}));
import { createAitCompletionInterstitial } from "./completionInterstitial";
import { createCompletionTransition } from "../../packages/crossword-core/src/completionInterstitial";
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
describe("AC-5 AIT preloaded completion ads", () => {
  it("an unready opportunity advances, a late load cannot trigger a show", async () => {
    let load: { onEvent: (e: { type: string }) => void } | undefined;
    sdk.load.mockImplementation((options) => {
      load = options;
      return () => {};
    });
    const ad = createAitCompletionInterstitial("separate-interstitial");
    ad.preload();
    const move = vi.fn();
    const flow = createCompletionTransition(
      ad,
      { consumed: async () => false, consume: async () => {} },
      () => {},
    );
    await flow.leave("en-1", true, move);
    load!.onEvent({ type: "loaded" });
    expect(move).toHaveBeenCalledOnce();
    expect(sdk.show).not.toHaveBeenCalled();
    ad.dispose();
  });
  it("only close settles a shown ad and synchronous close unregisters its callback", async () => {
    sdk.load.mockImplementation((options) => {
      options.onEvent({ type: "loaded" });
      return () => {};
    });
    const unregister = vi.fn();
    sdk.show.mockImplementation((options) => {
      options.onEvent({ type: "show" });
      options.onEvent({ type: "dismissed" });
      return unregister;
    });
    const ad = createAitCompletionInterstitial("separate-interstitial");
    ad.preload();
    const track = vi.fn();
    await ad.show(track);
    expect(track.mock.calls.map((x) => x[0])).toEqual([
      "ad_impression",
      "ad_closed",
    ]);
    expect(unregister).toHaveBeenCalledOnce();
    ad.dispose();
  });
  it("timeouts ignore late callbacks and allow the next opportunity to preload again", () => {
    vi.useFakeTimers();
    const loads: Array<{ onEvent: (e: { type: string }) => void }> = [];
    sdk.load.mockImplementation((options) => {
      loads.push(options);
      return () => {};
    });
    const ad = createAitCompletionInterstitial("separate-interstitial", 50);
    ad.preload();
    vi.advanceTimersByTime(51);
    loads[0].onEvent({ type: "loaded" });
    expect(ad.ready()).toBe(false);
    ad.preload();
    loads[1].onEvent({ type: "loaded" });
    expect(ad.ready()).toBe(true);
    ad.dispose();
  });
});
