// Seorilabs Platform 인증 순서의 3마켓 공통 정책.
//
// SDK와 Firebase 구현은 Web/AIT와 RN adapter가 각각 주입한다. core에는 어느 SDK도
// import하지 않고 다음 불변식만 둔다.
// - 영속 복원된 Firebase 신원이 있으면 그대로 쓰고, 없을 때만 bridge로 만든다.
// - bridge uid, Firebase uid, Platform session appUserId는 항상 같아야 한다.
// - custom token은 즉시 Firebase 로그인에만 쓰고 저장하거나 계측하지 않는다.
// - 인증 실패는 결과 상태로 흡수해 퍼즐 플레이를 막지 않는다.

export const PLATFORM_AUTH_APP_ID = "crossword-puzzle";

export const PLATFORM_API_BASE_URL =
  "https://platform-api-306278488979.asia-northeast3.run.app";

export type PlatformCustomTokenResult = {
  firebaseCustomToken: string;
  appUserId: string;
};

export type FirebaseIdentity = {
  uid: string;
  idToken: string;
};

export type FirebaseIdTokenCredential = {
  kind: "firebase-id-token";
  value: string;
};

export type PlatformSessionIdentity = {
  appUserId: string;
};

export type PlatformAuthOutcome =
  | { status: "signed-in"; appUserId: string }
  | { status: "skipped"; reason: "unsupported" }
  | { status: "failed"; code: string };

export const PLATFORM_AUTH_EVENT = "platform_auth_result";

export type PlatformAuthParams = {
  outcome: PlatformAuthOutcome["status"];
  reason?: string;
  code?: string;
  elapsed_ms?: number;
};

export function buildPlatformAuthParams(
  outcome: PlatformAuthOutcome,
  elapsedMs?: number,
): PlatformAuthParams {
  const params: PlatformAuthParams = { outcome: outcome.status };

  if (outcome.status === "skipped") {
    params.reason = outcome.reason;
  }
  if (outcome.status === "failed") {
    params.code = outcome.code;
  }
  if (elapsedMs != null && Number.isFinite(elapsedMs) && elapsedMs >= 0) {
    params.elapsed_ms = Math.round(elapsedMs);
  }

  return params;
}

export type PlatformSignInDependencies = {
  // Firebase SDK의 영속 복원이 끝난 뒤 현재 uid와 ID token을 함께 돌려준다.
  // forceRefresh=true면 만료된 ID token을 서버에 다시 보내지 않도록 강제 갱신한다.
  getFirebaseIdentity: (
    forceRefresh?: boolean,
  ) => Promise<FirebaseIdentity | null>;
  requestFirebaseCustomToken: () => Promise<PlatformCustomTokenResult>;
  // custom token은 이 함수 호출 외에는 어디에도 전달하거나 저장하지 않는다.
  signInWithCustomToken: (customToken: string) => Promise<FirebaseIdentity>;
  signInPlatform: (
    credential: FirebaseIdTokenCredential,
  ) => Promise<PlatformSessionIdentity>;
};

class PlatformAuthFlowError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PlatformAuthFlowError";
    this.code = code;
  }
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function errorCode(error: unknown): string {
  if (error instanceof PlatformAuthFlowError) {
    return error.code;
  }
  if (error != null && typeof error === "object" && "code" in error) {
    return (
      nonEmptyString((error as { code?: unknown }).code) ??
      "platform_unavailable"
    );
  }
  return "platform_unavailable";
}

function assertSameUid(actual: string, expected: string, code: string): void {
  if (nonEmptyString(actual) == null || actual !== expected) {
    throw new PlatformAuthFlowError(code);
  }
}

async function openPlatformSession(
  deps: PlatformSignInDependencies,
  identity: FirebaseIdentity,
): Promise<PlatformSessionIdentity> {
  const credential: FirebaseIdTokenCredential = {
    kind: "firebase-id-token",
    value: identity.idToken,
  };

  try {
    return await deps.signInPlatform(credential);
  } catch (error) {
    if (errorCode(error) !== "auth_invalid") {
      throw error;
    }

    // Firebase ID token이 서버 도착 전에 만료된 경계도 같은 uid의 강제 갱신 token으로
    // 한 번만 복구한다. 첫 요청은 거절됐으므로 Platform session은 성공 시 한 번만 발급된다.
    const refreshed = await deps.getFirebaseIdentity(true);
    if (refreshed == null) {
      throw new PlatformAuthFlowError("firebase_identity_missing");
    }
    assertSameUid(refreshed.uid, identity.uid, "firebase_uid_changed");
    return deps.signInPlatform({
      kind: "firebase-id-token",
      value: refreshed.idToken,
    });
  }
}

/**
 * Firebase custom-token bridge와 Platform session을 순서대로 연다.
 * 어떤 경로로도 예외를 내보내지 않으므로 호출부는 렌더/게임 진행과 병렬 실행할 수 있다.
 */
export async function ensurePlatformSignIn(
  deps: PlatformSignInDependencies,
): Promise<PlatformAuthOutcome> {
  try {
    let firebaseIdentity = await deps.getFirebaseIdentity(false);
    if (firebaseIdentity == null) {
      const bridge = await deps.requestFirebaseCustomToken();
      firebaseIdentity = await deps.signInWithCustomToken(
        bridge.firebaseCustomToken,
      );
      assertSameUid(
        firebaseIdentity.uid,
        bridge.appUserId,
        "firebase_uid_mismatch",
      );
    }

    const platformSession = await openPlatformSession(deps, firebaseIdentity);
    assertSameUid(
      platformSession.appUserId,
      firebaseIdentity.uid,
      "platform_uid_mismatch",
    );

    return { status: "signed-in", appUserId: platformSession.appUserId };
  } catch (error) {
    return { status: "failed", code: errorCode(error) };
  }
}
