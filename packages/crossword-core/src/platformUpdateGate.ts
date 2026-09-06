// 업데이트 게이트 판정을 앱 어댑터에 넘기기 전 공통 절차.
//
// 서버가 이미 판정을 확정했다(`UpdateGateState`). 이 모듈은 버전을 비교하지 않고,
// 언제 다시 띄워도 되는지(`shouldPrompt`)만 SDK의 `Config`에 위임한다.
//
// core는 다른 platform* 모듈과 마찬가지로 `@seorilabs/platform-sdk`를 import하지
// 않는다(check-release-parity.mjs가 이를 강제한다). SDK의 `UpdateGateState`와
// 구조가 같은 타입을 여기 한 벌 더 둔다 — 어댑터가 넘기는 실제 SDK 값은 구조적으로
// 호환된다.

export type UpdateGateState =
  | { kind: "ok" }
  | {
      kind: "recommended";
      message: string;
      updateUrl?: string;
      recommendedVersion?: string;
    }
  | {
      kind: "required";
      message: string;
      updateUrl?: string;
      recommendedVersion?: string;
    }
  | { kind: "maintenance"; message: string; until?: string };

export type PlatformUpdateGateConfig = {
  gate(): UpdateGateState;
  shouldPrompt(state: UpdateGateState): Promise<boolean>;
  markPrompted(state: UpdateGateState): Promise<void>;
};

/**
 * 지금 안내를 띄워야 하면 그 상태를 돌려주고, 아니면 null이다.
 *
 * `ok`는 `shouldPrompt`를 묻지 않고 바로 null이다 — 이력 저장소 조회 자체가
 * 실패할 여지를 없앤다. 네트워크를 타지 않는다: `gate()`는 세션 응답으로 이미
 * 채워진 캐시를 읽는다.
 */
export async function evaluateUpdateGate(
  config: PlatformUpdateGateConfig,
): Promise<UpdateGateState | null> {
  const state = config.gate();
  if (state.kind === "ok") {
    return null;
  }
  const shouldShow = await config.shouldPrompt(state);
  return shouldShow ? state : null;
}
