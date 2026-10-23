import { record } from "../runtimeState";
const notifications = new Map<string, unknown>();
export const AndroidImportance = { DEFAULT: 3 };
export const AuthorizationStatus = { DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 };
export const EventType = { PRESS: 1 };
export const TriggerType = { TIMESTAMP: 0 };
export default {
  async requestPermission() {
    record("notifications", "request_permission");
    return { authorizationStatus: window.__crosswordQa.notificationPermission };
  },
  async createChannel() {
    return "native-qa-reminder";
  },
  async createTriggerNotification(
    notification: { id: string },
    trigger: unknown,
  ) {
    notifications.set(notification.id, { notification, trigger });
    record("notifications", "schedule", { notification, trigger });
    return notification.id;
  },
  async cancelTriggerNotification(id: string) {
    notifications.delete(id);
    record("notifications", "cancel", { id });
  },
  async getInitialNotification() {
    return null;
  },
  async getTriggerNotifications() {
    return [...notifications.values()];
  },
  onBackgroundEvent() {
    return () => {};
  },
  onForegroundEvent() {
    return () => {};
  },
};
