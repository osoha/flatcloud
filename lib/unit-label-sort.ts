const unitCollator = new Intl.Collator("cs", { numeric: true, sensitivity: "base" });

/** Human ordering for labels such as 1, 2, 10 and Byt 1, Byt 2, Byt 10. */
export function compareUnitLabels(a: { label: string; id: string }, b: { label: string; id: string }) {
  return unitCollator.compare(a.label, b.label)
    || a.label.localeCompare(b.label, "cs")
    || a.id.localeCompare(b.id);
}
