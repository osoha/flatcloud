"use client";
import { useState } from "react";
import { SmilePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { taskReactions } from "@/lib/task-discussion-shared";
export function TaskEntryReactions({ taskId, entryId, userId, reactions }: { taskId: string; entryId: string; userId: string; reactions: { reaction: string; userId: string; user: { name: string } }[] }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const router = useRouter();
  const mine = reactions.find(r => r.userId === userId)?.reaction;
  async function react(key: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/entries/${entryId}/reaction`, { method: "POST", body: new URLSearchParams({ reaction: mine === key ? "" : key }) });
      if (!response.ok) throw new Error("Reakci se nepodařilo uložit. Obnovte stránku a zkuste to znovu.");
      setOpen(false); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Chyba uložení."); }
    finally { setBusy(false); }
  }
  return <div className="entry-reactions" onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
    <button type="button" className="secondary reaction-picker-toggle" aria-label="Přidat reakci" aria-expanded={open} onClick={() => setOpen(!open)}><SmilePlus size={22} strokeWidth={1.8} aria-hidden="true"/> <span>Reagovat</span></button>
    {open && <div className="reaction-picker" role="group" aria-label="Vybrat reakci">{taskReactions.map(item => <button type="button" key={item.key} title={item.label} aria-label={item.label} aria-pressed={mine === item.key} disabled={busy} onClick={() => react(item.key)}><span className="reaction-emoji" aria-hidden="true">{item.emoji}</span></button>)}</div>}
    {taskReactions.map(item => { const matching = reactions.filter(r => r.reaction === item.key); return matching.length ? <details className="reaction-count" key={item.key}><summary aria-label={`${item.label}: ${matching.length}`} title={matching.map(r => r.user.name).join(", ")}><span className="reaction-emoji" aria-hidden="true">{item.emoji}</span><span className="reaction-total">{matching.length}</span></summary><div className="reaction-people">{matching.map(r => <span key={r.userId}>{r.user.name}</span>)}<button type="button" className="secondary" disabled={busy} onClick={() => react(item.key)}>{mine === item.key ? "Odebrat mou reakci" : "Také reagovat"}</button></div></details> : null; })}
    {error && <small role="alert">{error}</small>}
  </div>;
}
