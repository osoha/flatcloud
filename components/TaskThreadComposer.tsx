"use client";

import { useState } from "react";

const options = [
  ["COMMENT", "Poznámka"],
  ["CALL", "Telefonát"],
  ["EMAIL", "E-mail / zpráva"],
  ["PROMISE", "Příslib úhrady"],
] as const;

export function TaskThreadComposer({ taskId, collection = false }: { taskId: string; collection?: boolean }) {
  const [kind, setKind] = useState<(typeof options)[number][0]>(collection ? "CALL" : "COMMENT");
  const placeholder = kind === "CALL" ? "Co bylo domluveno při telefonátu?" : kind === "EMAIL" ? "Shrnutí odeslané nebo přijaté zprávy…" : kind === "PROMISE" ? "Co nájemník slíbil a za jakých podmínek?" : "Napište nový záznam do případu…";
  return <form className="thread-composer-v211" action={`/api/tasks/${taskId}/entries`} method="post">
    <div className="composer-tabs" role="group" aria-label="Typ záznamu">{options.map(([value,label]) => <button key={value} className={kind===value?"active":""} type="button" onClick={()=>setKind(value)}>{label}</button>)}</div>
    <input type="hidden" name="kind" value={kind}/>
    {kind === "PROMISE" && <div className="promise-fields"><label className="field"><span>Přislíbené datum</span><input name="promiseDate" type="date" required/></label><label className="field"><span>Přislíbená částka Kč</span><input name="promiseAmount" type="number" step="0.01" min="0.01"/></label></div>}
    <label className="field composer-body"><span>Nový záznam</span><textarea name="body" rows={4} required placeholder={placeholder}/></label>
    <div className="composer-actions"><small>Záznam se ihned objeví vlastníkovi v chronologii případu.</small><button className="primary" type="submit">Přidat do vlákna</button></div>
  </form>;
}
