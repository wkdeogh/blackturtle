import * as webPush from "web-push";
import type { MarketNotification } from "@/lib/market-notifications";
import { getSupabaseAdmin } from "@/lib/supabase";
import { pushSubscriptionSchema } from "@/lib/push-subscription";

export function getPushConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export async function sendWebPush(subscription: webPush.PushSubscription, payload: object) {
  const configuration = getPushConfiguration();
  if (!configuration) throw new Error("푸시 알림 서버 설정이 필요합니다.");
  return webPush.sendNotification(subscription, JSON.stringify(payload), {
    vapidDetails: { subject: configuration.subject, publicKey: configuration.publicKey, privateKey: configuration.privateKey },
    TTL: 86_400, urgency: "normal", timeout: 15_000,
  });
}

export function pushErrorStatus(error: unknown): number | undefined {
  return error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : undefined;
}

interface Delivery {
  event_id: string;
  subscription_id: string;
  payload: MarketNotification;
  subscription: webPush.PushSubscription;
  attempts: number;
}

export async function dispatchPushNotifications() {
  if (!getPushConfiguration()) return { sent: 0, skipped: true, hasMore: false };
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 연결이 설정되지 않았습니다.");
  let sent = 0;
  let retry = false;
  // A bounded batch prevents one slow device from exhausting the worker.
  const { data, error } = await supabase.rpc("claim_push_deliveries", { p_limit: 20 });
  if (error) throw new Error(`푸시 알림 대기열 조회 실패: ${error.message}`);
  for (const delivery of (data ?? []) as Delivery[]) {
    try {
      const subscription = pushSubscriptionSchema.parse(delivery.subscription);
      await sendWebPush(subscription, { ...delivery.payload, tag: delivery.event_id });
    } catch (caught) {
      const status = pushErrorStatus(caught);
      if (status === 404 || status === 410) {
        const removed = await supabase.from("push_subscriptions").delete().eq("id", delivery.subscription_id);
        if (removed.error) throw new Error("만료된 푸시 구독을 제거하지 못했습니다.");
        continue;
      }
      const transient = (status === undefined || status === 429 || status >= 500) && delivery.attempts < 5;
      const updated = await supabase.from("push_deliveries").update({
        status: transient ? "pending" : "failed", next_attempt_at: new Date().toISOString(),
        last_error: status ? `Push service HTTP ${status}` : "Push delivery failed",
      }).eq("event_id", delivery.event_id).eq("subscription_id", delivery.subscription_id);
      if (updated.error) throw new Error("푸시 알림 실패 상태를 저장하지 못했습니다.");
      retry ||= transient;
      continue;
    }
    const updated = await supabase.from("push_deliveries").update({
      status: "sent", sent_at: new Date().toISOString(), last_error: null,
    }).eq("event_id", delivery.event_id).eq("subscription_id", delivery.subscription_id);
    if (updated.error) throw new Error("푸시 알림 전송 상태를 저장하지 못했습니다.");
    sent += 1;
  }
  if (retry) throw new Error("일부 푸시 알림을 전송하지 못해 재시도합니다.");
  return { sent, skipped: false, hasMore: (data?.length ?? 0) === 20 };
}
