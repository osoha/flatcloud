export type FinancialPoint = { label: string; values: Array<number | null> };
export function chartDomain(values: Array<number | null>, zero: boolean) {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!valid.length) return { min: 0, max: 1 };
  const low = Math.min(...valid), high = Math.max(...valid);
  const padding = Math.max((high - low) * .12, Math.abs(high) * .03, 1);
  return { min: zero ? Math.min(0, low - (low < 0 ? padding : 0)) : low >= 0 ? Math.max(0, low - padding) : low - padding, max: Math.max(zero ? 0 : -Infinity, high) + padding };
}
export function chartPercentRows(rows: FinancialPoint[]) {
  const bases = rows[0]?.values || [];
  return rows.map(row => ({ ...row, values: row.values.map((value, index) => value == null || bases[index] == null || bases[index]! <= 0 ? null : (value / bases[index]! - 1) * 100) }));
}
export function chartTickIndices(length: number, width: number) {
  const slots = Math.max(2, Math.floor(width / 100));
  const step = Math.max(1, Math.ceil((length - 1) / (slots - 1)));
  return [...new Set(Array.from({ length }, (_, index) => index).filter(index => index % step === 0 || index === length - 1))];
}
