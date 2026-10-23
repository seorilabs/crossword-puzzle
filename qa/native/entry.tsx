import { AppRegistry, Platform } from "react-native";
import "../runtimeState";

const query = new URLSearchParams(location.search);
Object.defineProperty(Platform, "OS", {
  value: query.get("platform") === "ios" ? "ios" : "android",
});
// 실제 네이티브 시작 파일의 인증, presence, 업데이트 안내도 함께 실행한다.
void import("../../apps/mobile/index.js").then(() => {
  AppRegistry.runApplication("CrosswordPuzzleMobile", {
    rootTag: document.getElementById("root"),
  });
});
