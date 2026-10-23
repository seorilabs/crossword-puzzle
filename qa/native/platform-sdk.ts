import { record } from "../runtimeState";
export const createPlatform = () => ({
  identity: {
    async firebaseCustomToken() {
      return {
        appUserId: "native-qa-user",
        firebaseCustomToken: "native-qa-fixture-token",
      };
    },
  },
  async signIn() {
    if (window.__crosswordQa.authFailure)
      throw new Error("qa-auth-unavailable");
    return { appUserId: "native-qa-user" };
  },
  config: {
    gate: () => window.__crosswordQa.updateGate,
    shouldPrompt: async () => true,
    markPrompted: async () => {},
  },
  presence: {
    start: async () => record("platform", "presence_start"),
    stop: async () => record("platform", "presence_stop"),
    resume: async () => record("platform", "presence_resume"),
  },
});
