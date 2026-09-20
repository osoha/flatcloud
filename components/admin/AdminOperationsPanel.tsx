"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
type Operations = { online: number; invitations: number; inboxErrors: number; asOf: string };
export function AdminOperationsPanel({ initial }: { initial: Operations }) {
  const [data, setData] = useState(initial), [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (document.visibilityState !== "visible" || pending) return;
      pending = true;
      try {
        const response = await fetch("/api/admin/operations", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        setData(await response.json()); setUnavailable(false);
      } catch { if (!controller.signal.aborted) setUnavailable(true); }
      finally { pending = false; }
    }
    const first = setTimeout(refresh, 1500), interval = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearTimeout(first); clearInterval(interval); controller.abort(); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return <section className="admin-operations-panel" aria-label="Provoz aplikace">
    <strong>Provoz aplikace</strong>
    <Link href="/uzivatele?activity=online" title="Viditelná karta aplikace během posledních 2 minut"><span>Uživatelé online</span><b>{data.online}</b></Link>
    <Link href="/uzivatele#cekajici-pozvanky"><span>Čekající pozvánky</span><b>{data.invitations}</b></Link>
    <Link href="/platby/nesparovane"><span>Chybné bankovní zprávy</span><b>{data.inboxErrors}</b></Link>
    {unavailable && <small role="status">Obnovení se nezdařilo. Zobrazen poslední stav.</small>}
  </section>;
}
