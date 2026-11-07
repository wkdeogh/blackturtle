"use client";

import { useEffect, useRef, useState } from "react";

async function notificationRequest(body: object) {
  const response = await fetch("/api/notifications", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "알림 설정을 저장하지 못했습니다.");
  return result as { subscribed?: boolean };
}

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function PushNotificationSettings() {
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [available, setAvailable] = useState(false);
  const [message, setMessage] = useState("알림 설정을 확인하고 있습니다.");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      if (ios && !standalone) {
        setMessage("iPhone·iPad는 Safari에서 홈 화면에 추가한 앱을 열어 알림을 켜 주세요.");
        setBusy(false);
        return;
      }
      if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setMessage("이 브라우저에서는 푸시 알림을 지원하지 않습니다.");
        setBusy(false);
        return;
      }
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        const config = await response.json();
        if (!response.ok) throw new Error(config.error ?? "알림 설정을 확인하지 못했습니다.");
        // Register even before server setup so an existing device can turn off
        // its subscription if the server's VAPID configuration is unavailable.
        await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        const ready = await navigator.serviceWorker.ready;
        const subscription = await ready.pushManager.getSubscription();
        const status = subscription ? await notificationRequest({ action: "status", endpoint: subscription.endpoint }) : null;
        if (cancelled) return;
        registration.current = ready;
        setSubscribed(Boolean(status?.subscribed));
        setPublicKey(config.publicKey);
        setAvailable(Boolean(config.ready));
        setMessage(!config.ready ? "푸시 알림 서버 설정이 필요합니다." : Notification.permission === "denied" ? "기기 설정에서 Black Turtle 알림을 허용해 주세요." : "");
      } catch (caught) {
        if (!cancelled) {
          setIsError(true);
          setMessage(caught instanceof Error ? caught.message : "알림 설정을 확인하지 못했습니다.");
        }
      } finally { if (!cancelled) setBusy(false); }
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  async function toggle() {
    const ready = registration.current;
    if (!ready) return;
    setBusy(true); setIsError(false); setMessage("");
    try {
      if (subscribed) {
        const subscription = await ready.pushManager.getSubscription();
        if (subscription) {
          await notificationRequest({ action: "unsubscribe", endpoint: subscription.endpoint });
          await subscription.unsubscribe();
        }
        setSubscribed(false);
        setMessage("이 기기의 알림을 껐습니다.");
      } else {
        // Keep this permission prompt directly inside the user's click gesture.
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error(permission === "denied" ? "기기 설정에서 Black Turtle 알림을 허용해 주세요." : "알림 권한을 허용해야 푸시 알림을 받을 수 있습니다.");
        if (!publicKey) throw new Error("푸시 알림 서버 설정이 필요합니다.");
        let subscription = await ready.pushManager.getSubscription();
        const expectedKey = applicationServerKey(publicKey);
        if (subscription && subscription.options.applicationServerKey
          && new Uint8Array(subscription.options.applicationServerKey).toString() !== expectedKey.toString()) {
          await notificationRequest({ action: "unsubscribe", endpoint: subscription.endpoint });
          await subscription.unsubscribe();
          subscription = null;
        }
        subscription ??= await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expectedKey });
        await notificationRequest({ action: "subscribe", subscription: subscription.toJSON() });
        setSubscribed(true);
        setMessage("이 기기의 알림을 켰습니다.");
      }
    } catch (caught) {
      setIsError(true);
      setMessage(caught instanceof Error ? caught.message : "알림 설정을 저장하지 못했습니다.");
    } finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setIsError(false); setMessage("");
    try {
      const subscription = await registration.current?.pushManager.getSubscription();
      if (!subscription) { setSubscribed(false); throw new Error("알림을 다시 켜 주세요."); }
      try {
        await notificationRequest({ action: "test", endpoint: subscription.endpoint });
      } catch (caught) {
        const status = await notificationRequest({ action: "status", endpoint: subscription.endpoint });
        setSubscribed(Boolean(status.subscribed));
        throw caught;
      }
      setMessage("테스트 알림을 보냈습니다.");
    } catch (caught) {
      setIsError(true);
      setMessage(caught instanceof Error ? caught.message : "테스트 알림을 전송하지 못했습니다.");
    } finally { setBusy(false); }
  }

  return (
    <section className="push-settings" id="notifications" aria-labelledby="push-settings-title">
      <div className="push-settings-head"><div><p className="kicker">NOTIFICATIONS</p><h2 id="push-settings-title">푸시 알림</h2></div><span className="data-tag">{subscribed ? "이 기기 · 켜짐" : "이 기기 · 꺼짐"}</span></div>
      <ul className="push-settings-rules">
        <li><strong>공포탐욕지수</strong><span>구간 변경 · 10 이하 / 90 이상 진입</span></li>
        <li><strong>나스닥 MDD</strong><span>QQQ 전고점 대비 −5%, −10%, −15%… 도달</span></li>
      </ul>
      <div className="push-settings-actions">
        <button className="primary-button" type="button" onClick={toggle} disabled={busy || (!available && !subscribed)}>{busy ? "확인 중…" : subscribed ? "알림 끄기" : "알림 켜기"}</button>
        {subscribed ? <button className="secondary-button" type="button" onClick={test} disabled={busy || !available}>테스트 알림</button> : null}
      </div>
      {message ? <p className={isError ? "settings-message error" : "settings-message"} role="status">{message}</p> : null}
    </section>
  );
}
