import { TDSMobileProvider } from "@toss/tds-mobile";
import { TDSMobileAITProvider } from "@toss/tds-mobile-ait";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import config from "../apps-in-toss.config.ts";
import {
  ensurePlatformAuth,
  resumePlatformPresence,
  startPlatformPresence,
  stopPlatformPresence,
} from "./adapters/platformAuth.ts";
import App from "./App.tsx";
import { AppErrorBoundary } from "./components/AppErrorBoundary.tsx";
import "./index.css";

const localUserAgent = {
  colorPreference: "light",
  fontA11y: undefined,
  fontScale: 100,
  isAndroid: false,
  isIOS: false,
} as const;

// platform 인증(ADR 0013). 게임 진행을 막지 않는 부가 기능이므로 렌더를 기다리게 하지
// 않고 배경에서 시작한다. 실패는 어댑터가 계측만 하고 흡수한다.
void ensurePlatformAuth();
startPlatformPresence();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    stopPlatformPresence();
    return;
  }
  resumePlatformPresence();
});
window.addEventListener("pagehide", stopPlatformPresence);

const isTossApp =
  typeof window !== "undefined" &&
  window.navigator.userAgent.includes("TossApp/");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      {isTossApp ? (
        <TDSMobileAITProvider brandPrimaryColor={config.brand.primaryColor}>
          <App />
        </TDSMobileAITProvider>
      ) : (
        <TDSMobileProvider
          token={{ color: { primary: config.brand.primaryColor } }}
          userAgent={localUserAgent}
        >
          <App />
        </TDSMobileProvider>
      )}
    </AppErrorBoundary>
  </StrictMode>,
);
