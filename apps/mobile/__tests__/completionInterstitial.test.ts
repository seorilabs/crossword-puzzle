import { createMobileCompletionInterstitial } from '../completionInterstitial';
jest.mock('../mobileAds', () => ({
  initializeMobileAds: jest.fn(async () => true),
}));
const mockAds: Array<{
  handlers: Record<string, () => void>;
  load: jest.Mock;
  show: jest.Mock;
}> = [];
jest.mock('react-native-google-mobile-ads', () => ({
  AdEventType: {
    LOADED: 'loaded',
    OPENED: 'opened',
    CLOSED: 'closed',
    ERROR: 'error',
  },
  InterstitialAd: {
    createForAdRequest: () => {
      const value = {
        handlers: {} as Record<string, () => void>,
        load: jest.fn(),
        show: jest.fn(async () => {}),
      };
      mockAds.push(value);
      return {
        ...value,
        addAdEventListener: (type: string, fn: () => void) => {
          value.handlers[type] = fn;
          return jest.fn();
        },
      };
    },
  },
}));
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
afterEach(() => {
  mockAds.length = 0;
  jest.useRealTimers();
});
test('AC-5 mobile preloading never shows late and close settles the active transition', async () => {
  const ad = createMobileCompletionInterstitial(
    'separate-interstitial',
    15000,
    async () => require('react-native-google-mobile-ads'),
  );
  ad.preload();
  await flush();
  expect(ad.ready()).toBe(false);
  mockAds[0].handlers.loaded();
  expect(mockAds[0].show).not.toHaveBeenCalled();
  const events: string[] = [];
  const shown = ad.show(e => events.push(e));
  mockAds[0].handlers.opened();
  expect(events).toEqual(['ad_shown']);
  mockAds[0].handlers.closed();
  await shown;
  expect(events).toEqual(['ad_shown', 'ad_closed']);
  ad.dispose();
});
test('AC-5 stale mobile load errors cannot clear a newer loaded ad', async () => {
  jest.useFakeTimers();
  const ad = createMobileCompletionInterstitial(
    'separate-interstitial',
    50,
    async () => require('react-native-google-mobile-ads'),
  );
  ad.preload();
  await flush();
  const old = mockAds[0];
  jest.advanceTimersByTime(51);
  ad.preload();
  await flush();
  mockAds[1].handlers.loaded();
  old.handlers.error();
  old.handlers.loaded();
  expect(ad.ready()).toBe(true);
  ad.dispose();
});
test('AC-5 missing placement skips SDK access', async () => {
  const ad = createMobileCompletionInterstitial('');
  ad.preload();
  await flush();
  expect(mockAds).toHaveLength(0);
  expect(ad.ready()).toBe(false);
  ad.dispose();
});
