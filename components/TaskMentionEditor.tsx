"use client";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { AtSign, Smile } from "lucide-react";
import type { DiscussionPerson, Mention } from "@/lib/task-discussion-shared";
import { updateMentionRanges, withGroupMentions, mentionRecipientIds, taskReactions } from "@/lib/task-discussion-shared";

export function TaskMentionEditor({ people, placeholder, currentUserId, taskId, onRecipientsChange, tools }: { people: DiscussionPerson[]; placeholder: string; currentUserId?: string; taskId: string; onRecipientsChange: (ids: string[]) => void; tools?: ReactNode }) {
  const inputId = useId(), listId = `${inputId}-options`;
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState(false), [emojiOpen, setEmojiOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const match = /(?:^|\s)@([^@\n]{0,60})$/.exec(body.slice(0, cursor));
  const query = match?.[1].toLocaleLowerCase("cs") || "";
  const start = match ? cursor - query.length - 1 : -1;
  const participants = people.filter(p => p.participant !== false);
  const suggestions = [
    ...["all", "board"].filter(label => label.startsWith(query)).map(label => ({ id: `group:${label}`, name: label, detail: `Všichni účastníci úkolu · ${participants.filter(p => p.id !== currentUserId).length} osob`, group: true })),
    ...participants.filter(p => `${p.name} ${p.email}`.toLocaleLowerCase("cs").includes(query)).map(p => ({ ...p, detail: p.email, group: false })),
  ].slice(0, 8);
  const visible = open && Boolean(match) && suggestions.length > 0;
  const resolved = useMemo(() => { try { return withGroupMentions(body, mentions); } catch { return mentions; } }, [body, mentions]);
  const recipientKey = mentionRecipientIds(resolved, people).filter(id => id !== currentUserId).sort().join(",");
  useEffect(() => { onRecipientsChange(recipientKey ? recipientKey.split(",") : []); }, [recipientKey, onRecipientsChange]);
  useEffect(() => { setMentions(items => items.filter(item => people.some(p => p.id === item.userId && p.participant !== false))); }, [people]);
  function focusAt(position: number) { setCursor(position); requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(position, position); }); }
  function insert(text: string) {
    const position = input.current?.selectionStart ?? body.length, end = input.current?.selectionEnd ?? position;
    const next = body.slice(0, position) + text + body.slice(end);
    setMentions(updateMentionRanges(body, next, mentions)); setBody(next); focusAt(position + text.length);
  }
  useEffect(() => {
    function reply(event: Event) {
      const detail = (event as CustomEvent<{ taskId: string; userId: string }>).detail;
      if (detail.taskId !== taskId) return;
      const person = people.find(p => p.id === detail.userId && p.participant !== false);
      if (!person || person.id === currentUserId) { focusAt(body.length); return; }
      const prefix = body && !/\s$/.test(body) ? " " : "", token = `@${person.name}`;
      const start = body.length + prefix.length, next = `${body}${prefix}${token} `;
      setBody(next); setMentions([...mentions, { userId: person.id, label: person.name, start, end: start + token.length }]); focusAt(next.length);
    }
    window.addEventListener("flatberry:task-reply", reply);
    return () => window.removeEventListener("flatberry:task-reply", reply);
  }, [body, mentions, people, taskId, currentUserId]);
  function choose(person: (typeof suggestions)[number]) {
    if (start < 0) return;
    const token = `@${person.name}`, next = body.slice(0, start) + token + " " + body.slice(cursor);
    const shifted = updateMentionRanges(body, next, mentions.filter(m => m.end <= start || m.start >= cursor));
    setMentions(person.group ? shifted : [...shifted, { userId: person.id, label: person.name, start, end: start + token.length }].sort((a,b) => a.start - b.start));
    setBody(next); setOpen(false); focusAt(start + token.length + 1);
  }
  return <div className="mention-editor">
    <input type="hidden" name="mentions" value={JSON.stringify(mentions)}/>
    <div className="field composer-body"><label className="sr-only" htmlFor={inputId}>Nový komentář</label><textarea id={inputId} ref={input} name="body" rows={3} maxLength={50000} required value={body} placeholder={placeholder} aria-autocomplete="list" aria-controls={visible ? listId : undefined} aria-expanded={visible} aria-activedescendant={visible ? `${listId}-${Math.min(selected, suggestions.length - 1)}` : undefined}
      onChange={event => { const next = event.target.value; setMentions(updateMentionRanges(body, next, mentions)); setBody(next); setCursor(event.target.selectionStart); setOpen(true); setSelected(0); }}
      onClick={event => { setCursor(event.currentTarget.selectionStart); setOpen(true); setSelected(0); }}
      onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) setCursor(event.currentTarget.selectionStart); }}
      onBlur={() => setOpen(false)}
      onKeyDown={event => {
        if (!visible) return;
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSelected(index => (index + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length); }
        if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); choose(suggestions[Math.min(selected, suggestions.length - 1)]); }
      }}/></div>
    {visible && <div className="mention-options" id={listId} role="listbox" aria-label="Účastníci k označení">{suggestions.map((person,index) => <button type="button" role="option" aria-selected={selected === index} id={`${listId}-${index}`} key={person.id} onMouseDown={event => event.preventDefault()} onClick={() => choose(person)}><strong>{person.group ? "@" : ""}{person.name}</strong><small>{person.detail}</small></button>)}</div>}
    <div className="composer-toolbar">{tools}<button type="button" onClick={() => { insert(`${cursor && !/\s/.test(body[cursor - 1]) ? " " : ""}@`); setOpen(true); setSelected(0); }}><AtSign size={20} aria-hidden="true"/>Zmínit</button><div className="composer-emoji"><button type="button" aria-expanded={emojiOpen} onClick={() => setEmojiOpen(!emojiOpen)}><Smile size={20} aria-hidden="true"/>Emoji</button>{emojiOpen && <div className="reaction-picker" role="group" aria-label="Vložit emoji" onKeyDown={e => { if (e.key === "Escape") setEmojiOpen(false); }}>{taskReactions.map(item => <button key={item.key} type="button" aria-label={item.label} onClick={() => { insert(item.emoji); setEmojiOpen(false); }}>{item.emoji}</button>)}</div>}</div></div>
  </div>;
}
