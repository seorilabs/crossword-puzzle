import {
  createMobileAdsRequestConfiguration,
  getMobileAdErrorCode,
  getMobileRewardedAdRetryStatus,
} from '../mobileAds';

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
