import auth from '@react-native-firebase/auth';

import {
  buildPlatformAuthParams,
  ensurePlatformSignIn,
  PLATFORM_AUTH_EVENT,
  type PlatformAuthOutcome,
} from '../../packages/crossword-core/src';
import {telemetry} from './telemetry';

// platform 인증 브리지의 Android/iOS RN adapter.
//
// core(platformAuth.ts)가 "무엇을 주고받는지"를 갖고, 여기서는 React Native Firebase가
// 필요한 부분만 채운다. 인증은 게임 진행을 막지 않으므로 실패해도 계측만 하고 흡수한다.

let signInPromise: Promise<PlatformAuthOutcome> | null = null;

/**
 * 영속된 로그인이 복원될 때까지 기다린 uid. 복원 전 currentUser는 항상 null이라 그대로
 * 읽으면 재실행마다 새 계정을 만든다. RN Firebase는 웹의 authStateReady가 없어 첫
 * onAuthStateChanged를 복원 완료 시점으로 쓴다.
 */
function restoredUserId(): Promise<string | null> {
  return new Promise(resolve => {
    let unsubscribe: (() => void) | undefined;
    let restored = false;

    const settle = (uid: string | null) => {
      if (restored) {
        return;
      }
      restored = true;
      unsubscribe?.();
      resolve(uid);
    };

    unsubscribe = auth().onAuthStateChanged(user => settle(user?.uid ?? null));

    if (restored) {
      // 구독 즉시 동기로 끝난 경우다. settle 시점엔 unsubscribe가 아직 없었다.
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

async function runPlatformAuth(): Promise<PlatformAuthOutcome> {
  const startedAt = Date.now();
  const outcome = await ensurePlatformSignIn({
    getCurrentUserId: restoredUserId,
    signInWithCustomToken: async customToken => {
      await auth().signInWithCustomToken(customToken);
    },
    fetchImpl: (input, init) => fetch(input, init),
  });

  telemetry.impression(
    PLATFORM_AUTH_EVENT,
    buildPlatformAuthParams(outcome, Date.now() - startedAt),
  );

  return outcome;
}
