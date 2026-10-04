import { parseCzkToCents, text } from "./forms";

export const serviceCategories = ["SERVICES", "WATER", "HEATING", "ELECTRICITY"] as const;
export type ServiceCategory = typeof serviceCategories[number];
export type ServiceItemInput = { name: string; category: ServiceCategory; amountCents: number };

export function leaseServiceItemsFromForm(form: FormData): ServiceItemInput[] {
  if (text(form, "servicesMode") !== "ITEMIZED") {
    const raw = text(form, "services");
    const amountCents = raw ? parseCzkToCents(raw) : 0;
    if (amountCents < 0 || amountCents > 2147483647) throw new Error("Zálohy na služby musí být platná nezáporná částka.");
    return amountCents ? [{ name: "Zálohy na služby", category: "SERVICES", amountCents }] : [];
  }
  const rows = [...new Set([...form.keys()].map(key => /^serviceName:(\d+)$/.exec(key)?.[1]).filter((id): id is string => Boolean(id)))];
  if (!rows.length || rows.length > 30) throw new Error("Rozepište alespoň jednu službu, nejvýše 30 položek.");
  const items = rows.map(id => {
    const name = text(form, `serviceName:${id}`, true)!;
    const category = text(form, `serviceCategory:${id}`) as ServiceCategory;
    const amountCents = parseCzkToCents(text(form, `serviceAmount:${id}`, true)!);
    if (name.length > 120 || !serviceCategories.includes(category) || amountCents <= 0 || amountCents > 2147483647) throw new Error("Každá služba musí mít název, kategorii a kladnou částku.");
    return { name, category, amountCents };
  });
  if (items.reduce((sum, item) => sum + item.amountCents, 0) > 2147483647) throw new Error("Součet záloh je příliš vysoký.");
  return items;
}
