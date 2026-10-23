import "../runtimeState";
const originalStorage = window.localStorage;
const run =
  new URLSearchParams(location.search).get("run") ??
  sessionStorage.getItem("crossword-web-qa:active-run") ??
  "local";
sessionStorage.setItem("crossword-web-qa:active-run", run);
const prefix = `crossword-web-qa:${run}:`;
const keys = () =>
  Object.keys(originalStorage).filter((key) => key.startsWith(prefix));
Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (key: string) => originalStorage.getItem(prefix + key),
    setItem: (key: string, value: string) => {
      if (window.__crosswordQa.storageFailure)
        throw new Error("qa-storage-full");
      originalStorage.setItem(prefix + key, value);
    },
    removeItem: (key: string) => originalStorage.removeItem(prefix + key),
    key: (index: number) => keys()[index]?.slice(prefix.length) ?? null,
    get length() {
      return keys().length;
    },
    clear: () => keys().forEach((key) => originalStorage.removeItem(key)),
  },
});
void import("../../src/main");
