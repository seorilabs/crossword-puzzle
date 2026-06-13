import {
  createMobileAdsRequestConfiguration,
  getMobileAdErrorCode,
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
