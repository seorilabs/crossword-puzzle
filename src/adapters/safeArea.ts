import * as appsInTossFramework from "@apps-in-toss/web-framework";

// AIT WebView의 SafeAreaInsets를 CSS 변수(--ait-safe-area-*)로 노출한다.
// Toss 네비게이션 바(상단 로고/이름 · 우측 더보기·닫기 X)는 WebView 콘텐츠 위에
// 얹히므로, 앱 자체 커스텀 헤더(.appHeader)가 이 값을 padding으로 소비해 겹침을
// 피한다. 홈 화면의 TDS `Top`은 AIT-aware라 자체 처리되지만, 커스텀 헤더는 아니다.
// 일반 웹/비-AIT 환경에서는 SDK가 없으므로 변수를 설정하지 않고 CSS 폴백(0px)으로 둔다.

type SafeAreaInsetsValue = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

// 브리지 판정 기준은 get이 함수인지 하나뿐이다(있으면 최소한 현재값은 반영할 수 있다).
// subscribe는 SDK 버전에 따라 없을 수 있어 optional로 둔다 — 없으면 일회성 반영만 하고
// 구독은 건너뛴다. 따라서 subscribe는 호출부(initSafeAreaInsets)에서 존재를 재확인한 뒤 쓴다.
type SafeAreaInsetsBridge = {
  get: () => SafeAreaInsetsValue;
  subscribe?: (handler: {
    onEvent: (insets: SafeAreaInsetsValue) => void;
  }) => (() => void) | void;
};

// 임의의 후보 값이 사용 가능한 SafeArea 브리지인지 런타임으로 확정한다. Partial 캐스트는
// 컴파일 도우미일 뿐 런타임 보장이 아니므로, 여기서 get이 실제 함수인지 확인해 판정한다.
// get이 없으면 브리지로 보지 않고 null을 돌려준다. subscribe 누락은 브리지 여부와 무관하다
// (없어도 초기값 반영은 가능하므로 브리지로 인정하되, 구독은 호출부에서 건너뛴다).
// 반환은 후보 객체 그대로라 SDK의 get이 기대하는 this 바인딩이 유지된다.
export function resolveSafeAreaBridge(
  candidate: unknown,
): SafeAreaInsetsBridge | null {
  if (candidate == null || typeof candidate !== "object") {
    return null;
  }
  const { get } = candidate as { get?: unknown };
  if (typeof get !== "function") {
    return null;
  }
  return candidate as SafeAreaInsetsBridge;
}

// 네임스페이스 import로 접근해, 일부 SDK 버전에서 SafeAreaInsets가 export되지 않아도
// import 단계에서 throw하지 않는다(leaderboardAdapter와 동일한 방어 패턴).
function getSafeAreaBridge(): SafeAreaInsetsBridge | null {
  try {
    const framework = appsInTossFramework as { SafeAreaInsets?: unknown };
    return resolveSafeAreaBridge(framework.SafeAreaInsets);
  } catch {
    // 브리지 접근 자체가 실패하면 미지원으로 본다.
    return null;
  }
}

function toPx(value: unknown): string {
  return `${typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0}px`;
}

function applyInsets(insets: SafeAreaInsetsValue): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.style.setProperty("--ait-safe-area-top", toPx(insets?.top));
  root.style.setProperty("--ait-safe-area-right", toPx(insets?.right));
  root.style.setProperty("--ait-safe-area-bottom", toPx(insets?.bottom));
  root.style.setProperty("--ait-safe-area-left", toPx(insets?.left));
}

// 현재 SafeArea 값을 즉시 반영하고 변경을 구독한다. 반환값은 구독 해제 함수이며,
// 비-AIT 환경에서는 no-op을 돌려준다.
export function initSafeAreaInsets(): () => void {
  const bridge = getSafeAreaBridge();
  if (bridge == null) {
    return () => {};
  }

  try {
    applyInsets(bridge.get());
  } catch {
    // 초기값 조회 실패는 무시하고 구독만 시도한다.
  }

  if (typeof bridge.subscribe !== "function") {
    return () => {};
  }

  try {
    const cleanup = bridge.subscribe({
      onEvent: (insets) => applyInsets(insets),
    });
    return typeof cleanup === "function" ? cleanup : () => {};
  } catch {
    return () => {};
  }
}
