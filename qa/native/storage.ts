import "../runtimeState";
const query = new URLSearchParams(location.search);
const prefix = `crossword-native-qa:${query.get("platform") ?? "android"}:${query.get("run") ?? "local"}:`;
export default {
  async getItem(key: string) {
    return localStorage.getItem(prefix + key);
  },
  async setItem(key: string, value: string) {
    if (window.__crosswordQa.storageFailure) throw new Error("qa-storage-full");
    localStorage.setItem(prefix + key, value);
  },
  async removeItem(key: string) {
    localStorage.removeItem(prefix + key);
  },
  async getAllKeys() {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  },
  async multiGet(keys: string[]) {
    return keys.map((key) => [key, localStorage.getItem(prefix + key)]);
  },
  async multiSet(rows: [string, string][]) {
    rows.forEach(([key, value]) => localStorage.setItem(prefix + key, value));
  },
  async multiRemove(keys: string[]) {
    keys.forEach((key) => localStorage.removeItem(prefix + key));
  },
};
