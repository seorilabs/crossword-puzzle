import { createPlatform } from "@seorilabs/platform-sdk";
import {
  buildPlatformAuthParams,
  createFailOpenPlatformPresenceLifecycle,
  ensurePlatformSignIn,
  evaluateUpdateGate,
  PLATFORM_API_BASE_URL,
  PLATFORM_AUTH_APP_ID,
  PLATFORM_AUTH_EVENT,
  PLATFORM_PRESENCE_ENABLED,
  type FirebaseIdentity,
  type PlatformAuthOutcome,
} from "../../packages/crossword-core/src";
import { RELEASE_VERSION } from "./analyticsSinks";
import { getFirebaseApp } from "./firebaseClient";
import { telemetry } from "./telemetry";

// platform 인증 브리지의 AIT WebView adapter.
//
// core(platformAuth.ts)가 "무엇을 주고받는지"를 갖고, 여기서는 Firebase Web SDK가
// 필요한 부분만 채운다. firebase/auth는 동적 import로 불러 첫 화면 번들에 넣지 않는다.
//
// 인증은 게임 진행을 막지 않는다. 실패해도 결과를 계측만 하고 그대로 진행한다.

type FirebaseAuthHandle = {
  currentIdentity: (forceRefresh?: boolean) => Promise<FirebaseIdentity | null>;
  signIn: (customToken: string) => Promise<FirebaseIdentity>;
};

const webPlatform = createPlatform({
  appId: PLATFORM_AUTH_APP_ID,
  baseUrl: PLATFORM_API_BASE_URL,
  presenceEnabled: PLATFORM_PRESENCE_ENABLED,
  presenceContext: {
    appVersion: RELEASE_VERSION,
    platform: "ait",
  },
  // SDK Transport/Presence는 fetchImpl을 인스턴스 메서드로 호출한다. 브라우저 fetch는
  // this가 Window가 아니면 Illegal invocation을 던지므로 전역 객체에 바인딩해 넘긴다.
  // 주입하지 않으면 웹(AIT)에서 인증·presence 요청이 네트워크 계층에서 전부 실패한다.
  fetchImpl: globalThis.fetch.bind(globalThis),
});
const platformPresence =
  createFailOpenPlatformPresenceLifecycle(webPlatform.presence);

let signInPromise: Promise<PlatformAuthOutcome> | null = null;

async function resolveFirebaseAuth(): Promise<FirebaseAuthHandle | null> {
  const app = await getFirebaseApp();
  if (app == null) {
    return null;
  }

  try {
    const { getAuth, signInWithCustomToken } = await import("firebase/auth");
    const auth = getAuth(app);

    return {
      // 영속된 로그인 복원이 끝나기 전의 currentUser는 항상 null이다. 기다리지 않으면
      // 기존 uid를 그대로 Platform session에 연결할 수 없다.
      currentIdentity: async (forceRefresh = false) => {
        await auth.authStateReady();
        const user = auth.currentUser;
        if (user == null) {
          return null;
        }
        return {
          uid: user.uid,
          idToken: await user.getIdToken(forceRefresh),
        };
      },
      signIn: async (customToken) => {
        const credential = await signInWithCustomToken(auth, customToken);
        return {
          uid: credential.user.uid,
          idToken: await credential.user.getIdToken(),
        };
      },
    };
  } catch {
    return null;
  }
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
  const handle = await resolveFirebaseAuth();
  const outcome: PlatformAuthOutcome =
    handle == null
      ? { status: "skipped", reason: "unsupported" }
      : await ensurePlatformSignIn({
          getFirebaseIdentity: handle.currentIdentity,
          requestFirebaseCustomToken: () =>
            webPlatform.identity.firebaseCustomToken(),
          signInWithCustomToken: handle.signIn,
          signInPlatform: (credential) => webPlatform.signIn(credential),
        });

  telemetry.impression(
    PLATFORM_AUTH_EVENT,
    buildPlatformAuthParams(outcome, Date.now() - startedAt),
  );

  await checkPlatformUpdateGate();

  return outcome;
}

let dismissUpdateGate: (() => void) | null = null;

/**
 * 로그인 뒤(성공 여부와 무관하게) 서버 판정을 화면에 반영한다.
 *
 * 설정 조회·DOM 마운트가 던져도 흡수한다 — 업데이트 안내는 부가 기능이고, 이
 * 실패가 로그인 결과나 퍼즐 진입을 막아서는 안 된다(#390).
 */
export async function checkPlatformUpdateGate(): Promise<void> {
  try {
    const state = await evaluateUpdateGate(webPlatform.config);

    dismissUpdateGate?.();
    dismissUpdateGate = null;
    if (state == null) {
      return;
    }

    const { mountUpdateGate } = await import(
      "@seorilabs/platform-sdk/gate-dom"
    );
    dismissUpdateGate = mountUpdateGate({
      state,
      onLater: () => {
        dismissUpdateGate = null;
      },
    });
    await webPlatform.config.markPrompted(state);
  } catch {
    // 위 주석 참고.
  }
}
