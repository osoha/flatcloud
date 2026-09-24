/** Versioned introduction; only describes existing features, never creates business data. */
export const GUIDE_VERSION = 1;
export const guideStepIds = ["welcome", "properties", "contracts", "finance", "tasks", "notifications", "help"] as const;
export type GuideStepId = typeof guideStepIds[number];
export type GuideStatus = "available" | "pending" | "active" | "paused" | "dismissed" | "completed";
export type GuideState = { status: GuideStatus; step: GuideStepId; version: number; revision: number };
export type GuideCapabilities = { hasProperties: boolean; canAddProperty: boolean; canAddTask: boolean };
export type GuideStep = { id: GuideStepId; href: string; target: string; fallback: string; title: string; body: string; image: string };

export function guideSteps(c: GuideCapabilities): GuideStep[] {
  return [
    { id: "welcome", href: "/portfolio", target: '[data-guide="portfolio"]', fallback: ".page-title", image: "welcome",
      title: "Vítejte ve FlatBerry",
      body: "Jsem pan správce. Za dvě minuty vám ukážu, kde co najdete. Portfolio je vaše hlavní rozcestí: inkaso, dluhy i blížící se termíny máte na jednom místě." },
    { id: "properties", href: "/portfolio", target: !c.hasProperties && c.canAddProperty ? '[data-guide="add-property"]' : '[data-guide="properties"]', fallback: '[data-guide="properties"]', image: "properties",
      title: !c.hasProperties && c.canAddProperty ? "Začněte první nemovitostí" : "Od domu ke konkrétnímu bytu",
      body: c.hasProperties ? "Z karty nemovitosti otevřete její jednotky. U každé pak najdete nájemní vztahy, platby, dokumenty i technické údaje. V přehledech vidíte jen to, k čemu máte přístup."
        : c.canAddProperty ? "Tlačítkem Přidat nemovitost založíte svůj první dům. V něm pak doplníte jednotky a smlouvy. Teď si jen projdeme aplikaci; nic nemusíte vyplňovat."
        : "Tady se objeví nemovitosti a jednotky, ke kterým vám správce přidělí přístup. Prázdný přehled je u nového účtu v pořádku." },
    { id: "contracts", href: "/smlouvy", target: '[data-guide="contracts"]', fallback: ".page-title", image: "properties",
      title: "Smlouvy a nájemníci pohromadě",
      body: "Ve Smlouvách najdete nájemní vztahy, jejich platnost a návazné předpisy. Přehled Expirace a výročí pomáhá hlídat důležité termíny. Kontakty jsou také v sekci Nájemníci." },
    { id: "finance", href: "/reporty", target: '[data-guide="finance"]', fallback: ".page-title", image: "finance",
      title: "Mějte přehled o penězích",
      body: "Reporty ukazují příjmy, dluhy a vývoj portfolia podle zvoleného období. U nemovitostí najdete také náklady. Finanční přehledy se postupně naplní z vašich evidovaných údajů." },
    { id: "tasks", href: "/ukoly", target: c.canAddTask ? '[data-guide="add-task"]' : '[data-guide="tasks"]', fallback: '[data-guide="tasks"]', image: "tasks",
      title: c.canAddTask ? "Úkoly, na které nezapomenete" : "Úkoly a týmová komunikace",
      body: c.canAddTask ? "Tady založíte nový úkol. Doplníte, co je potřeba udělat, kdo se o to postará a do kdy. V jeho diskusi pak zůstane domluva i přílohy."
        : "Tady najdete úkoly a diskuse, které s vámi tým sdílí. Nové příspěvky a termíny pomohou udržet přehled. Možnosti úprav se řídí vaším přístupem." },
    { id: "notifications", href: "/ucet", target: '[data-guide="notifications"]', fallback: ".page-title", image: "notifications",
      title: "Upozornění podle vašich potřeb",
      body: "V Mém účtu si vyberete, které e-maily z úkolů chcete dostávat. Přímé zmínky, přiřazení a termíny jsou ve výchozím stavu zapnuté. Volby můžete kdykoli změnit." },
    { id: "help", href: "/metodika?view=guides", target: '[data-guide="help"]', fallback: ".page-title", image: "methodology",
      title: "Když si nebudete jistí, jsem nablízku",
      body: "V Podpoře práce najdete praktické průvodce, metodiku a slovník. Tuto úvodní prohlídku spustíte znovu zde nebo v Mém účtu. Základní orientaci už máte — můžete začít." },
  ];
}

export function normalizeGuideState(row: { onboardingStatus: string; onboardingStep: string; onboardingVersion: number; onboardingRevision: number }): GuideState {
  const known = ["available", "pending", "active", "paused", "dismissed", "completed"].includes(row.onboardingStatus);
  return { status: known && row.onboardingVersion === GUIDE_VERSION ? row.onboardingStatus as GuideStatus : "available",
    step: guideStepIds.includes(row.onboardingStep as GuideStepId) ? row.onboardingStep as GuideStepId : "welcome",
    version: GUIDE_VERSION, revision: row.onboardingRevision };
}

export type GuideAction = "start" | "resume" | "next" | "back" | "pause" | "dismiss";
export function guideTransition(state: GuideState, action: GuideAction): Omit<GuideState, "revision"> | null {
  const index = guideStepIds.indexOf(state.step);
  if (action === "start") return { status: "active", step: "welcome", version: GUIDE_VERSION };
  if (action === "resume" && ["active", "paused", "pending"].includes(state.status)) return { status: "active", step: state.step, version: GUIDE_VERSION };
  if (action === "dismiss") return { status: "dismissed", step: state.step, version: GUIDE_VERSION };
  if (!["active", "pending"].includes(state.status)) return null;
  if (action === "pause") return { status: "paused", step: state.step, version: GUIDE_VERSION };
  if (action === "back" && index > 0) return { status: "active", step: guideStepIds[index - 1], version: GUIDE_VERSION };
  if (action === "next") return { status: index === guideStepIds.length - 1 ? "completed" : "active", step: guideStepIds[Math.min(index + 1, guideStepIds.length - 1)], version: GUIDE_VERSION };
  return null;
}
