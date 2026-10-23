import { record } from "../runtimeState";
export * from "react-native-web";
export const Share = {
  sharedAction: "sharedAction",
  dismissedAction: "dismissedAction",
  async share(content: { message: string }) {
    record("native-share", "share", content);
    return { action: "sharedAction" };
  },
};
export const BackHandler = {
  addEventListener: () => ({ remove() {} }),
};
