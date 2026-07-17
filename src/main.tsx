import { TDSMobileProvider } from "@toss/tds-mobile";
import { TDSMobileAITProvider } from "@toss/tds-mobile-ait";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import config from "../granite.config.ts";
import App from "./App.tsx";
import { RuntimeHost } from "./game-shell/RuntimeHost.tsx";
import "./index.css";

const localUserAgent = {
  colorPreference: "light",
  fontA11y: undefined,
  fontScale: 100,
  isAndroid: false,
  isIOS: false,
} as const;

const isTossApp =
  typeof window !== "undefined" &&
  window.navigator.userAgent.includes("TossApp/");

const legacyApp = (
  <StrictMode>
    <App />
  </StrictMode>
);

createRoot(document.getElementById("root")!).render(
  isTossApp ? (
    <TDSMobileAITProvider brandPrimaryColor={config.brand.primaryColor}>
      <RuntimeHost legacy={legacyApp} />
    </TDSMobileAITProvider>
  ) : (
    <TDSMobileProvider
      token={{ color: { primary: config.brand.primaryColor } }}
      userAgent={localUserAgent}
    >
      <RuntimeHost legacy={legacyApp} />
    </TDSMobileProvider>
  ),
);
