export function text(form: FormData, key: string, required = false) {
  const value = String(form.get(key) ?? "").trim();
  if (required && !value) throw new Error(`Pole ${key} je povinné.`);
  return value || null;
}

export function intValue(form: FormData, key: string, fallback = 0) {
  const raw = String(form.get(key) ?? "").trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) throw new Error(`Neplatné číslo v poli ${key}.`);
  return value;
}

export function floatValue(form: FormData, key: string) {
  const raw = String(form.get(key) ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Neplatné číslo v poli ${key}.`);
  return value;
}

export function moneyToCents(form: FormData, key: string, fallback = 0) {
  const raw = String(form.get(key) ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Neplatná částka v poli ${key}.`);
  return Math.round(value * 100);
}

export function boolValue(form: FormData, key: string) {
  const raw = String(form.get(key) ?? "").toLowerCase();
  return raw === "on" || raw === "true" || raw === "1";
}

export function dateValue(form: FormData, key: string, required = false) {
  const raw = String(form.get(key) ?? "").trim();
  if (!raw) {
    if (required) throw new Error(`Datum ${key} je povinné.`);
    return null;
  }
  const date = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Neplatné datum v poli ${key}.`);
  return date;
}

export function stringArray(form: FormData, key: string) {
  const raw = String(form.get(key) ?? "").trim();
  if (!raw) return [];
  return raw.split(/[\n,;]+/).map((part) => part.trim()).filter(Boolean);
}

export function moneyInput(cents: number | null | undefined) {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function dateInput(value: Date | string | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}
