import { record } from "../runtimeState";
export default {
  getAppVersion: () => "0.0.0-qa",
  isSupported: () => true,
  isAuthenticated: async () => true,
  submitScore: async (score: number) => {
    record("leaderboard", "submit", { score });
  },
  openLeaderboard: async () => {
    record("leaderboard", "open");
  },
};
