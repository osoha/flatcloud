"use client";

import { useEffect, useRef, useState } from "react";

type Person = { id: string; name: string; email: string | null; phone: string | null };
type Row = { id: number; profileId: string; name: string; email: string; phone: string };
export function LeaseOccupantFields({ people = [] }: { people?: Person[] }) {
  const ref = useRef<HTMLFieldSetElement>(null);
  const nextId = useRef(0);
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    const restore = (event: Event) => {
      const { form, draft } = (event as CustomEvent<{ form: HTMLFormElement; draft: Record<string, string | boolean> }>).detail;
      if (ref.current?.form !== form) return;
      const ids = Object.keys(draft).flatMap(key => /^occupantName:(\d+)$/.exec(key)?.slice(1).map(Number) || []);
      setRows(ids.map(id => ({ id, profileId: String(draft[`occupantProfile:${id}`] || ""), name: String(draft[`occupantName:${id}`] || ""), email: String(draft[`occupantEmail:${id}`] || ""), phone: String(draft[`occupantPhone:${id}`] || "") })));
      nextId.current = ids.length ? Math.max(...ids) + 1 : 0;
    };
    window.addEventListener("flatberry:restore-form-draft", restore);
    return () => window.removeEventListener("flatberry:restore-form-draft", restore);
  }, []);
  function update(id: number, patch: Partial<Row>) { setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row)); }
  return <fieldset ref={ref} className="field field-full lease-occupant-fields"><legend>Další obyvatelé jednotky</legend>
    <p>Osoby, které zde bydlí bez smluvní odpovědnosti. Hlavního nájemníka zde není třeba přidávat.</p>
    {rows.map(row => <div className="lease-occupant-row" key={row.id}>
      {!!people.length && <label className="field"><span>Vybrat existující osobu</span><select name={`occupantProfile:${row.id}`} value={row.profileId} onChange={event => {
        const person = people.find(person => person.id === event.target.value);
        update(row.id, { profileId: person?.id || "", name: person?.name || "", email: person?.email || "", phone: person?.phone || "" });
      }}><option value="">Nový obyvatel</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
      <label className="field"><span>Jméno obyvatele *</span><input name={`occupantName:${row.id}`} value={row.name} onChange={event => update(row.id, { name: event.target.value })} required maxLength={200}/></label>
      <label className="field"><span>E-mail obyvatele</span><input name={`occupantEmail:${row.id}`} type="email" value={row.email} onChange={event => update(row.id, { email: event.target.value })}/></label>
      <label className="field"><span>Telefon obyvatele</span><input name={`occupantPhone:${row.id}`} value={row.phone} onChange={event => update(row.id, { phone: event.target.value })}/></label>
      <button type="button" className="secondary" onClick={() => setRows(current => current.filter(item => item.id !== row.id))}>Odebrat obyvatele</button>
    </div>)}
    <button type="button" className="secondary" disabled={rows.length >= 20} onClick={() => { const id = nextId.current++; setRows(current => [...current, { id, profileId: "", name: "", email: "", phone: "" }]); }}>Přidat obyvatele</button>
  </fieldset>;
}
