"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
export function RefreshActivity() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" className="secondary" disabled={pending} onClick={() => start(() => router.refresh())}>{pending ? "Obnovuji…" : "Obnovit aktivitu"}</button>;
}
