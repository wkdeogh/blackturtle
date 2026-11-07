import { beforeEach, describe, expect, it, vi } from "vitest";
import { createECDH, randomBytes } from "node:crypto";
import * as webPush from "web-push";
import { dispatchPushNotifications } from "@/lib/web-push";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("web-push", async (importActual) => ({ ...await importActual<typeof import("web-push")>(), sendNotification: mocks.send }));

const subscription = { endpoint: "https://web.push.apple.com/test", keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } };
const delivery = { event_id: "run:nasdaq-mdd-5", subscription_id: "device", attempts: 1, payload: { title: "나스닥MDD알림", body: "-5%", url: "/market" }, subscription };
const updates: Record<string, unknown>[] = [];
let deleteCalled = false;

beforeEach(() => {
  vi.stubEnv("VAPID_PUBLIC_KEY", "public"); vi.stubEnv("VAPID_PRIVATE_KEY", "private"); vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
  mocks.rpc.mockReset().mockResolvedValue({ data: [delivery], error: null });
  mocks.send.mockReset().mockResolvedValue({ statusCode: 201 });
  updates.length = 0; deleteCalled = false;
  mocks.from.mockImplementation(() => {
    const query = {
      update: (data: Record<string, unknown>) => { updates.push(data); return query; },
      delete: () => { deleteCalled = true; return query; },
      eq: () => query,
      then: (resolve: (result: object) => void) => Promise.resolve({ error: null }).then(resolve),
    };
    return query;
  });
});

describe("push delivery", () => {
  it("sends the event tag and records successful per-device delivery", async () => {
    expect(await dispatchPushNotifications()).toEqual({ sent: 1, skipped: false, hasMore: false });
    expect(JSON.parse(mocks.send.mock.calls[0][1]).tag).toBe(delivery.event_id);
    expect(updates[0]).toMatchObject({ status: "sent", last_error: null });
  });
  it("removes expired devices on HTTP 410", async () => {
    mocks.send.mockRejectedValue({ statusCode: 410 });
    expect(await dispatchPushNotifications()).toEqual({ sent: 0, skipped: false, hasMore: false });
    expect(deleteCalled).toBe(true);
  });
  it("continues draining when alerts exceed one worker batch", async () => {
    mocks.rpc.mockResolvedValue({ data: Array.from({ length: 20 }, (_, index) => ({ ...delivery, event_id: `event-${index}` })), error: null });
    expect(await dispatchPushNotifications()).toEqual({ sent: 20, skipped: false, hasMore: true });
  });
  it("retains a transient failure for the durable step retry", async () => {
    mocks.send.mockRejectedValue({ statusCode: 503 });
    await expect(dispatchPushNotifications()).rejects.toThrow("재시도");
    expect(updates[0]).toMatchObject({ status: "pending", last_error: "Push service HTTP 503" });
  });
  it("stops retrying permanent errors and exhausted deliveries", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...delivery, attempts: 5 }], error: null });
    mocks.send.mockRejectedValue({ statusCode: 429 });
    expect(await dispatchPushNotifications()).toEqual({ sent: 0, skipped: false, hasMore: false });
    expect(updates[0].status).toBe("failed");
  });
  it("leaves queued alerts intact until server configuration is available", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(await dispatchPushNotifications()).toEqual({ sent: 0, skipped: true, hasMore: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("supports the installed library's real named exports and payload encryption", () => {
    const keys = webPush.generateVAPIDKeys();
    const recipient = createECDH("prime256v1"); recipient.generateKeys();
    const details = webPush.generateRequestDetails({ ...subscription, keys: { p256dh: recipient.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } }, JSON.stringify(delivery.payload), {
      vapidDetails: { subject: "mailto:test@example.com", ...keys },
    });
    expect(details.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(details.headers.Authorization).toMatch(/^vapid /);
    expect(details.body!.length).toBeGreaterThan(0);
  });
});
