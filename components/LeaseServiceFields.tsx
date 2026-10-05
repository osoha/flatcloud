"use client";

import { useEffect, useRef, useState } from "react";
import { parseCzkToCents } from "@/lib/forms";

export function LeaseServiceFields() {
  const ref = useRef<HTMLFieldSetElement>(null);
  const [mode, setMode] = useState("TOTAL");
  const [rows, setRows] = useState([0]);
  const nextId = useRef(1);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  useEffect(() => {
    const restore = (event: Event) => {
      const { form, draft } = (event as CustomEvent<{ form: HTMLFormElement; draft: Record<string, string | boolean> }>).detail;
      if (ref.current?.form !== form) return;
      setMode(draft.servicesMode === "ITEMIZED" ? "ITEMIZED" : "TOTAL");
      const ids = Object.keys(draft).flatMap(key => /^serviceName:(\d+)$/.exec(key)?.slice(1).map(Number) || []);
      if (ids.length) { setRows(ids); nextId.current = Math.max(...ids) + 1; }
      setAmounts(Object.fromEntries(ids.map(id => [id, String(draft[`serviceAmount:${id}`] || "")])));
    };
    window.addEventListener("flatberry:restore-form-draft", restore);
    return () => window.removeEventListener("flatberry:restore-form-draft", restore);
  }, []);
  const total = rows.reduce((sum, id) => { try { return sum + parseCzkToCents(amounts[id] || "0"); } catch { return sum; } }, 0);
  return <fieldset ref={ref} className="field field-full lease-service-fields"><legend>Zálohy na služby</legend>
    <label className="field"><span>Zadání záloh</span><select name="servicesMode" value={mode} onChange={event => setMode(event.target.value)}><option value="TOTAL">Celková částka</option><option value="ITEMIZED">Rozpis jednotlivých služeb</option></select></label>
    {mode === "TOTAL" ? <label className="field"><span>Zálohy na služby Kč / měsíc</span><input name="services" type="number" min="0" step="0.01"/></label> : <>
      {rows.map(id => <div key={id} className="lease-service-row">
        <label className="field"><span>Název služby</span><input name={`serviceName:${id}`} maxLength={120} required placeholder="např. Studená voda"/></label>
        <label className="field"><span>Druh služby</span><select name={`serviceCategory:${id}`}><option value="SERVICES">Ostatní služby</option><option value="WATER">Voda</option><option value="HEATING">Teplo</option><option value="ELECTRICITY">Elektřina</option></select></label>
        <label className="field"><span>Záloha Kč / měsíc</span><input name={`serviceAmount:${id}`} type="number" min="0.01" step="0.01" required value={amounts[id] || ""} onChange={event => setAmounts(current => ({ ...current, [id]: event.target.value }))}/></label>
        <button type="button" className="secondary" disabled={rows.length === 1} onClick={() => setRows(current => current.filter(row => row !== id))}>Odebrat službu</button>
      </div>)}
      <button type="button" className="secondary" disabled={rows.length >= 30} onClick={() => { const id = nextId.current++; setRows(current => [...current, id]); }}>Přidat službu</button>
      <p><strong>Celkem zálohy: {(total / 100).toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} Kč / měsíc</strong></p>
      <small>Do předpisů a vyúčtování se uloží jednotlivé položky. Souhrnná záloha se k rozpisu nepřičítá.</small>
    </>}
  </fieldset>;
}
