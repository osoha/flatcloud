"use client";

import {useEffect, useRef, useState, type FormEvent} from "react";
import {ArrowRight, Bell, CheckCircle2, Info, Send, ShieldCheck} from "lucide-react";
import {PortalPanel} from "./PortalPanel";

type Contact = {email: string | null; phone: string | null; correspondenceAddress: string | null};
type Request = {id: string; taskId: string; status: string; before: Partial<Contact>; requested: Partial<Contact>; createdAt: string; reviewedAt: string | null; reviewNote: string | null};
const labels: Record<keyof Contact, string> = {email: "Kontaktní e-mail", phone: "Telefon", correspondenceAddress: "Korespondenční adresa"};
const statusLabels: Record<string, string> = {PENDING: "Čeká na vyřízení", ACKNOWLEDGED: "Převzato k vyřízení", REJECTED: "Nepřijato"};
function timestamp(value: string) {return new Intl.DateTimeFormat("cs-CZ", {dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Prague"}).format(new Date(value));}
export function PortalContactChange({tenantId, leaseId, subtitle, preview}: {tenantId: string; leaseId: string; subtitle: string; preview: boolean}) {
  const id = `kontaktni-udaje-${leaseId}`;
  const endpoint = `/api/portal/tenants/${tenantId}/contact-change-requests`;
  const [contact, setContact] = useState<Contact | null>(null), [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState(false), [reload, setReload] = useState(0);
  const submissionKey = useRef("");
  useEffect(() => {
    let controller: AbortController | undefined;
    async function sync() {
      controller?.abort();
      if (window.location.hash !== `#${id}`) return;
      controller = new AbortController(); const signal = controller.signal;
      setLoading(true); setError("");
      try {
        const response = await fetch(`${endpoint}?leaseId=${encodeURIComponent(leaseId)}${preview ? "&preview=1" : ""}`, {signal, cache: "no-store"});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Kontaktní údaje se nepodařilo načíst.");
        if (!signal.aborted) {setContact(data.currentContact); setRequests(data.requests || []);}
      } catch (cause) {if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Kontaktní údaje se nepodařilo načíst.");}
      finally {if (!signal.aborted) setLoading(false);}
    }
    void sync(); window.addEventListener("hashchange", sync);
    return () => {controller?.abort(); window.removeEventListener("hashchange", sync);};
  }, [id, endpoint, leaseId, preview, reload]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || preview) return;
    const form = event.currentTarget, data = new FormData(form);
    if (!submissionKey.current) submissionKey.current = crypto.randomUUID();
    setBusy(true); setError(""); setSuccess(false);
    try {
      const response = await fetch(endpoint, {method: "POST", headers: {"Content-Type": "application/json", Accept: "application/json"}, body: JSON.stringify({leaseId, submissionKey: submissionKey.current, email: String(data.get("email") || "").trim() || undefined, phone: data.get("phone"), correspondenceAddress: data.get("correspondenceAddress"), reason: data.get("reason")})});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Požadavek se nepodařilo odeslat.");
      submissionKey.current = ""; setSuccess(true); form.reset(); setReload(value => value + 1);
    } catch (cause) {setError(cause instanceof Error ? cause.message : "Požadavek se nepodařilo odeslat. Zkuste to znovu.");}
    finally {setBusy(false);}
  }
  const pending = requests.find(request => request.status === "PENDING");
  return <PortalPanel id={id} title="Moje kontaktní údaje" subtitle={subtitle}>
    <div className="tp-info"><ShieldCheck size={21}/><p>Nahlaste změnu správě bydlení. Požadavek i jeho vyřízení zůstanou v historii. Samotné nahlášení vaše kontakty ani přihlášení nezmění. Správce změnu ověří a domluví s vámi další postup.</p></div>
    {preview && <p className="tp-info"><Info size={19}/> Náhled je pouze pro čtení. Požadavek může odeslat nájemník.</p>}
    {error && <div className="tp-inline-error" role="alert"><p>{error}</p>{!contact && <button className="tp-text-button" type="button" onClick={() => setReload(value => value + 1)}>Zkusit znovu</button>}</div>}
    {success && <p className="tp-inline-success" role="status"><CheckCircle2 size={19}/> Požadavek jsme předali správě bydlení. O jeho vyřízení vám dáme vědět.</p>}
    {!loading && pending && <div className="tp-info"><Info size={20}/><p>Vaše předchozí nahlášení čeká u správce. Další informace můžete doplnit v <a className="tp-text-link" href={`#zpravy-spravci-${leaseId}--${pending.taskId}`}>konverzaci k této změně</a>.</p></div>}
    {loading ? <p className="tp-conversation-loading" role="status">Načítám kontaktní údaje…</p> : contact && !pending && <form className="tp-form" onSubmit={submit}>
      <p>Opravte pouze údaje, které se změnily.</p>
      <div className="tp-form-row"><label className="tp-field"><span>Kontaktní e-mail</span><input type="email" name="email" required={Boolean(contact.email)} defaultValue={contact.email || ""} maxLength={254} autoComplete="email" disabled={preview || busy}/><small>Aktuálně: {contact.email || "Není uveden"}</small></label><label className="tp-field"><span>Telefon</span><input type="tel" name="phone" defaultValue={contact.phone || ""} maxLength={40} autoComplete="tel" disabled={preview || busy}/><small>Aktuálně: {contact.phone || "Není uveden"}</small></label></div>
      <label className="tp-field"><span>Korespondenční adresa</span><input name="correspondenceAddress" defaultValue={contact.correspondenceAddress || ""} maxLength={500} autoComplete="street-address" disabled={preview || busy}/><small>Aktuálně: {contact.correspondenceAddress || "Není uvedena"}</small></label>
      <label className="tp-field"><span>Poznámka ke změně (nepovinná)</span><textarea name="reason" rows={3} maxLength={1000} placeholder="Například od kdy nový kontakt používáte…" disabled={preview || busy}/></label>
      <div className="tp-form-footer"><span><ShieldCheck size={17}/> Správce změnu ověří a zpracuje.</span><button className="tp-button tp-button-primary" type="submit" disabled={preview || busy}><Send size={17}/>{busy ? "Odesílám…" : "Nahlásit změnu"}</button></div>
    </form>}
    <div className="tp-notification-note"><Bell size={17}/><p>Provozní e-mailová upozornění jsou vždy zapnutá. Proto prosím udržujte svůj kontaktní e-mail aktuální.</p></div>
    {requests.length > 0 && <section className="tp-contact-request-history"><h3>Historie nahlášených změn</h3>{requests.map(request => <article key={request.id}><div className="tp-request-top"><strong>{timestamp(request.createdAt)}</strong><span className={`tp-status ${request.status === "REJECTED" ? "tp-status-overdue" : "tp-status-scheduled"}`}>{statusLabels[request.status] || "Přijato"}</span></div><dl>{(Object.keys(labels) as (keyof Contact)[]).filter(key => Object.prototype.hasOwnProperty.call(request.requested, key) && request.requested[key] !== request.before[key]).map(key => <div key={key}><dt>{labels[key]}</dt><dd><span>{request.before[key] || "Neuvedeno"}</span><ArrowRight size={14}/><strong>{request.requested[key] || "Odebrání údaje"}</strong></dd></div>)}</dl>{request.reviewNote && <p>{request.reviewNote}</p>}<a className="tp-text-link" href={`#zpravy-spravci-${leaseId}--${request.taskId}`}>Otevřít konverzaci ke změně <ArrowRight size={15}/></a></article>)}</section>}
  </PortalPanel>;
}
