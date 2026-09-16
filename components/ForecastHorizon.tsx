"use client";
import { useState } from "react";
export function ForecastHorizon({ months, params }: { months: number; params: Record<string, string> }) {
  const [unit, setUnit] = useState(months % 12 === 0 ? "years" : "months");
  const [value, setValue] = useState(String(months % 12 === 0 ? months / 12 : months));
  return <details className="forecast-custom-horizon"><summary>{[12, 24, 36].includes(months) ? "Vlastní" : months % 12 === 0 ? `${months / 12} let` : `${months} m`}</summary>
    <form action="/reporty" method="get" className="form-grid">
      {Object.entries(params).map(([key, val]) => <input key={key} type="hidden" name={key} value={val}/>)}
      <input type="hidden" name="horizon" value={Number(value) * (unit === "years" ? 12 : 1)}/>
      <label className="field"><span>Délka období</span><input aria-label="Délka období" type="number" min="1" max={unit === "years" ? 30 : 360} step="1" required value={value} onChange={event => setValue(event.target.value)}/></label>
      <label className="field"><span>Jednotka období</span><select aria-label="Jednotka období" value={unit} onChange={event => { const next = event.target.value; setValue(String(next === "years" ? Math.max(1, Math.round(Number(value) / 12)) : Number(value) * 12)); setUnit(next); }}><option value="years">Roky</option><option value="months">Měsíce</option></select></label>
      <button type="submit" className="secondary">Použít období</button>
    </form>
  </details>;
}
