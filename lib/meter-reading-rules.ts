import { businessDateKey, businessDateKeyToInstant, businessTodayKey, type BusinessDateKey } from './calendar';

export const readingMethods = { PERSONAL: 'Osobní odečet', REMOTE: 'Dálkový odečet', ESTIMATE: 'Odhad', LEGACY: 'Historický záznam – způsob nezjištěn' };
export type Reading = { id: string; readAt: Date; value: number; correctsId?: string | null; method?: string; unitOfMeasure?: string | null };
export function currentReadings<T extends Reading>(readings: T[]): T[] {
  const replaced = new Set(readings.flatMap(r => r.correctsId ? [r.correctsId] : []));
  return readings.filter(r => !replaced.has(r.id)).sort((a,b) => a.readAt.getTime()-b.readAt.getTime() || a.id.localeCompare(b.id));
}
export function readingDate(value: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Zadejte platné datum odečtu.');
  const date = businessDateKeyToInstant(value as BusinessDateKey);
  if (businessDateKey(date) !== value || value > businessTodayKey(now)) throw new Error('Datum odečtu musí být platné a nesmí být v budoucnosti.');
  return date;
}
export function validateReadingPosition(readings: Reading[], readAt: Date, value: number, correctsId?: string | null) {
  if (!Number.isFinite(value) || value < 0) throw new Error('Stav měřidla musí být konečné nezáporné číslo.');
  const active = currentReadings(readings);
  const original = correctsId ? active.find(r => r.id === correctsId) : null;
  if (correctsId && !original) throw new Error('Opravovat lze jen poslední verzi odečtu tohoto měřidla.');
  const day = businessDateKey(readAt);
  if (original && businessDateKey(original.readAt) !== day) throw new Error('Oprava musí zachovat datum původního odečtu.');
  const others = active.filter(r => r.id !== correctsId);
  if (others.some(r => businessDateKey(r.readAt) === day)) throw new Error('Pro tento den už existuje odečet. Použijte jeho opravu.');
  const previous = others.filter(r => businessDateKey(r.readAt) < day).at(-1);
  const next = others.find(r => businessDateKey(r.readAt) > day);
  if ((previous && previous.value > value) || (next && next.value < value)) throw new Error('Stav nenavazuje na okolní odečty. Při výměně založte nové měřidlo; neopravujte historii snížením stavu.');
}
export function meterPeriodReadings<T extends Reading>(readings: T[], from: string, to: string) {
  const active = currentReadings(readings);
  const opening = active.filter(r => businessDateKey(r.readAt) <= from).at(-1) || null;
  const closing = active.filter(r => businessDateKey(r.readAt) <= to).at(-1) || null;
  const ambiguous = active.filter(r=>businessDateKey(r.readAt)===from).length>1 || active.filter(r=>businessDateKey(r.readAt)===to).length>1;
  const exact = !ambiguous && !!opening && !!closing && businessDateKey(opening.readAt) === from && businessDateKey(closing.readAt) === to;
  const sameUnit = !opening?.unitOfMeasure || !closing?.unitOfMeasure || opening.unitOfMeasure === closing.unitOfMeasure;
  const consumption = exact && sameUnit && opening && closing && closing.readAt > opening.readAt && closing.value >= opening.value ? Math.round((closing.value-opening.value)*1e6)/1e6 : null;
  return { opening, closing, consumption };
}
