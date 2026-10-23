import React from "react";
import { createRoot } from "react-dom/client";
import { Platform } from "react-native";
import "../runtimeState";

const query = new URLSearchParams(location.search);
Object.defineProperty(Platform, "OS", {
  value: query.get("platform") === "ios" ? "ios" : "android",
});
void import("../../apps/mobile/App").then(({ default: App }) => {
  createRoot(document.getElementById("root")!).render(<App />);
});
