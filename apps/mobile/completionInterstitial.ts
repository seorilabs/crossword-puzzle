import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  InterstitialPort,
  InterstitialEvent,
} from '../../packages/crossword-core/src/completionInterstitial';
import { initializeMobileAds } from './mobileAds';
export function createMobileCompletionInterstitial(
  adUnitId: string,
  loadTimeoutMs=15000,
  loadSdk:()=>Promise<typeof import("react-native-google-mobile-ads")> = ()=>import("react-native-google-mobile-ads"),
): InterstitialPort {
  let loaded = false,
    loading = false,
    disposed = false,
    version = 0;
  let loadTimer:ReturnType<typeof setTimeout>|undefined;
  let ad: import('react-native-google-mobile-ads').InterstitialAd | undefined;
  let unsubscribers: Array<() => void> = [];
  let callback: ((event: InterstitialEvent) => void) | undefined;
  let close: (() => void) | undefined,
    fail: ((error: Error) => void) | undefined;
  const cleanup = () => {
    unsubscribers.forEach(unsubscribe => unsubscribe());
    unsubscribers = [];
  };
  return {
    preload() {
      if (!adUnitId || loaded || loading || disposed) return;
      loading = true;
      const own = ++version;
      loadTimer=setTimeout(()=>{if(own!==version)return;version++;loaded=false;loading=false;cleanup();},loadTimeoutMs);
      void (async () => {
        if (!(await initializeMobileAds())) throw Error('unavailable');
        const module = await loadSdk();
        if (disposed || own !== version) return;
        cleanup();
        ad = module.InterstitialAd.createForAdRequest(adUnitId, {
          requestNonPersonalizedAdsOnly: true,
        });
        unsubscribers.push(
          ad.addAdEventListener(module.AdEventType.LOADED, () => {
            if (disposed || own !== version || callback) return;
            clearTimeout(loadTimer);
            loaded = true;
            loading = false;
          }),
          ad.addAdEventListener(module.AdEventType.OPENED, () => {if(disposed||own!==version)return;callback?.('ad_impression');}),
          ad.addAdEventListener(module.AdEventType.CLOSED, () => {
            if(disposed||own!==version)return;
            callback?.('ad_closed');
            close?.();
            close = undefined;
            fail = undefined;
            callback = undefined;
            cleanup();
          }),
          ad.addAdEventListener(module.AdEventType.ERROR, () => {
            if(disposed||own!==version)return;
            clearTimeout(loadTimer);
            loaded = false;
            loading = false;
            fail?.(Error('ad error'));
            close = undefined;
            fail = undefined;
            callback = undefined;
            cleanup();
          }),
        );
        ad.load();
      })().catch(() => {
        if (own === version) {
          clearTimeout(loadTimer);
          loaded = false;
          loading = false;
        }
      });
    },
    ready: () => loaded && !disposed,
    async show(track) {
      if (!loaded || !ad || disposed) throw Error('unready');
      loaded = false;
      callback = track;
      return new Promise<void>((resolve, reject) => {
        close = resolve;
        fail = reject;
        try {
          void ad!.show().catch(error => {
            cleanup();
            callback = undefined;
            close = undefined;
            fail = undefined;
            reject(error);
          });
        } catch (error) {
          cleanup();
          callback = undefined;
          reject(error);
        }
      });
    },
    dispose() {
      clearTimeout(loadTimer);
      disposed = true;
      version++;
      loaded = false;
      loading = false;
      cleanup();
      fail?.(Error('disposed'));
      close = undefined;
      fail = undefined;
      callback = undefined;
    },
  };
}
export function completionTransitionStore() {
  return {
    async consumed(id: string) {
      return (
        (await AsyncStorage.getItem('crossword-completion-ad:' + id)) === '1'
      );
    },
    async consume(id: string) {
      await AsyncStorage.setItem('crossword-completion-ad:' + id, '1');
    },
  };
}
