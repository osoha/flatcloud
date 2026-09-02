export const PROPERTY_CODE_MIN = 1001;
export const PROPERTY_CODE_MAX = 9999;
export const UNIT_CODE_MIN = 1;
export const UNIT_CODE_MAX = 999;

export function isPropertyCode(value: string): boolean {
  return /^[1-9]\d{3}$/.test(value) && Number(value) >= PROPERTY_CODE_MIN && Number(value) <= PROPERTY_CODE_MAX;
}

export function isUnitCode(value: string): boolean {
  return /^\d{3}$/.test(value) && Number(value) >= UNIT_CODE_MIN && Number(value) <= UNIT_CODE_MAX;
}

export function formatPropertyBusinessId(propertyCode: string) {
  if (!isPropertyCode(propertyCode)) throw new Error("Neplatný kód nemovitosti.");
  return `P${propertyCode}`;
}

export function formatUnitBusinessId(unitCode: string) {
  if (!isUnitCode(unitCode)) throw new Error("Neplatný kód jednotky.");
  return `U${unitCode}`;
}

export function formatCompoundUnitBusinessId(propertyCode: string, unitCode: string) {
  return `${formatPropertyBusinessId(propertyCode)}-${formatUnitBusinessId(unitCode)}`;
}

// Kept behavior-compatible with the existing VS parser, which remains untouched.
export function unitNumberFromLabel(label: string) {
  const explicit = label.match(/(?:byt|bj|jednotka|č\.?)[^\d]{0,8}(\d+)/i)?.[1];
  if (explicit) return explicit;
  const matches = label.match(/\d+/g);
  return matches?.at(-1) || "";
}

export function unitCodeCandidateFromLabel(label: string) {
  const parsed = Number(unitNumberFromLabel(label));
  return Number.isInteger(parsed) && parsed >= UNIT_CODE_MIN && parsed <= UNIT_CODE_MAX ? String(parsed).padStart(3, "0") : null;
}
