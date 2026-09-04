export type MethodologyChapter = {
  slug: string;
  category: "Začínáme" | "Nájemní vztah" | "Finance" | "Provoz" | "Asset management";
  title: string;
  summary: string;
  audience: string;
  steps: string[];
  check: string;
  href?: string;
};

export const methodologyChapters: MethodologyChapter[] = [
  {
    slug: "zalozeni-nemovitosti",
    category: "Začínáme",
    title: "Založení a převzetí nemovitosti",
    summary: "Doporučené pořadí nastavení objektu, jednotek, vlastníků, bankovních účtů a provozních odpovědností.",
    audience: "Správce portfolia",
    steps: ["Založte právního vlastníka a objekt.", "Doplňte jednotky a jejich vlastníky.", "Přiřaďte účty pro inkaso a ověřte bankovní notifikace.", "Založte smlouvy, předpisy, kontakty a povinné revize."],
    check: "Objekt je připraven, když jeho checklist nemá povinný nedokončený krok.",
    href: "/nemovitosti/nova",
  },
  {
    slug: "najemni-smlouva",
    category: "Nájemní vztah",
    title: "Nájemní smlouva a osoby",
    summary: "Jak oddělit smluvní stranu, plátce, kontaktní osobu a další obyvatele jednotky.",
    audience: "Správce nájmů",
    steps: ["Ověřte jednotku a všechny právní smluvní strany; jednu označte jako hlavní kontakt a plátce.", "Další osoby přidejte jako smluvní partnery jen tehdy, jsou-li uvedené ve stejné smlouvě; pouhé obyvatele evidujte zvlášť.", "Zadejte platnost, splatnost, variabilní symbol a účet.", "Rozlište nájemné, zálohy na služby a kauci a před aktivací zkontrolujte vznikající předpisy."],
    check: "Smlouva musí odpovědět kdo, kde, od kdy, do kdy, kolik a kam platí.",
    href: "/smlouvy/nova",
  },
  {
    slug: "predpisy-a-inkaso",
    category: "Finance",
    title: "Předpisy, platby a inkaso",
    summary: "Jednotný postup od měsíčního předpisu přes párování platby až po řešení odchylky.",
    audience: "Finanční správce",
    steps: ["Zkontrolujte období, splatnost a rozpad částky.", "Příchozí platbu párujte podle účtu, VS a částky.", "Částečnou úhradu ponechte dohledatelnou na předpisu.", "Dluh vykazujte až po splatnosti; budoucí předpis držte odděleně."],
    check: "Smlouva, předpis, platba a report musí ukazovat tentýž stav.",
    href: "/reporty/predpisy",
  },
  {
    slug: "kauce",
    category: "Finance",
    title: "Kauce v celém lifecycle",
    summary: "Evidence sjednané, přijaté, držené, započtené a vrácené jistoty včetně úroku.",
    audience: "Správce nájmů",
    steps: ["Uložte sjednanou částku a účinné podmínky.", "Skutečný příjem evidujte samostatným pohybem.", "Zápočet vždy spojte s předpisem nebo popisem škody.", "Při ukončení vypořádejte jistinu i naběhlý úrok."],
    check: "Zůstatek kauce musí být odvoditelný z neměnné historie pohybů.",
    href: "/kauce",
  },
  {
    slug: "valorizace",
    category: "Asset management",
    title: "Valorizace a plán nájemného",
    summary: "Oddělení smluvní indexace od plánovacího scénáře a tržního benchmarku.",
    audience: "Asset manager",
    steps: ["Porovnejte smluvní a tržní nájemné.", "Vytvořte scénáře dalšího vývoje.", "Zahrňte expirace, neobsazenost a očekávané inkaso.", "Teprve schválený plán převeďte do dodatku a budoucích předpisů."],
    check: "Forecast nesmí bez potvrzení změnit smlouvu ani existující předpis.",
    href: "/reporty",
  },
  {
    slug: "naklady-a-uvery",
    category: "Asset management",
    title: "Náklady, investice a úvěry",
    summary: "Jednotná evidence ročního rozpočtu, skutečných a plánovaných OPEX/CAPEX nákladů a datovaných stavů úvěrů.",
    audience: "Asset manager",
    steps: ["Založte schválený roční rozpočet odděleně od pracovních plánů.", "Oddělte provozní náklady OPEX od investic CAPEX a rozlište plán, závazek a skutečnost.", "Nový zůstatek, sazbu a splátku úvěru vždy zapište s datem do historie.", "Před reportem zkontrolujte odchylku rozpočtu a datum posledního stavu každého úvěru."],
    check: "Každá částka má objekt, období, stav a dohledatelný zdroj; plán se nevydává za skutečnost.",
    href: "/portfolio",
  },
  {
    slug: "vyuctovani-sluzeb",
    category: "Finance",
    title: "Vyúčtování služeb",
    summary: "Podklady, odečty, pravidla rozúčtování a srozumitelný protokol pro nájemníka.",
    audience: "Správce nájmů",
    steps: ["Uzavřete zúčtovací období a odečty.", "Přiřaďte skutečné náklady a pravidla rozdělení.", "Porovnejte náklady se zaplacenými zálohami.", "Vytvořte protokol a návazný nedoplatek nebo vratku."],
    check: "Každá částka v protokolu musí mít zdroj a způsob výpočtu.",
  },
  {
    slug: "revize",
    category: "Provoz",
    title: "Revize a povinné kontroly",
    summary: "Jak nastavit periodicitu, odpovědnost, protokol a další termín kontroly.",
    audience: "Technický správce",
    steps: ["Založte typ kontroly a periodicitu.", "Přiřaďte odpovědný kontakt.", "Po provedení uložte výsledek a protokol.", "Potvrďte další termín a případné návazné úkoly."],
    check: "Splněná kontrola má autora, datum, výsledek, doklad a další termín.",
    href: "/revize",
  },
  {
    slug: "vice-vlastniku",
    category: "Asset management",
    title: "Více vlastníků a rozsah reportu",
    summary: "Rozdíl mezi svěřenou správou, přístupem externího vlastníka a finanční konsolidací FlatCloud.",
    audience: "Globální správce",
    steps: ["Ověřte právního vlastníka každé jednotky a jeho vztah ke skupině.", "Nastavte rozsah správy a uživatelský přístup jako dvě oddělené věci.", "Provozní cockpit sledujte přes všechny svěřené objekty.", "Korporátní KPI počítejte pouze z aktiv s potvrzeným konsolidačním podílem."],
    check: "Externí aktivum je v provozních alarmech, ale bez výslovné konsolidace nevstupuje do KPI FlatCloud.",
    href: "/vlastnici",
  },
];

export function methodologyChapter(slug: string) {
  return methodologyChapters.find((chapter) => chapter.slug === slug);
}
