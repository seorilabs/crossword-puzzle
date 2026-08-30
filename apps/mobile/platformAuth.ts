import auth from '@react-native-firebase/auth';
import { createPlatform } from '@seorilabs/platform-sdk';
import { Platform } from 'react-native';

import {
  buildPlatformAuthParams,
  createFailOpenPlatformPresenceLifecycle,
  ensurePlatformSignIn,
  PLATFORM_API_BASE_URL,
  PLATFORM_AUTH_APP_ID,
  PLATFORM_AUTH_EVENT,
  PLATFORM_PRESENCE_ENABLED,
  type FirebaseIdentity,
  type PlatformAuthOutcome,
} from '../../packages/crossword-core/src';
import { RELEASE_VERSION } from './analyticsSinks';
import { telemetry } from './telemetry';

// platform 인증 브리지의 Android/iOS RN adapter.
//
// core(platformAuth.ts)가 "무엇을 주고받는지"를 갖고, 여기서는 React Native Firebase가
// 필요한 부분만 채운다. 인증은 게임 진행을 막지 않으므로 실패해도 계측만 하고 흡수한다.

const mobilePlatform = createPlatform({
  appId: PLATFORM_AUTH_APP_ID,
  baseUrl: PLATFORM_API_BASE_URL,
  presenceEnabled: PLATFORM_PRESENCE_ENABLED,
  presenceContext: {
    appVersion: RELEASE_VERSION,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  },
});
const platformPresence = createFailOpenPlatformPresenceLifecycle(
  mobilePlatform.presence,
);

let signInPromise: Promise<PlatformAuthOutcome> | null = null;

/**
 * 영속된 로그인이 복원될 때까지 기다린 uid. 복원 전 currentUser는 항상 null이라 그대로
 * 읽으면 재실행마다 새 계정을 만든다. RN Firebase는 웹의 authStateReady가 없어 첫
 * onAuthStateChanged를 복원 완료 시점으로 쓴다.
 */
function restoredFirebaseIdentity(
  forceRefresh = false,
): Promise<FirebaseIdentity | null> {
  return new Promise((resolve, reject) => {
    let unsubscribe: (() => void) | undefined;
    let restored = false;

    unsubscribe = auth().onAuthStateChanged(user => {
      if (restored) {
        return;
      }
      restored = true;
      unsubscribe?.();
      if (user == null) {
        resolve(null);
        return;
      }
      void user
        .getIdToken(forceRefresh)
        .then(idToken => resolve({ uid: user.uid, idToken }), reject);
    });

    if (restored) {
      // 구독 즉시 동기로 끝난 경우다. callback 시점엔 unsubscribe가 아직 없었다.
      unsubscribe?.();
    }
  });
}

/**
 * platform 인증을 보장하고 결과를 계측한다. 예외를 던지지 않으며, 한 세션에서 여러 번
 * 불러도 실제 시도는 한 번만 한다.
 */
export function ensurePlatformAuth(): Promise<PlatformAuthOutcome> {
  signInPromise ??= runPlatformAuth();
  return signInPromise;
}

export const startPlatformPresence = platformPresence.start;
export const stopPlatformPresence = platformPresence.stop;
export const resumePlatformPresence = platformPresence.resume;

async function runPlatformAuth(): Promise<PlatformAuthOutcome> {
  const startedAt = Date.now();
  const outcome = await ensurePlatformSignIn({
    getFirebaseIdentity: restoredFirebaseIdentity,
    requestFirebaseCustomToken: () =>
      mobilePlatform.identity.firebaseCustomToken(),
    signInWithCustomToken: async customToken => {
      const credential = await auth().signInWithCustomToken(customToken);
      return {
        uid: credential.user.uid,
        idToken: await credential.user.getIdToken(),
      };
    },
    signInPlatform: credential => mobilePlatform.signIn(credential),
  });

  telemetry.impression(
    PLATFORM_AUTH_EVENT,
    buildPlatformAuthParams(outcome, Date.now() - startedAt),
  );

  return outcome;
}
