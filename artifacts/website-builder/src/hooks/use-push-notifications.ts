import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

type RegisterTokenFn = (token: string) => Promise<void> | void;

/**
 * Push Notifications (Android/Native only).
 * ملاحظة: هذا الكود معزول تماماً عن أي منطق بريد إلكتروني أو خدمات إرسال إيميلات.
 */
export function usePushNotifications(registerToken?: RegisterTokenFn) {
  useEffect(() => {
    // Web must not register (also avoids running inside browser builds)
    if (Capacitor.getPlatform() === "web") return;

    let cancelled = false;

    const init = async () => {
      try {
        const current = await PushNotifications.checkPermissions();
        if (current.receive !== "granted") {
          const requested = await PushNotifications.requestPermissions();
          if (requested.receive !== "granted") return;
        }

        await PushNotifications.addListener("registration", async (token) => {
          try {
            if (cancelled) return;
            if (registerToken) await registerToken(token.value);
            // eslint-disable-next-line no-console
            console.log("[Push] registered token:", token.value);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error("[Push] token handler failed:", err);
          }
        });

        await PushNotifications.addListener("registrationError", (err) => {
          // eslint-disable-next-line no-console
          console.error("[Push] registration error:", err);
        });

        await PushNotifications.addListener("pushNotificationReceived", (notification) => {
          // eslint-disable-next-line no-console
          console.log("[Push] received:", notification);
        });

        await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          // eslint-disable-next-line no-console
          console.log("[Push] action performed:", action);
        });

        await PushNotifications.register();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[Push] init failed:", err);
      }
    };

    void init();

    return () => {
      cancelled = true;
      PushNotifications.removeAllListeners().catch(() => undefined);
    };
  }, [registerToken]);
}

