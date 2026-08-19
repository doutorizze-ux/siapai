import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/support-sw.js").catch((error) => {
        console.warn("[support] não foi possível registrar o serviço de notificações:", error);
      });
    }
  }, []);
  return null;
}
