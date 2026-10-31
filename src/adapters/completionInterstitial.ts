import {
  AD_HISTORY_KEY,
  type AdHistory,
} from "../../packages/crossword-core/src/completionInterstitial.ts";
import {
  loadFullScreenAd,
  showFullScreenAd,
} from "@apps-in-toss/web-framework";
import type { InterstitialPort } from "../../packages/crossword-core/src/completionInterstitial.ts";
export function createAitCompletionInterstitial(
  adGroupId: string,
  loadTimeoutMs = 15000,
): InterstitialPort {
  let loaded = false,
    loading = false,
    disposed = false,
    generation = 0;
  let unload: (() => void) | undefined, unshow: (() => void) | undefined;
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelShow: (() => void) | undefined;
  return {
    preload() {
      if (!adGroupId || loaded || loading || disposed) return;
      try {
        if (!loadFullScreenAd.isSupported() || !showFullScreenAd.isSupported())
          return;
        unload?.();
        unload = undefined;
        loading = true;
        const own = ++generation;
        loadTimer = setTimeout(() => {
          if (own !== generation) return;
          generation++;
          loaded = false;
          loading = false;
          unload?.();
          unload = undefined;
        }, loadTimeoutMs);
        unload = loadFullScreenAd({
          options: { adGroupId },
          onEvent: (e) => {
            if (disposed || own !== generation) return;
            if (e.type === "loaded") {
              clearTimeout(loadTimer);
              loaded = true;
              loading = false;
            }
          },
          onError: () => {
            if (own === generation) {
              clearTimeout(loadTimer);
              loaded = false;
              loading = false;
            }
          },
        });
      } catch {
        clearTimeout(loadTimer);
        loaded = false;
        loading = false;
      }
    },
    ready: () => loaded && !disposed,
    show(track) {
      if (!loaded || disposed) return Promise.reject(Error("unready"));
      loaded = false;
      generation++;
      unload?.();
      unload = undefined;
      return new Promise<void>((resolve, reject) => {
        let done = false;
        const finish = (error = false) => {
          if (done) return;
          done = true;
          cancelShow = undefined;
          unshow?.();
          unshow = undefined;
          if (!error) track("ad_closed");
          if (error) reject(Error("show failed"));
          else resolve();
        };
        cancelShow = () => finish(true);
        try {
          unshow = showFullScreenAd({
            options: { adGroupId },
            onEvent: (event) => {
              if (done || disposed) return;
              if (event.type === "show") track("ad_shown");
              if (event.type === "impression") track("ad_impression");
              if (event.type === "dismissed") finish();
              if (event.type === "failedToShow") finish(true);
            },
            onError: () => finish(true),
          });
          if (done) {
            unshow?.();
            unshow = undefined;
          }
        } catch {
          finish(true);
        }
      });
    },
    dispose() {
      cancelShow?.();
      clearTimeout(loadTimer);
      disposed = true;
      generation++;
      loaded = false;
      loading = false;
      unload?.();
      unshow?.();
    },
  };
}
export function completionTransitionStore() {
  return {
    async loadHistory(): Promise<AdHistory | null> {
      const raw = localStorage.getItem(AD_HISTORY_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    async saveHistory(history: AdHistory) {
      localStorage.setItem(AD_HISTORY_KEY, JSON.stringify(history));
    },
    async consumed(id: string) {
      return localStorage.getItem("crossword-completion-ad:" + id) === "1";
    },
    async consume(id: string) {
      localStorage.setItem("crossword-completion-ad:" + id, "1");
    },
  };
}
