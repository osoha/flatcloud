"use client";
import { useEffect, useRef, useState } from "react";

export function ValuationPricePrefill({ prices, fixedUnitId }: { prices: Record<string, string>; fixedUnitId?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [unitId, setUnitId] = useState(fixedUnitId || "");
  const price = prices[unitId] || "";
  useEffect(() => {
    const form = root.current?.closest("form");
    const select = form?.querySelector<HTMLSelectElement>('select[name="unitId"]');
    if (!select) return;
    const sync = () => setUnitId(select.value);
    sync(); select.addEventListener("change", sync); return () => select.removeEventListener("change", sync);
  }, []);
  const apply = () => {
    if (!price) return;
    const input = root.current?.closest("form")?.querySelector<HTMLInputElement>('input[name="askingPrice"]');
    if (input) input.value = price;
  };
  useEffect(() => {
    const input = root.current?.closest("form")?.querySelector<HTMLInputElement>('input[name="askingPrice"]');
    if (price && input && !input.value) input.value = price;
  }, [price]);
  return <div className="valuation-price-prefill" ref={root}>{price ? <><span>Aktuální valuace: {Number(price).toLocaleString("cs-CZ")} Kč</span><button type="button" className="table-link" onClick={apply}>Použít jako nabídkovou cenu</button></> : <span>Pro jednotku není dostupná aktuální valuace.</span>}</div>;
}
