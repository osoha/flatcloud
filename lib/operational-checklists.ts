/** Manual starting points. They do not change any operational records. */
export const operationalChecklists = {
  HANDOVER: { label: "Převzetí / předání bytu", category: "LEASE", requiresUnit: true, items: [
    "Potvrdit datum, účastníky a stav předávané jednotky.",
    "Zapsat předávací odečty všech relevantních měřidel.",
    "Zkontrolovat klíče, vybavení a pořídit fotodokumentaci.",
    "Uložit podepsaný předávací protokol k jednotce.",
    "Zkontrolovat návaznost nájmu, záloh a energií.",
  ] },
  TENANT_CHANGE: { label: "Změna nájemníka", category: "LEASE", requiresUnit: true, items: [
    "Ověřit ukončení předchozího nájmu a termín nového.",
    "Provést předávací odečty a zdokumentovat stav bytu.",
    "Zkontrolovat vypořádání předchozího nájemníka a kauce.",
    "Zkontrolovat smlouvu, předpisy a zálohy nového nájemníka.",
    "Ověřit přepis energií, klíče a předávací protokol.",
  ] },
  LEASE_END: { label: "Ukončení nájmu", category: "LEASE", requiresUnit: true, items: [
    "Ověřit datum a důvod ukončení podle smlouvy.",
    "Zkontrolovat poslední předpisy, platby a dluhy.",
    "Zapsat konečné odečty a připravit vyúčtování služeb.",
    "Převzít byt, klíče a uložit předávací protokol.",
    "Vypořádat kauci, škody a další otevřené závazky.",
  ] },
  METER_READINGS: { label: "Odečty měřidel", category: "MAINTENANCE", requiresUnit: true, items: [
    "Ověřit všechna relevantní měřidla a datum odečtu.",
    "Zapsat hodnotu, jednotku a způsob odečtu u každého měřidla.",
    "Přiložit fotografii nebo protokol k příslušnému záznamu.",
    "Vyjasnit chybějící, záporné či neobvyklé rozdíly.",
    "Potvrdit návaznost odečtů na vyúčtovací období.",
  ] },
  DOCUMENTS: { label: "Kontrola dokumentů", category: "GENERAL", requiresUnit: false, items: [
    "Vymezit požadované dokumenty a jejich vlastníka.",
    "Ověřit platnost, úplnost a poslední schválenou verzi.",
    "Uložit dokumenty ke správnému domu, jednotce nebo smlouvě.",
    "Zkontrolovat přístupová práva a případné osobní údaje.",
    "Zapsat chybějící podklady a termín jejich doplnění.",
  ] },
} as const;
export type OperationalChecklistCode = keyof typeof operationalChecklists;
export function operationalChecklist(code: string) {
  return Object.prototype.hasOwnProperty.call(operationalChecklists,code)
    ? operationalChecklists[code as OperationalChecklistCode] : null;
}
