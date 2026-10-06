import { createHash } from "node:crypto";
export const actionKinds = [
  "SIGN",
  "RECEIVE",
  "READ",
  "APPROVE",
  "NON_RENEWAL",
] as const;
export type ActionKind = (typeof actionKinds)[number];
export const actionLabels: Record<ActionKind, string> = {
  SIGN: "Podepsat dokument",
  RECEIVE: "Potvrdit převzetí",
  READ: "Potvrdit přečtení",
  APPROVE: "Schválit splnění úkolu",
  NON_RENEWAL: "Potvrdit převzetí a přečtení",
};
export const actionMeanings: Record<ActionKind, string> = {
  SIGN: "Podpisem vyjadřuji souhlas s přesným zněním tohoto dokumentu.",
  RECEIVE:
    "Potvrzuji převzetí dokumentu. Potvrzení není souhlasem s jeho obsahem a neomezuje možnost podat námitky.",
  READ: "Potvrzuji, že jsem se seznámil/a s tímto sdělením.",
  APPROVE: "Potvrzuji splnění úkolu v rozsahu uvedeném v tomto sdělení.",
  NON_RENEWAL:
    "Potvrzuji převzetí a přečtení oznámení. Nepotvrzuji tím souhlas s ukončením ani se nevzdávám svých práv.",
};
export const hashContent = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export function actionKind(value: string): ActionKind {
  if (!actionKinds.includes(value as ActionKind))
    throw new Error("Neplatný druh potvrzení.");
  return value as ActionKind;
}
export function nonRenewalText(input: {
  landlord: string;
  tenantNames: string[];
  address: string;
  endDate: string;
  handover: string;
}) {
  return `Pronajímatel: ${input.landlord}\nNájemci: ${input.tenantNames.join(", ")}\nByt: ${input.address}\n\nNájem sjednaný na dobu určitou končí dne ${input.endDate}. Pronajímatel nenabízí jeho prodloužení ani uzavření navazující smlouvy. Oznámení nájem nezkracuje. Prosíme o dohodu na vyklizení a odevzdání bytu, předání klíčů a závěrečných odečtech.\n\nPředání: ${input.handover}\n\nPotvrzení převzetí a přečtení není souhlasem s ukončením. Toto oznámení nenahrazuje případnou písemnou výzvu k odevzdání bytu po skončení nájmu.`;
}
export function packetStatus(packet: {
  cancelledAt: Date | null;
  kind: string;
  recipients: Array<{ completedAt: Date | null }>;
}) {
  if (packet.cancelledAt) return "Zrušeno";
  const done = packet.recipients.filter((r) => r.completedAt).length;
  return done === packet.recipients.length
    ? packet.kind === "SIGN"
      ? "Podepsáno všemi"
      : "Potvrzeno všemi"
    : `Čeká na ${packet.kind === "SIGN" ? "podpis" : "potvrzení"} (${done}/${packet.recipients.length})`;
}
