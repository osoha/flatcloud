"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, LockKeyhole, MessageCircle, Paperclip, Users } from "lucide-react";
import styles from "./TaskThreadComposer.module.css";
import { TaskMentionEditor } from "./TaskMentionEditor";
import { UserAvatar } from "./UserAvatar";
import type { DiscussionPerson } from "@/lib/task-discussion-shared";
const options = [["COMMENT", "Poznámka"], ["CALL", "Telefonát"], ["EMAIL", "E-mail / zpráva"], ["PROMISE", "Příslib úhrady"]] as const;
export function TaskThreadComposer({ taskId, collection = false, showKinds = false, allowPromise = false, allowFiles = true, tenantConversation = false, defaultTenantReply = false, people = [], currentUserId, currentUserName = "", currentUserAvatarMimeType, currentUserUpdatedAt }: { taskId: string; collection?: boolean; showKinds?: boolean; allowPromise?: boolean; allowFiles?: boolean; tenantConversation?: boolean; defaultTenantReply?: boolean; people?: DiscussionPerson[]; currentUserId?: string; currentUserName?: string; currentUserAvatarMimeType?: string | null; currentUserUpdatedAt?: Date | string }) {
  const [kind, setKind] = useState<(typeof options)[number][0]>(collection && showKinds ? "CALL" : "COMMENT");
  const [submitting, setSubmitting] = useState(false), [visibility, setVisibility] = useState(tenantConversation && defaultTenantReply ? "TENANT_VISIBLE" : "INTERNAL"), [notify, setNotify] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [tenantBody, setTenantBody] = useState("");
  const publicReply = visibility === "TENANT_VISIBLE";
  useEffect(() => {
    function reply(event: Event) {
      const detail = (event as CustomEvent<{taskId: string}>).detail;
      if (detail.taskId !== taskId) return;
      if (event.type === "flatberry:tenant-reply" && tenantConversation) {
        setVisibility("TENANT_VISIBLE");
        requestAnimationFrame(() => document.getElementById(`tenant-reply-${taskId}`)?.focus());
      } else if (event.type === "flatberry:task-reply") setVisibility(current => current === "TENANT_VISIBLE" ? "INTERNAL" : current);
    }
    window.addEventListener("flatberry:tenant-reply", reply);
    window.addEventListener("flatberry:task-reply", reply);
    return () => {window.removeEventListener("flatberry:tenant-reply", reply); window.removeEventListener("flatberry:task-reply", reply);};
  }, [taskId, tenantConversation]);
  const [mentionIds, setMentionIds] = useState<string[]>([]), [selectedIds, setSelectedIds] = useState<string[]>([]), [files, setFiles] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const eligible = useMemo(() => people.filter(person => visibility === "OWNER_VISIBLE" || person.internal), [people, visibility]);
  const recipients = eligible.filter(p => p.participant !== false && p.id !== currentUserId);
  const recipientIds = new Set(publicReply ? [] : [...mentionIds, ...(notify ? selectedIds.filter(id => recipients.some(p => p.id === id)) : [])]);
  const placeholder = kind === "CALL" ? "Co bylo domluveno při telefonátu?" : kind === "EMAIL" ? "Shrnutí odeslané nebo přijaté zprávy…" : kind === "PROMISE" ? "Co nájemník slíbil a za jakých podmínek?" : "Napište komentář…";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch(form.action, { method: "POST", body: data, headers: { Accept: "application/json" } });
      const payload = await response.json() as { ok?: boolean; url?: string; error?: string };
      if (response.ok && payload.ok && payload.url) {
        window.location.assign(payload.url);
        return;
      }
      setSubmitError(payload.error || "Záznam se nepodařilo přidat. Zkuste to znovu.");
    } catch {
      setSubmitError("Záznam se nepodařilo odeslat. Zkontrolujte připojení a zkuste to znovu.");
    }
    setSubmitting(false);
  }
  return <div className="task-composer-row"><UserAvatar user={{ id: currentUserId, name: currentUserName, avatarMimeType: currentUserAvatarMimeType, updatedAt: currentUserUpdatedAt }} size="sm"/><form className={`thread-composer-v211${publicReply ? ` tenant-reply-composer ${styles.publicReply}` : ""}`} action={`/api/tasks/${taskId}/entries`} method="post" encType="multipart/form-data" onSubmit={submit}>
    <div className="composer-top">{showKinds && !publicReply ? <div className="composer-tabs" role="group" aria-label="Typ záznamu">{options.filter(([value]) => allowPromise || value !== "PROMISE").map(([value,label]) => <button key={value} className={kind===value?"active":""} type="button" onClick={()=>setKind(value)}>{label}</button>)}</div> : <span className="composer-title">{publicReply ? "Zpráva nájemníkovi" : "Nový komentář"}</span>}
    <label className="composer-visibility">{publicReply ? <MessageCircle size={17} aria-hidden="true"/> : <LockKeyhole size={17} aria-hidden="true"/>}<select name="visibility" value={visibility} onChange={event => setVisibility(event.target.value)} aria-label="Viditelnost záznamu"><option value="INTERNAL">Interní</option><option value="OWNER_VISIBLE">Viditelné vlastníkovi</option>{tenantConversation && <option value="TENANT_VISIBLE">Zpráva nájemníkovi</option>}</select></label></div>
    <input type="hidden" name="kind" value={showKinds && !publicReply ? kind : "COMMENT"}/>
    {!publicReply && kind === "PROMISE" && allowPromise && <div className="promise-fields"><label className="field"><span>Přislíbené datum</span><input name="promiseDate" type="date" required/></label><label className="field"><span>Přislíbená částka Kč</span><input name="promiseAmount" type="number" step="0.01" min="0.01"/></label></div>}
    <div hidden={publicReply}><TaskMentionEditor disabled={publicReply} people={eligible} placeholder={placeholder} taskId={taskId} currentUserId={currentUserId} onRecipientsChange={setMentionIds} tools={<>{allowFiles && <button type="button" onClick={() => fileInput.current?.click()}><Paperclip size={20} aria-hidden="true"/>Přiložit</button>}<button type="button" aria-expanded={notify} onClick={() => setNotify(!notify)}><Bell size={19} aria-hidden="true"/>Upozornit</button></>}/></div>
    {publicReply && <div className="field composer-body"><label htmlFor={`tenant-reply-${taskId}`}>Zpráva nájemníkovi</label><textarea id={`tenant-reply-${taskId}`} name="body" value={tenantBody} onChange={event => setTenantBody(event.target.value)} rows={4} maxLength={5000} required placeholder="Napište odpověď, kterou nájemník uvidí ve svém portálu…"/><p className="muted-copy"><Bell size={15} aria-hidden="true"/> Nájemník uvidí tuto zprávu v portálu a dostane e-mailové upozornění. Interní poznámky pište v režimu Interní.</p></div>}
    {!publicReply && notify && <fieldset className="notification-recipients"><legend>Upozornit e-mailem další účastníky</legend>{recipients.map(person => <label className="checkbox-field" key={person.id}><input type="checkbox" name="notificationRecipientIds" value={person.id} checked={selectedIds.includes(person.id)} onChange={e => setSelectedIds(ids => e.target.checked ? [...ids, person.id] : ids.filter(id => id !== person.id))}/><span>{person.name}</span></label>)}</fieldset>}
    {allowFiles && <input disabled={publicReply} ref={fileInput} name="files" type="file" multiple hidden aria-label="Přiložit fotografie nebo soubory" onChange={e => setFiles(Array.from(e.target.files || []).map(file => file.name))}/>}
    {!publicReply && files.length > 0 && <div className="composer-files">{files.map((name, index) => <span key={index}><Paperclip size={15}/>{name}</span>)}<button type="button" onClick={() => { if (fileInput.current) fileInput.current.value = ""; setFiles([]); }}>Odebrat přílohy</button></div>}
    {submitError && <p role="alert" className="error">{submitError}</p>}
    <div className="composer-actions"><small aria-live="polite">{publicReply ? <><MessageCircle size={18} aria-hidden="true"/> Viditelné nájemníkovi · e-mailové upozornění zapnuté</> : recipientIds.size > 0 ? <><Users size={19} aria-hidden="true"/>Adresně upozornit: {recipientIds.size} {recipientIds.size === 1 ? "osobu" : recipientIds.size < 5 ? "osoby" : "osob"}</> : visibility === "INTERNAL" ? "Interní · Vidí pouze oprávnění účastníci" : "Záznam a přílohy uvidí i oprávnění vlastníci"}</small><button className="primary" type="submit" disabled={submitting}>{submitting ? "Odesílám…" : publicReply ? "Odeslat nájemníkovi" : "Odeslat"}</button></div>
  </form></div>;
}
