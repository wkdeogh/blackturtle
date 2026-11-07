import { expect, it } from "vitest";
import { isPushEndpoint, pushSubscriptionSchema } from "@/lib/push-subscription";

it.each(["https://fcm.googleapis.com/fcm/send/token", "https://updates.push.services.mozilla.com/wpush/v2/token", "https://web.push.apple.com/token", "https://wns1.notify.windows.com/token"])("accepts browser push endpoint %s", (url) => expect(isPushEndpoint(url)).toBe(true));
it.each(["http://fcm.googleapis.com/test", "https://localhost/", "https://127.0.0.1/", "https://fcm.googleapis.com.evil.test/", "https://fcm.googleapis.com@evil.test/", "https://user:pass@fcm.googleapis.com/", "https://fcm.googleapis.com:8443/", "file:///etc/passwd", "not-a-url"])("rejects arbitrary server destinations %s", (url) => expect(isPushEndpoint(url)).toBe(false));
it("requires the browser encryption keys and preserves only subscription fields", () => {
  const sub = { endpoint: "https://web.push.apple.com/token", keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } };
  expect(pushSubscriptionSchema.safeParse(sub).success).toBe(true);
  expect(pushSubscriptionSchema.safeParse({ ...sub, keys: { auth: "invalid" } }).success).toBe(false);
});
