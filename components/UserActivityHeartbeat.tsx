"use client";

import { useEffect } from "react";

/** Presence means a visible signed-in application tab, not a permanent login. */
export function UserActivityHeartbeat() {
  useEffect(() => {
    let stopped = false, pending = false, lastSent = 0;
    const controller = new AbortController();
    async function heartbeat() {
      if (stopped || pending || document.visibilityState !== "visible" || Date.now() - lastSent < 45_000) return;
      pending = true;
      try {
        const response = await fetch("/api/account/activity", { method: "POST", signal: controller.signal });
        if (response.status === 401) stopped = true;
        if (response.ok) lastSent = Date.now();
      } catch { /* A temporary presence failure must not interrupt the application. */ }
      finally { pending = false; }
    }
    void heartbeat();
    const timer = setInterval(heartbeat, 60_000);
    document.addEventListener("visibilitychange", heartbeat);
    window.addEventListener("focus", heartbeat);
    return () => { stopped = true; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", heartbeat); window.removeEventListener("focus", heartbeat); };
  }, []);
  return null;
}
