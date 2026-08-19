// Seorilabs platform 인증 브리지(ADR 0013).
//
// 왜 platform을 거치는가: 이 앱은 인증이 없어 기기별 익명 상태로만 동작했다. platform
// identity가 없으니 신규 사용자 운영 알림(identity.created)도 발생하지 않았다. platform이
// 앱 Firebase 프로젝트의 service account로 custom token을 원격 서명(IAM signJwt)해 주면,
// private key를 어디에도 두지 않고 인증 진입점만 통일할 수 있다.
//
// 왜 core에 두는가: HTTP 호출 자체는 마켓 무관이다(fetch는 WebView와 RN 양쪽의 표준
// 전역). 이걸 adapter에 두면 src/adapters와 apps/mobile에 같은 코드가 두 벌 생긴다.
// core는 SDK import 금지 규칙만 지키면 되므로(AGENTS.md) 브리지 호출과 결과 해석은
// 여기 두고, Firebase SDK가 필요한 signInWithCustomToken만 각 adapter가 주입한다.
//
// 중요: 이 앱에서 인증은 **게임 진행을 막지 않는 부가 기능**이다. 네트워크 실패나 platform
// 장애가 퍼즐 풀이를 멈춰서는 안 된다. 그래서 실패를 예외로 던지지 않고 결과 상태로
// 표현한다. 진행 상태·힌트·스트릭은 계속 기기 로컬 저장소가 소유한다.

export const PLATFORM_AUTH_APP_ID = "crossword-puzzle";

export const PLATFORM_API_BASE_URL =
  "https://platform-api-306278488979.asia-northeast3.run.app";

export const PLATFORM_CUSTOM_TOKEN_PATH = "/v1/auth/firebase-custom-token";

// 어느 앱의 요청인지 고르는 힌트 헤더. 권한이 아니다. 실제 검증은 서버가 발급 토큰의
// aud로 한다(platform docs/03-architecture/identity.md).
export const PLATFORM_APP_HEADER = "X-Seori-App";

export type PlatformCustomTokenResult = {
  firebaseCustomToken: string;
  appUserId: string;
};

/** 브리지 호출 실패. 계측에 실을 code를 담는다. */
export class PlatformAuthError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "PlatformAuthError";
    this.code = code;
    this.status = status;
  }
}

// 인증 결과. 실패해도 게임은 계속되어야 하므로 예외 대신 상태로 표현한다.
export type PlatformAuthOutcome =
  | { status: "signed-in"; appUserId: string }
  | { status: "skipped"; reason: PlatformAuthSkipReason }
  | { status: "failed"; code: string };

// 인증을 시도조차 하지 않은 이유. 실패(failed)와 구분해야 계측에서 장애와 정상적인
// 미시도를 섞지 않는다.
export type PlatformAuthSkipReason = "already-signed-in" | "unsupported";

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

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// platform 응답 봉투(불변식 12): { ok: true, result } 또는 { ok: false, error }.
type PlatformEnvelope = {
  ok?: unknown;
  result?: unknown;
  error?: { code?: unknown; message?: unknown };
};

function decodeCustomTokenEnvelope(
  status: number,
  ok: boolean,
  body: unknown,
): PlatformCustomTokenResult {
  const envelope: PlatformEnvelope =
    body != null && typeof body === "object" ? (body as PlatformEnvelope) : {};

  if (!ok || envelope.ok !== true) {
    throw new PlatformAuthError(
      nonEmptyString(envelope.error?.code) ?? "platform_unavailable",
      nonEmptyString(envelope.error?.message) ?? "인증 서버에 연결하지 못했어요.",
      status,
    );
  }

  const result =
    envelope.result != null && typeof envelope.result === "object"
      ? (envelope.result as Record<string, unknown>)
      : {};
  const firebaseCustomToken = nonEmptyString(result.firebaseCustomToken);
  const appUserId = nonEmptyString(result.appUserId);

  if (firebaseCustomToken == null || appUserId == null) {
    throw new PlatformAuthError(
      "platform_response_invalid",
      "인증 서버 응답을 확인하지 못했어요.",
      status,
    );
  }

  return { firebaseCustomToken, appUserId };
}

/** 브리지에서 custom token을 받아온다. 실패는 PlatformAuthError로 던진다. */
export async function requestPlatformCustomToken(
  fetchImpl: typeof fetch,
): Promise<PlatformCustomTokenResult> {
  const response = await fetchImpl(
    `${PLATFORM_API_BASE_URL}${PLATFORM_CUSTOM_TOKEN_PATH}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [PLATFORM_APP_HEADER]: PLATFORM_AUTH_APP_ID,
      },
      body: JSON.stringify({ appId: PLATFORM_AUTH_APP_ID }),
    },
  );

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PlatformAuthError(
      "platform_response_invalid",
      "인증 서버 응답을 확인하지 못했어요.",
      response.status,
    );
  }

  return decodeCustomTokenEnvelope(response.status, response.ok, body);
}

export type PlatformSignInDependencies = {
  // 이미 로그인한 사용자의 uid. 없으면 null. 로그인 상태는 Firebase SDK가 기기에
  // 영속하므로 재실행마다 브리지를 다시 부르지 않는다. 영속 복원이 끝나기를 기다려야
  // 하므로 비동기다(웹은 authStateReady, RN은 첫 onAuthStateChanged).
  getCurrentUserId: () => Promise<string | null>;
  signInWithCustomToken: (customToken: string) => Promise<void>;
  fetchImpl: typeof fetch;
};

/**
 * 인증을 보장한다. 어떤 경로로도 예외를 던지지 않는다. 호출부는 결과를 계측만 하고
 * 게임 흐름은 그대로 진행한다.
 */
export async function ensurePlatformSignIn(
  deps: PlatformSignInDependencies,
): Promise<PlatformAuthOutcome> {
  try {
    if (nonEmptyString(await deps.getCurrentUserId()) != null) {
      return { status: "skipped", reason: "already-signed-in" };
    }

    const { firebaseCustomToken, appUserId } = await requestPlatformCustomToken(
      deps.fetchImpl,
    );
    await deps.signInWithCustomToken(firebaseCustomToken);
    return { status: "signed-in", appUserId };
  } catch (error) {
    return { status: "failed", code: toPlatformAuthCode(error) };
  }
}

function toPlatformAuthCode(error: unknown): string {
  if (error instanceof PlatformAuthError) {
    return error.code;
  }
  return "platform_unavailable";
}
