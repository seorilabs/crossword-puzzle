import {
  createMobileAdsRequestConfiguration,
  getMobileAdErrorCode,
  getMobileRewardedAdRetryStatus,
  mapMobileAdTraceEvent,
  requestMobileAdsConsent,
  resetMobileAdsStateForTests,
  type MobileAdEvent,
} from '../mobileAds';

beforeEach(() => {
  resetMobileAdsStateForTests();
});

test('uses the UMP decision before allowing mobile ad requests', async () => {
  const gatherConsent = jest.fn().mockResolvedValue({ canRequestAds: true });
  const module = {
    AdsConsent: {
      gatherConsent,
      getConsentInfo: jest.fn(),
    },
  } as never;

  await expect(requestMobileAdsConsent(module)).resolves.toBe(true);
  expect(gatherConsent).toHaveBeenCalledTimes(1);
});

test('fails closed when UMP cannot refresh or read a previous decision', async () => {
  const module = {
    AdsConsent: {
      gatherConsent: jest.fn().mockRejectedValue(new Error('offline')),
      getConsentInfo: jest.fn().mockRejectedValue(new Error('unavailable')),
    },
  } as never;

  await expect(requestMobileAdsConsent(module)).resolves.toBe(false);
});

test('configures mobile ad requests for first-launch non-personalized ads', () => {
  const config = createMobileAdsRequestConfiguration({
    MaxAdContentRating: {
      G: 'G',
      PG: 'PG',
      T: 'T',
      MA: 'MA',
    },
  } as never);

  expect(config).toEqual({
    maxAdContentRating: 'PG',
    tagForChildDirectedTreatment: false,
    tagForUnderAgeOfConsent: false,
    testDeviceIdentifiers: ['EMULATOR'],
  });
});

test('prefers Google Mobile Ads error codes over generic Error names', () => {
  const error = Object.assign(new Error('No ad to show.'), {
    code: 'googleMobileAds/no-fill',
    name: 'Error',
  });

  expect(getMobileAdErrorCode(error)).toBe('googleMobileAds/no-fill');
});

test('falls back to Error names when Google Mobile Ads code is missing', () => {
  const error = new Error('Request timed out.');
  error.name = 'TimeoutError';

  expect(getMobileAdErrorCode(error)).toBe('TimeoutError');
});

// [#385] AdMob 원본 이벤트 → 통일 어휘(ad_stage/ad_result) 대응표를 고정한다.
function expectMappedTrace(
  event: MobileAdEvent,
  expected: ReturnType<typeof mapMobileAdTraceEvent>,
) {
  expect(mapMobileAdTraceEvent(event)).toEqual(expected);
}

test('request 이벤트는 request/requested로 대응한다', () => {
  expectMappedTrace(
    { type: 'request' },
    { ad_result: 'requested', ad_stage: 'request' },
  );
});

test('loaded 이벤트는 load/loaded로 대응한다', () => {
  expectMappedTrace({ type: 'loaded' }, { ad_result: 'loaded', ad_stage: 'load' });
});

test('opened 이벤트는 show/shown으로 대응한다', () => {
  expectMappedTrace({ type: 'opened' }, { ad_result: 'shown', ad_stage: 'show' });
});

test('earned_reward 이벤트는 show/rewarded로 대응한다', () => {
  expectMappedTrace(
    { type: 'earned_reward' },
    { ad_result: 'rewarded', ad_stage: 'show' },
  );
});

test('closed 이벤트는 show/dismissed로 대응한다', () => {
  expectMappedTrace({ type: 'closed' }, { ad_result: 'dismissed', ad_stage: 'show' });
});

test('show_failed 이벤트는 에러 코드와 함께 show/failed_to_show로 대응한다', () => {
  expectMappedTrace(
    { errorCode: 'googleMobileAds/no-fill', type: 'show_failed' },
    {
      ad_error_code: 'googleMobileAds/no-fill',
      ad_result: 'failed_to_show',
      ad_stage: 'show',
    },
  );
});

test('error 이벤트는 에러 코드와 함께 error/load_error로 대응한다', () => {
  expectMappedTrace(
    { errorCode: 'googleMobileAds/network-error', type: 'error' },
    {
      ad_error_code: 'googleMobileAds/network-error',
      ad_result: 'load_error',
      ad_stage: 'error',
    },
  );
});

test('timeout 이벤트는 error/load_timeout으로 대응한다', () => {
  expectMappedTrace({ type: 'timeout' }, { ad_result: 'load_timeout', ad_stage: 'error' });
});

test('module_unavailable/initialize_failed 이벤트는 error/unavailable로 대응한다', () => {
  expectMappedTrace(
    { type: 'module_unavailable' },
    { ad_error_code: undefined, ad_result: 'unavailable', ad_stage: 'error' },
  );
  expectMappedTrace(
    { errorCode: 'init-failed', type: 'initialize_failed' },
    { ad_error_code: 'init-failed', ad_result: 'unavailable', ad_stage: 'error' },
  );
});

test('normalizes rewarded mobile ad results for the shared retry policy', () => {
  expect(
    getMobileRewardedAdRetryStatus({
      events: [{ type: 'timeout' }],
      status: 'failed',
    }),
  ).toBe('failed');
  expect(
    getMobileRewardedAdRetryStatus({
      events: [{ type: 'closed' }],
      status: 'closed',
    }),
  ).toBe('dismissed');
  expect(
    getMobileRewardedAdRetryStatus({
      events: [{ type: 'module_unavailable' }],
      status: 'failed',
    }),
  ).toBe('unsupported');
});
