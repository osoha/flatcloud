"use client";
import { useEffect, useRef, useState } from "react";
import type { DiscussionPerson, Mention } from "@/lib/task-discussion-shared";
import { updateMentionRanges } from "@/lib/task-discussion-shared";

export function TaskMentionEditor({ people, placeholder }: { people: DiscussionPerson[]; placeholder: string }) {
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const before = body.slice(0, cursor);
  const match = /(?:^|\s)@([^@\n]{0,60})$/.exec(before);
  const query = match?.[1].toLocaleLowerCase("cs") || "";
  const start = match ? cursor - query.length - 1 : -1;
  const suggestions = people.filter(p => `${p.name} ${p.email}`.toLocaleLowerCase("cs").includes(query)).slice(0, 8);
  const visible = open && Boolean(match) && suggestions.length > 0;
  useEffect(() => { setMentions(items => items.filter(item => people.some(p => p.id === item.userId))); }, [people]);
  function choose(person: DiscussionPerson) {
    if (start < 0) return;
    const token = `@${person.name}`;
    const next = body.slice(0, start) + token + " " + body.slice(cursor);
    const shifted = updateMentionRanges(body, next, mentions);
    setMentions([...shifted, { userId: person.id, label: person.name, start, end: start + token.length }].sort((a,b) => a.start - b.start));
    setBody(next); setOpen(false);
    const position = start + token.length + 1;
    setCursor(position);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(position, position); });
  }
  return <div className="mention-editor">
    <input type="hidden" name="mentions" value={JSON.stringify(mentions)}/>
    <label className="field composer-body"><span>Nový záznam</span><textarea ref={input} name="body" rows={4} required value={body} placeholder={placeholder} aria-autocomplete="list" aria-controls={visible ? "task-mention-options" : undefined} aria-expanded={visible} aria-activedescendant={visible ? `mention-option-${Math.min(selected, suggestions.length - 1)}` : undefined}
      onChange={event => { const next = event.target.value; setMentions(updateMentionRanges(body, next, mentions)); setBody(next); setCursor(event.target.selectionStart); setOpen(true); setSelected(0); }}
      onClick={event => { setCursor(event.currentTarget.selectionStart); setOpen(true); setSelected(0); }}
      onBlur={() => setOpen(false)}
      onKeyDown={event => {
        if (!visible) return;
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSelected(index => (index + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length); }
        if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); choose(suggestions[Math.min(selected, suggestions.length - 1)]); }
      }}/></label>
    {visible && <div className="mention-options" id="task-mention-options" role="listbox" aria-label="Účastníci k označení">{suggestions.map((person,index) => <button type="button" role="option" aria-selected={selected === index} id={`mention-option-${index}`} key={person.id} onMouseDown={event => event.preventDefault()} onClick={() => choose(person)}><strong>{person.name}</strong><small>{person.email}</small></button>)}</div>}
    <small>Napište @ a vyberte účastníka. Zmínka upozorní podle jeho nastavení e-mailů.</small>
    {mentions.length > 0 && <div className="mention-selection" aria-label="Označení účastníci">{[...new Set(mentions.map(m => m.userId))].map(id => <span key={id}>@{mentions.find(m => m.userId === id)?.label}<button type="button" aria-label={`Zrušit označení ${mentions.find(m => m.userId === id)?.label}`} onClick={() => setMentions(items => items.filter(m => m.userId !== id))}>×</button></span>)}</div>}
  </div>;
}
