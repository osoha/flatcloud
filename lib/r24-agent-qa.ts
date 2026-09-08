export type R24Risk = "P0" | "P1" | "P2";

export type R24Persona = {
  id: string;
  label: string;
  applicationRole: "SUPER_ADMIN" | "MANAGER" | "PROPERTY_MANAGER" | "OWNER_VIEWER" | "EXPERT_LENS";
  access: string;
  mission: string;
  criticalChecks: string[];
};

export const R24_DATA_MARKER = "R24_AGENT_QA_2026_09";

export const R24_PERSONAS: R24Persona[] = [
  { id: "novice", label: "Uživatel novic", applicationRole: "OWNER_VIEWER", access: "Jedna jednotka · VIEW", mission: "Dokončit základní orientaci pouze podle vedení aplikace.", criticalChecks: ["další krok", "srozumitelné chyby", "slovník", "žádný cizí scope"] },
  { id: "advanced", label: "Pokročilý uživatel", applicationRole: "PROPERTY_MANAGER", access: "Jeden objekt · EDIT", mission: "Rychle zpracovat více provozních záznamů bez ztráty scope.", criticalChecks: ["hromadné operace", "filtry", "návrat", "duplicity"] },
  { id: "external-owner", label: "Externí vlastník", applicationRole: "OWNER_VIEWER", access: "Externí objekt · VIEW", mission: "Zkontrolovat vlastní finance, dokumenty a reporty bez interních nebo cizích dat.", criticalChecks: ["přímé URL", "export", "interní poznámky", "cizí portfolio"] },
  { id: "distribution-lead", label: "Šéf distribuce", applicationRole: "MANAGER", access: "Všechny objekty", mission: "Projít CRM od nabídky po postprodejní péči.", criticalChecks: ["stage gate", "historie", "jediná rezervace", "uvítací dopis"] },
  { id: "internal-assistant", label: "Interní asistentka", applicationRole: "OWNER_VIEWER", access: "Vybrané objekty · EDIT", mission: "Dohledat a bezpečně doplnit neúplná provozní data.", criticalChecks: ["globální hledání", "doklady", "bez publikace", "bez změny rolí"] },
  { id: "technical-manager", label: "Technický správce", applicationRole: "PROPERTY_MANAGER", access: "Jeden objekt · EDIT", mission: "Zpracovat závadu, úkol, revizi, důkaz a související náklad.", criticalChecks: ["priorita", "termín", "řešitel", "znovuotevření"] },
  { id: "unit-manager", label: "Správce bytových jednotek", applicationRole: "PROPERTY_MANAGER", access: "Externí objekt · EDIT", mission: "Provést nájemní a posprodejní lifecycle konkrétních jednotek.", criticalChecks: ["překryv smluv", "stav jednotky", "kauce", "předání"] },
  { id: "asset-manager", label: "Asset manager FlatCloud", applicationRole: "MANAGER", access: "Všechny objekty", mission: "Od KPI dojít ke zdroji a připravit kvartální i výroční uzávěrku.", criticalChecks: ["drill-down", "Q4 návaznost", "snapshot", "publikovaná revize"] },
  { id: "graphic-designer", label: "Senior graphic designer", applicationRole: "EXPERT_LENS", access: "Read-only audit", mission: "Prověřit vizuální konzistenci aplikace a všech PDF.", criticalChecks: ["typografie", "kontrast", "hustota", "responsive"] },
  { id: "product-developer", label: "Senior product developer", applicationRole: "EXPERT_LENS", access: "Read-only audit", mission: "Hledat slepé uličky a chybějící handoffy podle tržních best practices.", criticalChecks: ["pracovní fronty", "handoffy", "jeden zdroj pravdy", "audit"] },
  { id: "legal-controller", label: "Právník / document controller", applicationRole: "EXPERT_LENS", access: "Read-only audit", mission: "Oddělit vzor, dokument, schválení, podpis a právní účinnost.", criticalChecks: ["verze vzoru", "náhled", "schválení", "účinnost"] },
  { id: "financial-controller", label: "Účetní / financial controller", applicationRole: "EXPERT_LENS", access: "Read-only + odborné potvrzení", mission: "Prověřit měsíční a roční cut-off, doklady, úroky a opravy.", criticalChecks: ["úplnost dokladů", "cut-off", "historie korekcí", "shoda exportu"] },
  { id: "security-admin", label: "Bezpečnostní administrátor", applicationRole: "SUPER_ADMIN", access: "Audit oprávnění", mission: "Prověřit least privilege, odnětí přístupu a citlivé exporty.", criticalChecks: ["serverové odmítnutí", "aktivní relace", "audit rolí", "audit exportů"] },
  { id: "accessibility-reviewer", label: "Specialista přístupnosti", applicationRole: "EXPERT_LENS", access: "Read-only audit", mission: "Projít klávesnici, fokus, čtečku, zoom a snížený pohyb.", criticalChecks: ["WCAG 2.2 AA", "focus", "labels", "200% zoom"] },
];

export const R24_LIFECYCLES = [
  { id: "scope", risk: "P0" as R24Risk, title: "Role a record-level scope" },
  { id: "distribution", risk: "P0" as R24Risk, title: "Distribuce → nabytí → uvítací péče" },
  { id: "tenancy", risk: "P0" as R24Risk, title: "Jednotka → nájem → platby → kauce → ukončení" },
  { id: "maintenance", risk: "P0" as R24Risk, title: "Nález → úkol → realizace → důkaz → náklad" },
  { id: "reporting", risk: "P0" as R24Risk, title: "LIVE data → Q4 → výroční snapshot → publikace" },
  { id: "integrity", risk: "P0" as R24Risk, title: "Duplicity, překryvy, souběh a negativní vstupy" },
  { id: "owner-portal", risk: "P1" as R24Risk, title: "Externí vlastník a bezpečné exporty" },
  { id: "documents", risk: "P1" as R24Risk, title: "Dokumenty, verze, úložiště a řízené chyby" },
  { id: "responsive", risk: "P1" as R24Risk, title: "Desktop, mobil, zoom a klávesnice" },
  { id: "automation", risk: "P2" as R24Risk, title: "Doporučení bez autonomního právního či finančního účinku" },
];

export const R24_FINDING_FIELDS = [
  "id", "persona", "lifecycle", "severity", "status", "url", "testData", "steps",
  "expected", "actual", "evidence", "scope", "reproducibility", "recommendation", "acceptanceTest",
] as const;
