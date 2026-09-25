"use client";
import { useMemo, useRef, useState } from "react";
import { Bell, LockKeyhole, Paperclip, Users } from "lucide-react";
import { TaskMentionEditor } from "./TaskMentionEditor";
import { UserAvatar } from "./UserAvatar";
import type { DiscussionPerson } from "@/lib/task-discussion-shared";
const options = [["COMMENT", "Poznámka"], ["CALL", "Telefonát"], ["EMAIL", "E-mail / zpráva"], ["PROMISE", "Příslib úhrady"]] as const;
export function TaskThreadComposer({ taskId, collection = false, showKinds = false, allowPromise = false, allowFiles = true, people = [], currentUserId, currentUserName = "" }: { taskId: string; collection?: boolean; showKinds?: boolean; allowPromise?: boolean; allowFiles?: boolean; people?: DiscussionPerson[]; currentUserId?: string; currentUserName?: string }) {
  const [kind, setKind] = useState<(typeof options)[number][0]>(collection && showKinds ? "CALL" : "COMMENT");
  const [submitting, setSubmitting] = useState(false), [visibility, setVisibility] = useState("INTERNAL"), [notify, setNotify] = useState(false);
  const [mentionIds, setMentionIds] = useState<string[]>([]), [selectedIds, setSelectedIds] = useState<string[]>([]), [files, setFiles] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const eligible = useMemo(() => people.filter(person => visibility === "OWNER_VISIBLE" || person.internal), [people, visibility]);
  const recipients = eligible.filter(p => p.participant !== false && p.id !== currentUserId);
  const recipientIds = new Set([...mentionIds, ...(notify ? selectedIds.filter(id => recipients.some(p => p.id === id)) : [])]);
  const placeholder = kind === "CALL" ? "Co bylo domluveno při telefonátu?" : kind === "EMAIL" ? "Shrnutí odeslané nebo přijaté zprávy…" : kind === "PROMISE" ? "Co nájemník slíbil a za jakých podmínek?" : "Napište komentář…";
  return <div className="task-composer-row"><UserAvatar user={{ name: currentUserName }} size="sm"/><form className="thread-composer-v211" action={`/api/tasks/${taskId}/entries`} method="post" encType="multipart/form-data" onSubmit={() => setSubmitting(true)}>
    <div className="composer-top">{showKinds ? <div className="composer-tabs" role="group" aria-label="Typ záznamu">{options.filter(([value]) => allowPromise || value !== "PROMISE").map(([value,label]) => <button key={value} className={kind===value?"active":""} type="button" onClick={()=>setKind(value)}>{label}</button>)}</div> : <span className="composer-title">Nový komentář</span>}
    <label className="composer-visibility"><LockKeyhole size={17} aria-hidden="true"/><select name="visibility" value={visibility} onChange={event => setVisibility(event.target.value)} aria-label="Viditelnost záznamu"><option value="INTERNAL">Interní</option><option value="OWNER_VISIBLE">Viditelné vlastníkovi</option></select></label></div>
    <input type="hidden" name="kind" value={showKinds ? kind : "COMMENT"}/>
    {kind === "PROMISE" && allowPromise && <div className="promise-fields"><label className="field"><span>Přislíbené datum</span><input name="promiseDate" type="date" required/></label><label className="field"><span>Přislíbená částka Kč</span><input name="promiseAmount" type="number" step="0.01" min="0.01"/></label></div>}
    <TaskMentionEditor people={eligible} placeholder={placeholder} taskId={taskId} currentUserId={currentUserId} onRecipientsChange={setMentionIds} tools={<>{allowFiles && <button type="button" onClick={() => fileInput.current?.click()}><Paperclip size={20} aria-hidden="true"/>Přiložit</button>}<button type="button" aria-expanded={notify} onClick={() => setNotify(!notify)}><Bell size={19} aria-hidden="true"/>Upozornit</button></>}/>
    {notify && <fieldset className="notification-recipients"><legend>Upozornit e-mailem další účastníky</legend>{recipients.map(person => <label className="checkbox-field" key={person.id}><input type="checkbox" name="notificationRecipientIds" value={person.id} checked={selectedIds.includes(person.id)} onChange={e => setSelectedIds(ids => e.target.checked ? [...ids, person.id] : ids.filter(id => id !== person.id))}/><span>{person.name}</span></label>)}</fieldset>}
    {allowFiles && <input ref={fileInput} name="files" type="file" multiple hidden aria-label="Přiložit fotografie nebo soubory" onChange={e => setFiles(Array.from(e.target.files || []).map(file => file.name))}/>}
    {files.length > 0 && <div className="composer-files">{files.map((name, index) => <span key={index}><Paperclip size={15}/>{name}</span>)}<button type="button" onClick={() => { if (fileInput.current) fileInput.current.value = ""; setFiles([]); }}>Odebrat přílohy</button></div>}
    <div className="composer-actions"><small aria-live="polite">{recipientIds.size > 0 ? <><Users size={19} aria-hidden="true"/>Adresně upozornit: {recipientIds.size} {recipientIds.size === 1 ? "osobu" : recipientIds.size < 5 ? "osoby" : "osob"}</> : visibility === "INTERNAL" ? "Interní · Vidí pouze oprávnění účastníci" : "Záznam a přílohy uvidí i oprávnění vlastníci"}</small><button className="primary" type="submit" disabled={submitting}>{submitting ? "Ukládám…" : "Odeslat"}</button></div>
  </form></div>;
}
