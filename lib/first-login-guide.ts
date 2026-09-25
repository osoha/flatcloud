/** Versioned introduction; only describes existing features, never creates business data. */
export const GUIDE_VERSION = 1;
export const guideStepIds = ["welcome", "properties", "contracts", "finance", "tasks", "notifications", "help"] as const;
export const basicGuideStepIds = ["welcome", "properties", "finance", "tasks", "help"] as const;
export type GuideMode = "basic" | "pro";
export type GuideStepId = typeof guideStepIds[number];
export type GuideStatus = "available" | "pending" | "active" | "paused" | "dismissed" | "completed";
export type GuideState = { status: GuideStatus; step: GuideStepId; version: number; revision: number };
export type GuideCapabilities = { hasProperties: boolean; canAddProperty: boolean; canAddTask: boolean };
export type GuideStep = { id: GuideStepId; href: string; target: string; fallback: string; title: string; body: string; image: string };

export function guideSteps(c: GuideCapabilities, mode: GuideMode = "pro"): GuideStep[] {
  if (mode === "basic") return [
    { id: "welcome", href: "/portfolio", target: '[data-guide="portfolio"]', fallback: '[data-guide="portfolio"]', image: "choose-mode", title: "Vítejte ve FlatBerry", body: "Vyberte si vzhled, ve kterém se vám bude pracovat nejlépe. Kdykoli jej můžete změnit." },
    { id: "properties", href: "/portfolio", target: '[data-guide="properties"]', fallback: '[data-guide="portfolio"]', image: "properties", title: "Vaše nemovitosti a lidé", body: c.hasProperties ? "Tady najdete své domy a byty i jejich nájemníky. Otevřením karty se dostanete k podrobnostem." : "Zde uvidíte nemovitosti a jednotky, ke kterým máte přístup. Prázdný přehled u nového účtu je v pořádku." },
    { id: "finance", href: "/portfolio", target: '[data-guide="basic-payments"]', fallback: '[data-guide="portfolio"]', image: "finance", title: "Platby na první pohled", body: "Vidíte, co už přišlo, co zbývá uhradit v tomto měsíci a kolik je po splatnosti. Podrobnosti otevřete kartou Platby." },
    { id: "tasks", href: "/portfolio", target: '[data-guide="basic-tasks"]', fallback: '[data-guide="portfolio"]', image: "tasks", title: "Co potřebuje pozornost", body: "Karta Úkoly a termíny ukazuje otevřené případy. Kliknutím otevřete jejich přehled; úpravy se řídí vašimi oprávněními." },
    { id: "help", href: "/metodika?view=guides", target: '[data-guide="help"]', fallback: ".page-title", image: "methodology", title: "Když si nebudete jistí, jsem nablízku", body: "V Průvodci najdete praktické postupy. Kdykoli můžete přepnout na profesionální vzhled a otevřít podrobnější nástroje." },
  ];
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

export function normalizeGuideState(row: { onboardingStatus: string; onboardingStep: string; onboardingVersion: number; onboardingRevision: number }, mode: GuideMode = "pro"): GuideState {
  const known = ["available", "pending", "active", "paused", "dismissed", "completed"].includes(row.onboardingStatus);
  // A mode change keeps the user's progress and moves discontinued steps forward.
  const step = mode === "basic" && row.onboardingStep === "contracts" ? "finance" : mode === "basic" && row.onboardingStep === "notifications" ? "help" : row.onboardingStep;
  return { status: known && row.onboardingVersion === GUIDE_VERSION ? row.onboardingStatus as GuideStatus : "available",
    step: guideStepIds.includes(step as GuideStepId) ? step as GuideStepId : "welcome",
    version: GUIDE_VERSION, revision: row.onboardingRevision };
}

export type GuideAction = "start" | "resume" | "next" | "back" | "pause" | "dismiss";
export function guideTransition(state: GuideState, action: GuideAction, mode: GuideMode = "pro"): Omit<GuideState, "revision"> | null {
  const ids: readonly GuideStepId[] = mode === "basic" ? basicGuideStepIds : guideStepIds;
  const index = ids.indexOf(state.step);
  if (action === "start") return { status: "active", step: "welcome", version: GUIDE_VERSION };
  if (action === "resume" && ["active", "paused", "pending"].includes(state.status)) return { status: "active", step: state.step, version: GUIDE_VERSION };
  if (action === "dismiss") return { status: "dismissed", step: state.step, version: GUIDE_VERSION };
  if (!["active", "pending"].includes(state.status)) return null;
  if (action === "pause") return { status: "paused", step: state.step, version: GUIDE_VERSION };
  if (action === "back" && index > 0) return { status: "active", step: ids[index - 1], version: GUIDE_VERSION };
  if (action === "next" && index >= 0) return { status: index === ids.length - 1 ? "completed" : "active", step: ids[Math.min(index + 1, ids.length - 1)], version: GUIDE_VERSION };
  return null;
}
