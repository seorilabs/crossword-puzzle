import {
  buildPlatformAuthParams,
  ensurePlatformSignIn,
  PLATFORM_AUTH_EVENT,
  type PlatformAuthOutcome,
} from "../../packages/crossword-core/src";
import { getFirebaseApp } from "./firebaseClient";
import { telemetry } from "./telemetry";

// platform 인증 브리지의 AIT WebView adapter.
//
// core(platformAuth.ts)가 "무엇을 주고받는지"를 갖고, 여기서는 Firebase Web SDK가
// 필요한 부분만 채운다. firebase/auth는 동적 import로 불러 첫 화면 번들에 넣지 않는다.
//
// 인증은 게임 진행을 막지 않는다. 실패해도 결과를 계측만 하고 그대로 진행한다.

type FirebaseAuthHandle = {
  currentUserId: () => Promise<string | null>;
  signIn: (customToken: string) => Promise<void>;
};

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
      // 재실행마다 새 계정을 만들게 된다.
      currentUserId: async () => {
        await auth.authStateReady();
        return auth.currentUser?.uid ?? null;
      },
      signIn: async (customToken) => {
        await signInWithCustomToken(auth, customToken);
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

async function runPlatformAuth(): Promise<PlatformAuthOutcome> {
  const startedAt = Date.now();
  const handle = await resolveFirebaseAuth();
  const outcome: PlatformAuthOutcome =
    handle == null
      ? { status: "skipped", reason: "unsupported" }
      : await ensurePlatformSignIn({
          getCurrentUserId: handle.currentUserId,
          signInWithCustomToken: handle.signIn,
          fetchImpl: (input, init) => fetch(input, init),
        });

  telemetry.impression(
    PLATFORM_AUTH_EVENT,
    buildPlatformAuthParams(outcome, Date.now() - startedAt),
  );

  return outcome;
}
