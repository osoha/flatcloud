"use client";

import {useCallback, useEffect, useRef, useState, type FormEvent} from "react";
import {ArrowLeft, ArrowRight, Bell, CheckCircle2, Download, Info, MessageCircle, Plus, RefreshCw, Send, ShieldCheck} from "lucide-react";
import {PortalPanel} from "./PortalPanel";

type Attachment = {id: string; title: string; url: string; mimeType?: string};
type Conversation = {
  id: string; title: string; body: string; status: string; kind: string; createdAt: string; updatedAt: string;
  canReply?: boolean; authorName?: string; attachments?: Attachment[];
  entries?: {id: string; body: string; authorName: string; isTenant: boolean; createdAt: string; attachments: Attachment[]}[];
};
type Props = {tenantId: string; leaseId: string; subtitle: string; preview: boolean; contactLabel?: string};
const statusLabels: Record<string, string> = {OPEN: "Přijato", IN_PROGRESS: "Řeší se", WAITING: "Čeká na doplnění", DONE: "Vyřízeno", CANCELLED: "Uzavřeno"};
function timestamp(value: string) {return new Intl.DateTimeFormat("cs-CZ", {dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Prague"}).format(new Date(value));}
function kindLabel(kind: string) {return kind === "DEFECT" ? "Hlášení závady" : kind === "CONTACT_CHANGE" ? "Změna kontaktu" : "Zpráva";}

export function PortalConversations({tenantId, leaseId, subtitle, preview, contactLabel = "správci"}: Props) {
  const base = `zpravy-spravci-${leaseId}`;
  const endpoint = `/api/portal/tenants/${tenantId}/conversations`;
  const [view, setView] = useState<"new" | "list" | "thread">("new");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const [reload, setReload] = useState(0);
  const createKey = useRef(""), replyKey = useRef("");
  const replyForm = useRef<HTMLFormElement>(null);
  const [listMode, setListMode] = useState<"open" | "all">("open");
  const navigate = useCallback((target: "new" | "list" | string) => {
    window.location.hash = target === "new" ? `${base}-nove` : target === "list" ? `${base}-historie` : `${base}--${target}`;
  }, [base]);

  useEffect(() => {
    let controller: AbortController | undefined;
    const sync = async () => {
      controller?.abort();
      const hash = window.location.hash.slice(1);
      if (![base, `${base}-nove`, `${base}-historie`].includes(hash) && !hash.startsWith(`${base}--`)) return;
      const taskId = hash.startsWith(`${base}--`) ? hash.slice(base.length + 2) : null;
      const next = taskId ? "thread" : hash.endsWith("-historie") ? "list" : "new";
      setView(next); setError("");
      if (next === "new") {setLoading(false); return;}
      controller = new AbortController();
      const signal = controller.signal;
      setLoading(true);
      if (taskId) setConversation(null);
      try {
        const response = await fetch(taskId ? `${endpoint}/${encodeURIComponent(taskId)}${preview ? "?preview=1" : ""}` : `${endpoint}?leaseId=${encodeURIComponent(leaseId)}${preview ? "&preview=1" : ""}`, {signal, cache: "no-store"});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Zprávy se nepodařilo načíst.");
        if (signal.aborted) return;
        if (taskId) {setConversation(data.conversation); replyKey.current = "";} else setConversations(data.conversations || []);
      } catch (cause) {if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Zprávy se nepodařilo načíst.");}
      finally {if (!signal.aborted) setLoading(false);}
    };
    void sync();
    window.addEventListener("hashchange", sync);
    return () => {controller?.abort(); window.removeEventListener("hashchange", sync);};
  }, [base, endpoint, leaseId, preview, reload]);

  async function submit(event: FormEvent<HTMLFormElement>, reply: boolean) {
    event.preventDefault();
    if (busy || preview) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const key = reply ? replyKey : createKey;
    if (!key.current) key.current = crypto.randomUUID();
    data.set("submissionKey", key.current);
    if (!reply) {data.set("leaseId", leaseId); data.set("kind", "MESSAGE");}
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(reply ? `${endpoint}/${conversation!.id}` : endpoint, {method: "POST", body: data, headers: {Accept: "application/json"}});
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Zprávu se nepodařilo odeslat.");
      key.current = ""; form.reset();
      setSuccess(reply ? "Vaše odpověď je odeslaná." : "Zpráva je předaná správě bydlení. Další odpovědi najdete tady.");
      if (reply) {setReload(value => value + 1); replyForm.current?.querySelector("textarea")?.focus();}
      else navigate(payload.taskId || payload.conversation.id);
    } catch (cause) {setError(cause instanceof Error ? cause.message : "Odeslání se nepodařilo. Zkontrolujte připojení a zkuste to znovu.");}
    finally {setBusy(false);}
  }

  const visible = listMode === "all" ? conversations : conversations.filter(item => !["DONE", "CANCELLED"].includes(item.status));
  return <PortalPanel id={base} aliases={[`${base}-nove`, `${base}-historie`]} hashChildren title="Zprávy se správou bydlení" subtitle={subtitle}>
    <nav className="tp-conversation-nav" aria-label="Zprávy se správou bydlení"><button type="button" aria-pressed={view === "new"} onClick={() => navigate("new")}><Plus size={17}/> Nová zpráva</button><button type="button" aria-pressed={view !== "new"} onClick={() => navigate("list")}><MessageCircle size={17}/> Moje konverzace</button></nav>
    {preview && <div className="tp-info"><Info size={19}/><p>Náhled je pouze pro čtení. Zprávy tu může odesílat přihlášený nájemník.</p></div>}
    {error && <div className="tp-inline-error" role="alert"><p>{error}</p>{!busy && view !== "new" && <button type="button" className="tp-text-button" onClick={() => setReload(value => value + 1)}><RefreshCw size={16}/> Zkusit znovu</button>}</div>}
    {success && <p className="tp-inline-success" role="status"><CheckCircle2 size={19}/>{success}</p>}
    {view === "new" && <form className="tp-form" onSubmit={event => submit(event, false)}><p>Napište {contactLabel} přímo tady. Zpráva vytvoří požadavek a celá domluva zůstane pohromadě.</p><label className="tp-field"><span>Čeho se zpráva týká?</span><input name="title" minLength={3} maxLength={140} placeholder="Například: Domluva předání klíčů" required disabled={preview || busy}/></label><label className="tp-field"><span>Vaše zpráva</span><textarea name="body" rows={5} maxLength={5000} required placeholder="S čím vám můžeme pomoci?" disabled={preview || busy}/></label><div className="tp-form-footer"><span><ShieldCheck size={18}/> Zprávy a jejich vyřízení zůstávají v historii.</span><button className="tp-button tp-button-primary" disabled={busy || preview} type="submit"><Send size={17}/>{busy ? "Odesílám…" : "Odeslat zprávu"}</button></div></form>}
    {loading && <p className="tp-conversation-loading" role="status">Načítám konverzaci…</p>}
    {view === "list" && !loading && <><div className="tp-conversation-list-head"><h3>Vaše konverzace</h3><label className="tp-checkbox"><input type="checkbox" checked={listMode === "all"} onChange={event => setListMode(event.target.checked ? "all" : "open")}/><span>Včetně vyřízených</span></label></div>{visible.length ? <div className="tp-conversation-list">{visible.map(item => <button type="button" key={item.id} onClick={() => navigate(item.id)}><span className="tp-icon tp-icon-blue"><MessageCircle size={21}/></span><span className="tp-conversation-list-copy"><small>{kindLabel(item.kind)} · {timestamp(item.updatedAt || item.createdAt)}</small><strong>{item.title}</strong><span>{item.body}</span></span><span className={`tp-status ${["DONE", "CANCELLED"].includes(item.status) ? "tp-status-paid" : "tp-status-scheduled"}`}>{statusLabels[item.status] || "Přijato"}</span><ArrowRight size={17}/></button>)}</div> : <div className="tp-empty"><MessageCircle size={37}/><h3>{conversations.length ? "Všechny konverzace jsou vyřízené" : "Zatím tu nemáte žádnou konverzaci"}</h3><p>{conversations.length ? "Zapněte zobrazení vyřízených a projděte si historii domluvy." : "Napište nám novou zprávu. Odpovědi i průběh vyřízení najdete na tomto místě."}</p></div>}</>}
    {view === "thread" && conversation && !loading && <section className="tp-conversation-thread" aria-label="Konverzace"><button type="button" className="tp-text-button" onClick={() => navigate("list")}><ArrowLeft size={16}/> Všechny konverzace</button><div className="tp-conversation-heading"><div><span className="tp-eyebrow">{kindLabel(conversation.kind)}</span><h3>{conversation.title}</h3></div><span className={`tp-status ${["DONE", "CANCELLED"].includes(conversation.status) ? "tp-status-paid" : "tp-status-scheduled"}`}>{statusLabels[conversation.status] || "Přijato"}</span></div><ol className="tp-conversation-stream"><li className="tp-chat-original"><div className="tp-chat-meta"><strong>{conversation.authorName || (conversation.kind === "TASK" ? "Správa bydlení" : "Původní zpráva")}</strong><time dateTime={conversation.createdAt}>{timestamp(conversation.createdAt)}</time></div><p>{conversation.body}</p><Attachments items={conversation.attachments}/></li>{conversation.entries?.map(entry => <li key={entry.id} className={entry.isTenant ? "tp-chat-tenant" : "tp-chat-staff"}><div className="tp-chat-meta"><strong>{entry.authorName}{entry.isTenant ? " · nájemník" : " · správa bydlení"}</strong><time dateTime={entry.createdAt}>{timestamp(entry.createdAt)}</time></div><p>{entry.body}</p><Attachments items={entry.attachments}/></li>)}</ol>{conversation.canReply && !preview ? <form ref={replyForm} className="tp-form tp-chat-reply" onSubmit={event => submit(event, true)}><label className="tp-field"><span>Vaše odpověď</span><textarea name="body" rows={3} maxLength={5000} placeholder="Doplňte zprávu nebo odpovězte správci…" required disabled={busy}/></label><div className="tp-form-footer"><span><ShieldCheck size={17}/> Odpověď se připojí k této konverzaci.</span><button className="tp-button tp-button-primary" type="submit" disabled={busy}><Send size={17}/>{busy ? "Odesílám…" : "Odeslat odpověď"}</button></div></form> : !preview && <div className="tp-info"><CheckCircle2 size={20}/><p>{["DONE", "CANCELLED"].includes(conversation.status) ? <>Tato konverzace je uzavřená. Pokud potřebujete něco dalšího, <button type="button" className="tp-text-button" onClick={() => navigate("new")}>napište novou zprávu</button>.</> : "V této konverzaci nyní nelze odpovídat. Pro další domluvu prosím použijte přímý kontakt na správu bydlení."}</p></div>}</section>}
    <div className="tp-notification-note"><Bell size={17}/><p>Na nové odpovědi, oznámení a důležité změny vám posíláme e-mailové upozornění. Tato provozní upozornění jsou vždy zapnutá.</p></div>
  </PortalPanel>;
}
function Attachments({items}: {items?: Attachment[]}) {return items?.length ? <div className="tp-chat-attachments">{items.map(item => <a key={item.id} href={item.url} className="tp-text-link"><Download size={16}/>{item.title}</a>)}</div> : null;}
