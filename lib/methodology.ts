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

export type MethodologyGlossaryTerm = {
  term: string;
  aliases: string[];
  definition: string;
  formula?: string;
  chapterSlug: string;
};

export type MethodologyMediaBrief = {
  kind: "Podcast" | "Video";
  title: string;
  duration: string;
  purpose: string;
  outline: string[];
  chapterSlug: string;
};

export const methodologyChapters: MethodologyChapter[] = [
  {
    slug: "zalozeni-nemovitosti",
    category: "Začínáme",
    title: "Založení a převzetí nemovitosti",
    summary: "Doporučené pořadí nastavení objektu, jednotek, vlastníků, bankovních účtů a provozních odpovědností.",
    audience: "Správce portfolia",
    steps: ["Založte právního vlastníka a objekt. Při zadání ulice a města zkontrolujte orientační PIN v mapovém náhledu; mapa adresu sama neopravuje.", "Doplňte jednotky a jejich vlastníky.", "Přiřaďte účty pro inkaso a ověřte bankovní notifikace.", "Založte smlouvy, předpisy, kontakty a povinné revize."],
    check: "Objekt je připraven, když jeho adresa odpovídá zobrazené poloze a checklist nemá povinný nedokončený krok.",
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
    slug: "ukonceni-najmu",
    category: "Nájemní vztah",
    title: "Ukončení nájemního vztahu",
    summary: "Kontrolovaný postup od data ukončení přes poslední předpisy a odečty až po vypořádání kauce.",
    audience: "Správce nájmů",
    steps: ["Ověřte skutečné datum a právní důvod ukončení.", "Zkontrolujte otevřené předpisy, poslední platbu a budoucí změny nájemného.", "Zapište konečné odečty a připravte vyúčtování služeb.", "Vypořádejte kauci, škody, úroky a případný zůstatek.", "Teprve poté uzavřete návazné provozní úkoly a připravte jednotku k dalšímu nájmu."],
    check: "Historie smlouvy zůstává zachována, budoucí automatika za koncem je zastavena a každý finanční zůstatek má další krok.",
    href: "/smlouvy",
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
    steps: ["Otevřete vyúčtování přímo ze smlouvy a zvolte uzavřené období nejvýše 370 dní.", "Zkontrolujte předepsané zálohy odděleně od nájemného; inkaso celého předpisu není totéž jako výše zálohy.", "Doplňte skutečné OPEX náklady kategorie Energie a služby a u společných dokladů uložte rozdělení na jednotky.", "Ověřte počáteční a koncové odečty aktivních měřidel i platnost smlouvy v celém období.", "Nejprve odstraňte všechny blokátory. Pracovní náhled nic nezaúčtuje; až samostatné vystavení protokolu smí vytvořit nedoplatek nebo přeplatek."],
    check: "Každá částka má zdroj a uložený způsob rozdělení; pracovní náhled je read-only. Vystavení protokolu zmrazí podklady a atomicky vytvoří právě jeden nedoplatek nebo přeplatek.",
    href: "/smlouvy",
  },
  {
    slug: "rocni-podklady",
    category: "Finance",
    title: "Roční podklady vlastníka",
    summary: "Kontrolní balíček skutečně přijatých úhrad, skutečných výdajů, dokladů a úvěrových mezer před předáním účetnímu.",
    audience: "Vlastník a finanční správce",
    steps: ["Vyberte jednoho právního vlastníka a uzavřený kalendářní rok.", "Ověřte, že příjmy vycházejí z přiřazených bankovních úhrad a výdaje pouze ze stavu Skutečnost.", "Doplňte rozdělení společných nákladů a účetní doklady u každé chybějící položky.", "Zaplacené úroky evidujte jako samostatný skutečný finanční náklad s dokladem; sazba ani jistina nejsou náhradou výpisu.", "Při změně vlastnictví v průběhu roku ověřte historické podíly mimo automatický přehled.", "CSV předejte účetnímu jako pracovní zdroj, ne jako hotové daňové přiznání."],
    check: "Balíček nemá blokátor, každý výdaj má doklad a odborník potvrdil kategorizaci, historické vlastnictví i daňové zacházení.",
    href: "/reporty/rocni-podklady",
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
    slug: "vyrocni-report",
    category: "Asset management",
    title: "Výroční report pro akcionáře",
    summary: "Interní příprava korporátního příběhu, hodnoty portfolia, kapitol nemovitostí a kontrolovaného PDF z uzavřených Q4 snapshotů.",
    audience: "Vedení, asset manager a interní reporting",
    steps: ["Zvolte aktivní reportovací skupinu a uzavřený rok; založením reportu se zmrazí přesný rozsah nemovitostí a jejich Q4 snapshoty k 31. prosinci.", "V konceptu doplňte slovo zakladatele, shrnutí roku, investiční tezi, tvorbu hodnoty, výhled, hodnotu aktiv, dluh, exity a údaje o akcii.", "U každé nemovitosti oddělte počáteční, koncovou a cílovou hodnotu, investiční případ, tvorbu hodnoty, výhled exitu a poznámku ke zdroji.", "Před odesláním ke kontrole odstraňte všechny blokátory úplnosti a ověřte provenienci zmrazených dat v příloze.", "Ve stavu Ke kontrole otevřete deterministický PDF náhled; administrátor musí potvrdit jeho vizuální kontrolu před publikací.", "Publikovanou revizi neupravujte. Potřebnou opravu založte jako novou revizi, aby původní PDF, snapshoty i auditní stopa zůstaly zachované."],
    check: "Publikovat lze pouze uzavřený a úplný report se shodným zmrazeným rozsahem, schváleným PDF náhledem a dohledatelnými zdroji. Workflow je interní a samo nic veřejně nerozesílá.",
    href: "/reporty/vyrocni",
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
  {
    slug: "kategorizace-jednotek",
    category: "Asset management",
    title: "Kvalita jednotek a plán obnovy",
    summary: "Neutrální evidence fyzického stavu, investiční naléhavosti a plánovaného CAPEX napříč spravovaným portfoliem.",
    audience: "Správce a asset manager",
    steps: ["Hodnoťte všechna oprávněně spravovaná aktiva bez ohledu na vlastníka, konsolidaci nebo zamýšlený prodej.", "Určete současný fyzický stav písmenem A–D a samostatně zvolte naléhavost investice.", "Doplňte realistický odhad CAPEX, stav plánu obnovy a u plánované či probíhající akce cílový termín.", "Poznámkou popište rozsah nebo zdroj odhadu tak, aby další hodnotitel dokázal rozhodnutí ověřit.", "Při změně stavu vytvořte nový snapshot. Starší hodnocení se nepřepisuje; distribuční připravenost a valuace mají vlastní proces.", "Teprve schválený aktuální plán s kladnou částkou a termínem převeďte do realizace. Jedním krokem vznikne propojený úkol údržby, plánovaný CAPEX náklad a rozpočtová položka; opakovaný převod systém zablokuje.", "Realizaci zahajte a dokončete pouze z modulu Kvalita a CAPEX. Zahájení přepne úkol a náklad do průběhu; dokončení zapíše skutečnou částku, uzavře úkol a ukáže odchylku proti původnímu plánu. Historické události se nepřepisují.", "V CAPEX výhledu kontrolujte zvlášť položky po termínu, pětiletý horizont, pozdější záměry a položky bez termínu. Rozpad Záměr / Schváleno / V realizaci vychází vždy z posledního snapshotu a událostí realizace.", "Skutečnost a odchylka se počítají pouze z dokončených realizací v daném roce. Výhled je provozní plán, nikoli účetní či daňový podklad, a nemá vazbu na interní Distribuci."],
    check: "Každá jednotka má aktuální datované hodnocení, zdůvodněný CAPEX a dohledatelný stav plánu; schválená realizace má právě jeden úkol, náklad a rozpočtovou položku. Dokončená realizace má skutečný náklad a viditelnou odchylku vůči neměnnému plánu. Součet časových košů odpovídá aktivním plánům a technický stav ani výhled se nevydávají za valuaci, účetnictví nebo distribuční rozhodnutí.",
    href: "/portfolio/kvalita",
  },
  {
    slug: "valuace-jednotek",
    category: "Asset management",
    title: "Valuace jednotek pro distribuci",
    summary: "Oddělená historie tržní hodnoty jednotlivé jednotky, zdroje ocenění a kontrolního přepočtu na m².",
    audience: "Interní asset manager",
    steps: ["Nejdřív doplňte plochu, samostatné technické hodnocení a odhad potřebného CAPEX.", "Zvolte zdroj valuace: interní srovnání, externí posudek, nabídkovou cenu nebo realizovanou transakci.", "Uveďte datum a dohledatelnou referenci; interní srovnání popište v poznámce.", "Novou informaci uložte jako další snapshot, původní hodnotu nepřepisujte.", "Hodnotu Kč/m² používejte jako kontrolu konzistence, ne jako samostatný zdroj ocenění."],
    check: "Poslední valuace má datum, zdroj a referenci a není zaměněna s technickým ratingem, CAPEX ani automatickou prodejní cenou.",
    href: "/distribuce",
  },
  {
    slug: "crm-distribuce",
    category: "Asset management",
    title: "CRM zájemců pro distribuci",
    summary: "Interní vedení zájemce od prvního kontaktu přes prohlídku a nabídku až k rezervaci nebo uzavření.",
    audience: "Interní distribuční tým",
    steps: ["Založte zájemce až s alespoň jedním použitelným kontaktem a uveďte zdroj.", "Zájem o každou jednotku veďte jako samostatnou příležitost; nabídkovou cenu můžete převzít z poslední valuace, ruční hodnotu však systém bez výslovného pokynu nepřepíše.", "Nastavte věcnou fázi, cenu a konkrétní datum dalšího kroku.", "Opci veďte odděleným stavem. Nabídnutá nebo podepsaná opce vyžaduje cenu a platnost; podepsaná či využitá také referenci dokumentu.", "Po každé změně zkontrolujte neměnnou historii funnelu s původní a novou fází, stavem opce a autorem.", "Rezervaci v CRM nepovažujte za právní rezervaci a bez samostatného souhlasu neposílejte automatickou komunikaci."],
    check: "Každá otevřená příležitost má zájemce, jednotku, aktuální fázi a budoucí další krok; opce má úplné podklady, historie se nepřepisuje a osobní údaje zůstávají interní.",
    href: "/distribuce/zajemci",
  },
  {
    slug: "reporting-distribuce",
    category: "Asset management",
    title: "Distribuční podklady pro akcionáře",
    summary: "Kvartální a roční agregace technického podkladu, valuací, CAPEX a distribuční pipeline bez osobních údajů zájemců.",
    audience: "Interní reporting FlatCloud",
    steps: ["Vyberte kvartál nebo celý rok aktivity.", "Ověřte úplnost technických podkladů a valuací po nemovitostech.", "Čtěte první řez fází jako dnešní LIVE stav a nové příležitosti podle data založení.", "Samostatný historický řez čtěte jako počet neměnných událostí podle cílové fáze; podepsané a využité opce jsou agregované bez identifikace zájemce.", "Exportujte pouze interní agregované CSV bez osobních údajů a odborně ověřte komentář reportu."],
    check: "Podklad obsahuje jen potvrzená aktiva FlatCloud, neobsahuje PII a jasně odděluje dnešní LIVE stav od historických pohybů ve zvoleném období.",
    href: "/distribuce/reporting",
  },
  {
    slug: "uvitaci-dopis-vlastnikovi",
    category: "Asset management",
    title: "Uvítací dopis novému vlastníkovi",
    summary: "Kontrolovaná postprodejní komunikace od uzavřené CRM příležitosti přes datum nabytí a přílohy až k auditovanému odeslání.",
    audience: "Distribuční a klientský tým FlatCloud",
    steps: ["Uzavřete prodej v CRM a zkontrolujte jméno a e-mail kupujícího.", "Založte dopis z konkrétní příležitosti a potvrďte datum nabytí podle katastru; systém zmrazí jednotku, dům a prodávající SPV do revize.", "Upravte obchodní úvod, jednotlivá doporučení, kontakty a vyberte pouze aktuální dokumenty daného domu.", "Uložte koncept a zkontrolujte FlatCloud náhled včetně předmětu a příloh.", "Předejte dopis do stavu Připraveno. Pokud je potřeba změna, vraťte jej před odesláním zpět do konceptu.", "Po dni nabytí potvrďte příjemce, obsah a přílohy a odešlete e-mail ručně. Odeslanou revizi již neupravujte; opravu založte jako novou revizi."],
    check: "Dopis lze odeslat pouze k uzavřenému prodeji, po datu nabytí a po výslovném potvrzení člověka. Odeslaná revize, přílohy a auditní stopa zůstávají dohledatelné.",
    href: "/distribuce/uvitaci-dopisy",
  },
];

export function methodologyChapter(slug: string) {
  return methodologyChapters.find((chapter) => chapter.slug === slug);
}

export const methodologyGlossary: MethodologyGlossaryTerm[] = [
  { term: "LIVE stav", aliases: ["aktuální stav", "dnešní stav"], definition: "Aktuální provozní pohled přepočtený z dnešních dat. Není historickým snapshotem ani účetní závěrkou.", chapterSlug: "reporting-distribuce" },
  { term: "Snapshot", aliases: ["zmrazená data", "datový otisk"], definition: "Neměnný datovaný otisk vstupů použitý pro reprodukovatelný report nebo rozhodnutí.", chapterSlug: "vyrocni-report" },
  { term: "Q4 snapshot", aliases: ["snapshot k 31. prosinci"], definition: "Uzavřený snapshot nemovitosti k 31. prosinci, který je zdrojem výročního reportu za daný rok.", chapterSlug: "vyrocni-report" },
  { term: "OPEX", aliases: ["provozní náklad"], definition: "Výdaj související s běžným provozem a správou aktiva; v evidenci zůstává oddělený od investičního CAPEX.", chapterSlug: "naklady-a-uvery" },
  { term: "CAPEX", aliases: ["investiční náklad", "investice"], definition: "Investiční výdaj na pořízení, obnovu nebo významné zhodnocení aktiva; plán a skutečnost se evidují odděleně.", chapterSlug: "kategorizace-jednotek" },
  { term: "Roční nájemné", aliases: ["annual rent", "roční run-rate nájemného"], definition: "Indikativní roční nájemné odvozené z aktuálního měsíčního čistého nájemného. Nezohledňuje budoucí expirace ani neobsazenost.", formula: "Měsíční čisté nájemné × 12", chapterSlug: "naklady-a-uvery" },
  { term: "NOI", aliases: ["čistý provozní výnos"], definition: "Indikativní provozní výnos před financováním a daněmi. V aplikaci jde o LIVE run-rate, ne účetní závěrku.", formula: "Roční nájemné − skutečný OPEX za posledních 12 měsíců", chapterSlug: "naklady-a-uvery" },
  { term: "Cashflow", aliases: ["peněžní tok po dluhové službě"], definition: "Indikativní částka, která zbývá z NOI po odečtení evidované roční dluhové služby. Nezahrnuje daně ani neevidované výdaje.", formula: "NOI − roční dluhová služba", chapterSlug: "naklady-a-uvery" },
  { term: "Yield", aliases: ["výnosnost aktiva"], definition: "Poměr indikativního NOI k poslední evidované tržní hodnotě aktiva. Výsledek závisí na úplnosti OPEX a datu ocenění.", formula: "NOI ÷ tržní hodnota × 100 %", chapterSlug: "naklady-a-uvery" },
  { term: "ROE", aliases: ["return on equity", "výnosnost vlastního kapitálu"], definition: "Poměr indikativního cashflow k vlastnímu kapitálu odvozenému z evidované tržní hodnoty a nesplacené jistiny.", formula: "Cashflow ÷ (tržní hodnota − nesplacená jistina) × 100 %", chapterSlug: "naklady-a-uvery" },
  { term: "LTV", aliases: ["loan-to-value"], definition: "Poměr nesplacené jistiny úvěru k evidované hodnotě aktiva; závisí na datu obou vstupů.", formula: "Nesplacená jistina ÷ tržní hodnota × 100 %", chapterSlug: "naklady-a-uvery" },
  { term: "DSCR", aliases: ["debt service coverage ratio"], definition: "Poměr NOI k evidované roční dluhové službě. Hodnota pod 1,00× je kritický finanční alarm.", formula: "NOI ÷ roční dluhová služba", chapterSlug: "naklady-a-uvery" },
  { term: "Konsolidační podíl", aliases: ["podíl FlatCloud"], definition: "Potvrzený podíl, kterým aktivum vstupuje do korporátních KPI FlatCloud; není totožný s rozsahem svěřené správy.", chapterSlug: "vice-vlastniku" },
  { term: "Příležitost", aliases: ["opportunity", "zájem o jednotku"], definition: "Samostatně vedený zájem konkrétního zájemce o jednu jednotku, včetně fáze, ceny a dalšího kroku.", chapterSlug: "crm-distribuce" },
  { term: "Opce", aliases: ["option"], definition: "Interně evidovaná nabídka nebo smluvní právo s cenou, platností a případně referencí dokumentu; sama nenahrazuje právní kontrolu.", chapterSlug: "crm-distribuce" },
  { term: "Reportovací skupina", aliases: ["reporting group"], definition: "Řízený rozsah nemovitostí a oprávnění použitý pro kvartální a výroční reporting.", chapterSlug: "vyrocni-report" },
  { term: "Revize reportu", aliases: ["verze reportu"], definition: "Nová neměnná verze reportu. Publikovaná revize se neopravuje přepisem.", chapterSlug: "vyrocni-report" },
  { term: "PII", aliases: ["osobní údaje"], definition: "Údaje umožňující identifikovat člověka. Agregovaný distribuční report je nesmí obsahovat.", chapterSlug: "reporting-distribuce" },
  { term: "Uvítací dopis", aliases: ["welcome letter", "postprodejní e-mail"], definition: "Verzovaná a auditovaná komunikace novému vlastníkovi navázaná na konkrétní uzavřený prodej, datum nabytí, dům, jednotku a prodávající SPV.", chapterSlug: "uvitaci-dopis-vlastnikovi" },
];

export const methodologyMediaBriefs: MethodologyMediaBrief[] = [
  { kind: "Video", title: "Od Q4 snapshotu k výročnímu reportu", duration: "6–8 min", purpose: "Ukázat interní editor, kontrolu úplnosti, PDF náhled a založení nové revize.", outline: ["Výběr skupiny a roku", "Zmrazená data a editace", "Kontrola a publikace"], chapterSlug: "vyrocni-report" },
  { kind: "Podcast", title: "Co znamenají NOI, LTV a DSCR", duration: "12–15 min", purpose: "Sjednotit interpretaci finančních KPI a vysvětlit jejich datové limity.", outline: ["Definice metrik", "Datované vstupy", "Alarmy a lidské rozhodnutí"], chapterSlug: "naklady-a-uvery" },
  { kind: "Video", title: "Roční podklady vlastníka bez záměny za daňové přiznání", duration: "5–7 min", purpose: "Provést kontrolou příjmů, nákladových dokladů, úvěrových mezer a exportu CSV.", outline: ["Uzavřený rok a vlastník", "Blokátory a doklady", "Pracovní export pro účetního"], chapterSlug: "rocni-podklady" },
  { kind: "Podcast", title: "LIVE funnel versus historie pohybů", duration: "10–12 min", purpose: "Vysvětlit dva odlišné řezy distribuční pipeline a pravidla agregace bez PII.", outline: ["Dnešní stav", "Neměnné události", "Bezpečný reporting"], chapterSlug: "reporting-distribuce" },
];

export function methodologySearchText(value: MethodologyGlossaryTerm | MethodologyMediaBrief) {
  if ("term" in value) return `${value.term} ${value.aliases.join(" ")} ${value.definition} ${value.formula || ""}`;
  return `${value.kind} ${value.title} ${value.duration} ${value.purpose} ${value.outline.join(" ")}`;
}
