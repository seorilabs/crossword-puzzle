import "../runtimeState";
const user = {
  uid: "native-qa-user",
  getIdToken: async () => "native-qa-fixture-token",
};
export default () => ({
  currentUser: user,
  onAuthStateChanged(callback: (value: typeof user) => void) {
    let active = true;
    queueMicrotask(() => {
      if (active) callback(user);
    });
    return () => {
      active = false;
    };
  },
  async signInWithCustomToken() {
    return { user };
  },
});
