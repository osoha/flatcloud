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
    steps: ["Porovnejte současné smluvní nájemné s poslední dostupnou MF referencí; chybějící pokrytí nepovažujte za nulový potenciál.", "Přepněte konzervativní, základní a optimistický scénář a vždy čtěte jeho viditelné předpoklady růstu, vacancy, inkasa a využití tržního rozdílu.", "Pro pracovní citlivost upravte vlastní předpoklady. Přepočet mění pouze model a při změně horizontu musí zůstat hodnoty zachované.", "Ve smluvní křivce zkontrolujte nastavenou pevnou indexaci a expirace; po konci smlouvy tato křivka klesá na nulu.", "Uložte projednávanou variantu jako koncept; tím zmrazíte datum, rozsah, smluvní vstupy, vlastní předpoklady i MF referenci.", "Schválenou revizi používejte jako rozhodovací podklad. Další variantu zakládejte jako novou revizi, aby původní rozhodnutí zůstalo dohledatelné.", "Po schválení zkontrolujte dry-run náhled převodu. Rozlišuje návrhy k posouzení dodatku, smlouvy vyžadující nejprve obnovu, konflikt s indexací a jednotky beze změny; sám nic nezapisuje.", "Pro jednu způsobilou smlouvu připravte návrh změny, doplňte první den účinnosti a právní důvod. Na samostatné kontrolní obrazovce změnu potvrďte až po kontrole částky; potvrzení verzovaně změní nájemné a synchronizuje jen budoucí neuhrazené, automatické předpisy."],
    check: "Uložení, schválení ani dry-run forecastu nesmí změnit smlouvu, složku předpisu nebo předpis. Skutečný převod musí být jednotlivý, dvoukrokový, auditovaný a zablokovat expiraci, mezitím změněné nájemné, kolizi s indexací i uhrazený či ručně upravený budoucí předpis.",
    href: "/reporty",
  },
  {
    slug: "naklady-a-uvery",
    category: "Asset management",
    title: "Náklady, investice a úvěry",
    summary: "Jednotná evidence ročního rozpočtu, skutečných a plánovaných OPEX/CAPEX nákladů a datovaných stavů úvěrů.",
    audience: "Asset manager",
    steps: ["Založte schválený roční rozpočet odděleně od pracovních plánů.", "Oddělte provozní náklady OPEX od investic CAPEX a u nákladu určete celý objekt nebo konkrétní jednotku.", "Společný náklad rozdělte rovnoměrně, podle plochy nebo vlastními podíly; před uložením ověřte součet 100 %.", "Ke skutečné částce připojte číslo a soubor účetního podkladu.", "Nový zůstatek, sazbu a splátku úvěru vždy zapište s datem do historie.", "Tržní ocenění ukládejte jako nový datovaný stav se zdrojem; starší ocenění nepřepisujte.", "NOI, cashflow, yield, ROE, LTV a DSCR čtěte jako indikativní LIVE run-rate podle definice na kartě, nikoli jako účetní závěrku.", "Ve finančních alarmech řešte nejprve kritické překročení LTV 70 %, DSCR pod 1,00×, rozpočtu nad 100 % a prošlou fixaci; potom varování a chybějící podklady.", "Před reportem zkontrolujte odchylku rozpočtu, úplnost dokladů, ocenění a datum posledního stavu každého úvěru."],
    check: "Každá částka má objekt, období, stav a dohledatelný zdroj; plán se nevydává za skutečnost a finanční alarm vede přímo k místu nápravy.",
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
