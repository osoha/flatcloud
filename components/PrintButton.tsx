"use client";

export function PrintButton({ label = "Vytisknout / uložit PDF" }: { label?: string }) {
  return <button className="secondary print-action" type="button" onClick={() => window.print()}>{label}</button>;
}
