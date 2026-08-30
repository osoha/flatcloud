export const money=(cents:number)=>new Intl.NumberFormat("cs-CZ",{style:"currency",currency:"CZK",maximumFractionDigits:0}).format(cents/100);
export const date=(d:Date|string)=>new Intl.DateTimeFormat("cs-CZ").format(new Date(d));
export const dateTime=(d:Date|string)=>new Intl.DateTimeFormat("cs-CZ",{dateStyle:"short",timeStyle:"short"}).format(new Date(d));
export function phone(value: string | null | undefined) {
  const original = value?.trim() || "";
  const compact = original.replace(/\s/g, "");
  if (/^\d{9}$/.test(compact)) return `${compact.slice(0, 3)} ${compact.slice(3, 6)} ${compact.slice(6)}`;
  if (/^\+420\d{9}$/.test(compact)) return `+420 ${compact.slice(4, 7)} ${compact.slice(7, 10)} ${compact.slice(10)}`;
  return original;
}
