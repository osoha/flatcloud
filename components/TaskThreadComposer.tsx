"use client";

import { useMemo, useState } from "react";

import { TaskMentionEditor } from "./TaskMentionEditor";
import type { DiscussionPerson } from "@/lib/task-discussion-shared";

const options = [
  ["COMMENT", "Poznámka"],
  ["CALL", "Telefonát"],
  ["EMAIL", "E-mail / zpráva"],
  ["PROMISE", "Příslib úhrady"],
] as const;

export function TaskThreadComposer({ taskId, collection = false, allowPromise = true, allowFiles = true, people = [], currentUserId }: { taskId: string; collection?: boolean; allowPromise?: boolean; allowFiles?: boolean; people?: DiscussionPerson[]; currentUserId?: string }) {
  const [kind, setKind] = useState<(typeof options)[number][0]>(collection ? "CALL" : "COMMENT");
  const [submitting, setSubmitting] = useState(false);
  const [visibility, setVisibility] = useState("INTERNAL");
  const [notify, setNotify] = useState(false);
  const eligible = useMemo(() => people.filter(person => visibility === "OWNER_VISIBLE" || person.internal), [people, visibility]);
  const placeholder = kind === "CALL" ? "Co bylo domluveno při telefonátu?" : kind === "EMAIL" ? "Shrnutí odeslané nebo přijaté zprávy…" : kind === "PROMISE" ? "Co nájemník slíbil a za jakých podmínek?" : "Napište nový záznam do případu…";
  return <form className="thread-composer-v211" action={`/api/tasks/${taskId}/entries`} method="post" encType="multipart/form-data" onSubmit={() => setSubmitting(true)}>
    <div className="composer-tabs" role="group" aria-label="Typ záznamu">{options.filter(([value]) => allowPromise || value !== "PROMISE").map(([value,label]) => <button key={value} className={kind===value?"active":""} type="button" onClick={()=>setKind(value)}>{label}</button>)}</div>
    <input type="hidden" name="kind" value={kind}/>
    <label className="field"><span>Viditelnost záznamu</span><select name="visibility" value={visibility} onChange={event => setVisibility(event.target.value)} aria-label="Viditelnost záznamu"><option value="INTERNAL">Interní</option><option value="OWNER_VISIBLE">Viditelné vlastníkovi</option></select></label>
    {kind === "PROMISE" && <div className="promise-fields"><label className="field"><span>Přislíbené datum</span><input name="promiseDate" type="date" required/></label><label className="field"><span>Přislíbená částka Kč</span><input name="promiseAmount" type="number" step="0.01" min="0.01"/></label></div>}
    <TaskMentionEditor people={eligible} placeholder={placeholder}/>
    <label className="checkbox-field"><input type="checkbox" checked={notify} onChange={event => setNotify(event.target.checked)}/><span>Upozornit e-mailem další účastníky</span></label>
    {notify && <fieldset className="notification-recipients"><legend>Vyberte příjemce</legend>{eligible.filter(p => p.id !== currentUserId).map(person => <label className="checkbox-field" key={person.id}><input type="checkbox" name="notificationRecipientIds" value={person.id}/><span>{person.name}</span></label>)}<small>Odeslání respektuje nastavení každého příjemce. Zmíněné osoby se upozorní i bez opakovaného výběru.</small></fieldset>}
    {allowFiles?<label className="field"><span>Přiložit fotografie nebo soubory</span><input name="files" type="file" multiple/></label>:null}
    <div className="composer-actions"><small>Interní záznam a jeho přílohy uvidí jen uživatelé s právem editace tohoto případu. Viditelnost vlastníkovi zvolte výslovně.</small><button className="primary" type="submit" disabled={submitting}>{submitting ? "Ukládám…" : "Přidat do vlákna"}</button></div>
  </form>;
}
