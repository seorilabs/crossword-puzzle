import { Platform } from 'react-native';
import {
  createMobileAdsRequestConfiguration,
  getMobileAdErrorCode,
  requestMobileAdsConsent,
  resetMobileAdsStateForTests,
} from '../mobileAds';

beforeEach(() => {
  resetMobileAdsStateForTests();
  Platform.OS = 'android';
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

test('iOS는 이전 UMP 결정에 접근하지 않고 광고 동의 창을 생략한다', async () => {
  Platform.OS = 'ios';
  const gatherConsent = jest.fn();
  const getConsentInfo = jest.fn();
  await expect(
    requestMobileAdsConsent({
      AdsConsent: { gatherConsent, getConsentInfo },
    } as never),
  ).resolves.toBe(true);
  expect(gatherConsent).not.toHaveBeenCalled();
  expect(getConsentInfo).not.toHaveBeenCalled();
  const { showMobileAdsPrivacyOptions } = require('../mobileAds');
  await expect(showMobileAdsPrivacyOptions()).resolves.toEqual({
    status: 'not_required',
  });
});
