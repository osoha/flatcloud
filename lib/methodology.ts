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

export type MethodologyGuide = {
  slug: string;
  title: string;
  situation: string;
  audience: string;
  outcome: string;
  steps: Array<{ label: string; note: string; href: string }>;
};

export const methodologyGuides: MethodologyGuide[] = [
  { slug: "dokonceni-vyuctovani", title: "Dokončuji vyúčtování služeb", situation: "Od podkladů k vypořádání", audience: "Správce nájmů", outcome: "Podklady, rozdělení, skutečné úhrady, schválení a doručení tvoří dohledatelný celek.", steps: [
    { label: "Potvrdit podklady a rozdělení", note: "V konkrétním domě otevřete Podklady vyúčtování, ověřte originály a potvrďte rozdělení domovních řádků.", href: "/portfolio" },
    { label: "Otevřít vyúčtování smlouvy", note: "Vyberte smlouvu a období, zkontrolujte blokátory a uložte pracovní protokol.", href: "/smlouvy" },
    { label: "Projít dokončení krok za krokem", note: "Uzavřete skutečné úhrady, schvalte výsledek a evidujte skutečné doručení. Návrh není pokyn k úhradě.", href: "/metodika?view=chapters&q=vyúčtování" },
    { label: "Vyřídit námitky a vypořádat", note: "Na protokolu vyřešte námitky a po zadané lhůtě proveďte finanční vypořádání. Bankovní platba se sama neodešle.", href: "/smlouvy" },
  ] },
  { slug: "upozorneni-ukolu", title: "Nastavuji upozornění a komunikaci v úkolech", situation: "Týmová spolupráce", audience: "Všichni uživatelé úkolů", outcome: "Víte, koho zpráva upozorní a které e-maily si přejete dostávat.", steps: [
    { label: "Vybrat e-mailová upozornění", note: "V profilu ponechte potřebné typy nebo e-maily vypněte hlavním přepínačem; oznámení v aplikaci zůstávají.", href: "/ucet#upozorneni" },
    { label: "Ověřit účastníky a viditelnost", note: "V detailu úkolu nejprve zkontrolujte, kdo smí číst nový záznam a jeho přílohy.", href: "/ukoly" },
    { label: "Použít @zmínku nebo tichou reakci", note: "Osobu vyberte z našeptávače. Reakce pod příspěvkem neposílá e-mail ani nepotvrzuje dokončení úkolu.", href: "/metodika?view=chapters&q=@zmínku" },
  ] },
  { slug: "prevzeti-objektu", title: "Přebírám nový dům do správy", situation: "Nové aktivum", audience: "Portfolio a property manager", outcome: "Objekt má úplnou identitu, jednotky, odpovědnosti a finanční vstupy.", steps: [
    { label: "Založit vlastníka a nemovitost", note: "Ověřte právní subjekt, adresu a rozsah správy.", href: "/nemovitosti/nova" },
    { label: "Doplnit jednotky a přístupy", note: "Oddělte vlastnictví jednotek od uživatelských oprávnění.", href: "/portfolio" },
    { label: "Nastavit finance a revize", note: "Přiřaďte účty, rozpočet, úvěry a povinné kontroly.", href: "/portfolio/kvalita" },
  ] },
  { slug: "novy-najemce", title: "Nastěhovávám nového nájemce", situation: "Nový nájem", audience: "Správce nájmů", outcome: "Smlouva, osoby, předpisy, kauce a počáteční stav na sebe navazují.", steps: [
    { label: "Založit osoby a smlouvu", note: "Rozlište smluvní strany, plátce a pouhé obyvatele.", href: "/smlouvy/nova" },
    { label: "Zkontrolovat předpis", note: "Oddělte čisté nájemné, služby a kauci.", href: "/reporty/predpisy" },
    { label: "Potvrdit pohyb kauce", note: "Skutečný příjem evidujte až podle bankovní úhrady.", href: "/kauce" },
  ] },
  { slug: "chybejici-uhrada", title: "Nájemce neuhradil předpis", situation: "Dluh po splatnosti", audience: "Finanční a property manager", outcome: "Platba je správně spárovaná nebo má dohledatelný další krok bez předčasné eskalace.", steps: [
    { label: "Prověřit nespárované platby", note: "Nejdřív vylučte chybné VS, účet nebo částečnou úhradu.", href: "/platby/nesparovane" },
    { label: "Otevřít saldo dlužníka", note: "Rozlišujte budoucí předpis od skutečného dluhu po splatnosti.", href: "/reporty/saldo" },
    { label: "Založit řízený úkol", note: "Další kontakt a výsledek ponechte v auditované pracovní frontě.", href: "/ukoly/novy" },
  ] },
  { slug: "obnova-jednotky", title: "Plánuji opravu nebo obnovu jednotky", situation: "OPEX / CAPEX", audience: "Technický a asset manager", outcome: "Rozhodnutí má stav, rozpočet, odpovědnost a oddělený plán od skutečnosti.", steps: [
    { label: "Posoudit technický stav", note: "Hodnocení a naléhavost uložte jako nové datované hodnocení.", href: "/portfolio/kvalita" },
    { label: "Schválit plán CAPEX", note: "Teprve potvrzený plán převádějte do realizace.", href: "/portfolio/kvalita/plan" },
    { label: "Doložit skutečný náklad", note: "Po dokončení připojte účetní doklad a zkontrolujte odchylku.", href: "/reporty/rocni-podklady" },
  ] },
  { slug: "rocni-uzaverka", title: "Připravuji roční závěrku a report", situation: "Konec roku", audience: "Finance, asset management a vedení", outcome: "Q4, výroční report a podklady vlastníků mají společný dohledatelný stav.", steps: [
    { label: "Otevřít roční checklist", note: "Začněte společnou kontrolou rozsahu a chybějících zdrojů.", href: "/reporty/rocni-checklist" },
    { label: "Doplnit podklady vlastníků", note: "Historické podíly, náklady a úroky potvrďte před předáním účetnímu.", href: "/reporty/rocni-podklady" },
    { label: "Dokončit výroční revizi", note: "Publikujte až po obsahové a vizuální kontrole uzavřeného reportu.", href: "/reporty/vyrocni" },
  ] },
  { slug: "novy-vlastnik", title: "Dokončili jsme prodej novému vlastníkovi", situation: "Postprodejní péče", audience: "Distribuční a klientský tým", outcome: "Nový vlastník obdrží po nabytí zkontrolovaný uvítací dopis a správné přílohy.", steps: [
    { label: "Uzavřít příležitost", note: "Ověřte kupujícího, jednotku a finální stav obchodu.", href: "/distribuce/zajemci" },
    { label: "Připravit uvítací dopis", note: "Upravte text, doporučení, kontakty a přílohy konkrétního domu.", href: "/distribuce/uvitaci-dopisy" },
    { label: "Ručně potvrdit odeslání", note: "Odešlete až po datu nabytí a výslovné kontrole příjemce i příloh.", href: "/distribuce/uvitaci-dopisy" },
  ] },
];

export const methodologyChapters: MethodologyChapter[] = [
  {
    slug: "tymova-prace-a-oznameni",
    category: "Začínáme",
    title: "Týmové úkoly, oznámení a osobní pracovní plocha",
    summary: "Jak vést auditované pracovní vlákno, cílit provozní sdělení a přitom neplést osobní skrytí se stavem společného úkolu.",
    audience: "Všichni uživatelé; správci a super-administrátor",
    steps: [
      "Obecný týmový úkol použijte pro práci napříč portfoliem. Určete odpovědného, spoluřešitele a sledující; publikum lze při založení rozšířit na všechny aktivní uživatele, tým FlatCloud nebo všechny správce.",
      "Skupinová volba přidává její současné členy jako sledující. Nepřiřazuje jim odpovědnost ani sama neposílá e-mail; konkrétní spoluřešitel má před sledujícím přednost.",
      "Před přidáním záznamu ověřte jeho viditelnost. Interní poznámku vidí jen lidé s právem editace případu; zveřejnění vlastníkovi zvolte výslovně. Stejnou viditelnost mají přílohy.",
      "Pro @zmínku napište @ a vyberte osobu z našeptávače. Samotné napsání jména nestačí. Nabídka respektuje účastníky i viditelnost záznamu; zmínka nikomu nepřidá přístup ani odpovědnost za úkol.",
      "Chcete-li upozornit další účastníky, zaškrtněte Upozornit e-mailem další účastníky a vyberte příjemce. Zprávu nejprve uložte do vlákna. Odeslání respektuje nastavení a aktuální přístup příjemce; výběr příjemce není potvrzení doručeného e-mailu.",
      "V profilu uživatele otevřete Upozornění. Výchozně jsou zapnuté e-maily pro přímé zmínky a adresná upozornění, přiřazení a termíny. Nové komentáře a změny stavu zapněte podle potřeby. Hlavním přepínačem vypnete všechny tyto e-maily; upozornění uvnitř aplikace zůstávají.",
      "Zmínky a komentáře se zpracovávají po uložení. Přiřazení, změny stavu a termíny kontroluje hodinový plánovač, takže e-mail nemusí přijít hned. U termínu systém posílá nejvýše jedno upozornění předem a jedno po termínu.",
      "Pod příspěvkem zvolte Reagovat a jeden ze šesti smajlíků. Máte jednu reakci na příspěvek; můžete ji změnit nebo odebrat a zobrazit, kdo reagoval. Reakce neposílá e-mail, nemění nepřečtený stav ani poslední aktivitu a neuzavírá úkol.",
      "Oblíbená hvězdička, stav přečtení a volby Skrýt či Skrýt na hlavní stránce jsou osobní. Nemění stav úkolu ani zobrazení ostatních lidí; skrytý úkol obnovíte ve filtru Skryté tlačítkem Vrátit do přehledu. Úkol uzavírejte až závěrečným záznamem.",
      "Oznámení vytváří super-administrátor pro vybrané publikum. Na portfoliu je jen zkrácený náhled; otevřete Celé oznámení a dojděte na konec textu, aby se označilo jako přečtené. Přečtení oznámení samo neskryje. Skrytá sdělení najdete v Úkoly → Oznámení → Skrytá a můžete je vrátit mezi aktivní.",
      "Na portfoliu můžete Stav portfolia sbalit do nízké lišty. Volba se pamatuje pro váš účet v daném prohlížeči. Fronta Vyžaduje pozornost využívá celou šířku; při dostatku místa a alespoň čtyřech položkách se rozdělí do dvou sloupců.",
    ],
    check: "Vlákno má jasného odpovědného, správné účastníky a viditelnost. Osobní skrytí ani reakce nezměnily společný stav; e-mailové preference odpovídají tomu, na co chcete být upozorňováni.",
    href: "/ukoly",
  },
  {
    slug: "automaticke-ukoly",
    category: "Provoz",
    title: "Automatické úkoly a lokální výjimky",
    summary: "Centrální katalog událostí s bezpečným globálním řízením, nastavením po objektech a ochranou proti duplicitám.",
    audience: "Super-administrátor a správce nemovitosti",
    steps: [
      "Super-administrátor v Nastavení určuje globální zapnutí, předstih, prioritu a výchozí chování pravidla. Nové katalogové události zůstávají vypnuté, dokud pro ně není hotový datový zdroj.",
      "Správce v nastavení nemovitosti volí Zdědit, Zapnout nebo Vypnout. Lokální volba se uplatní po globálním povolení pravidla; vypnuté globální pravidlo lokální výjimka nespustí.",
      "Aktivní první sada sleduje výročí nájmu, blížící se konec a evidované ukončení. Plánovač vytváří jen dnešní nebo budoucí události, takže po nasazení nevznikne historická lavina.",
      "Každá událost má stabilní deduplikační klíč. Opakovaný běh plánovače proto nevytvoří druhý úkol pro stejnou smlouvu, pravidlo a datum.",
      "Po změně nastavení použijte náhled kandidátů; ruční Spustit kontrolu používá stejná pravidla jako hodinový plánovač.",
    ],
    check: "Náhled odpovídá globálním a lokálním volbám, opakovaný běh nevytváří duplicity a nové pravidlo se aktivuje až vědomým rozhodnutím.",
    href: "/nastaveni/automaticke-ukoly",
  },
  {
    slug: "osobni-vzhled-portfolia",
    category: "Začínáme",
    title: "Oblíbené objekty, fotografie a vlastní barvy",
    summary: "Uspořádejte si portfolio pomocí hvězdiček a nastavte si osobní vzhled objektů a jednotek.",
    audience: "Všichni uživatelé",
    steps: [
      "V portfoliu klikněte na hvězdičku u objektu. Oblíbené objekty se řadí první; archivované zůstávají v oddělené části. Dalším kliknutím označení zrušíte.",
      "V detailu objektu nebo jednotky otevřete Upravit kartu, případně klikněte přímo na jeho avatar. Zde společně vyberete fotografii / avatar a barvu. Barva a oblíbenost jsou nezávislé volby.",
      "První volbou je Obecná ikona. Dále můžete zvolit fotografii z nahraných dokumentů nebo nahrát vlastní avatar (JPG, PNG nebo WebP do 2 MB). Nový obrázek automaticky otočíme a upravíme do čtverce. Nedostupnou fotografii nahradí ikona.",
      "Dole v levém menu přepnete jedním klikem světlý nebo tmavý režim a standardní nebo široký obsah. Na mobilu jsou přepínače v horní liště. Tyto dvě volby si pamatuje váš prohlížeč pro váš účet.",
      "Objekt se zvolenou barvou zvýrazní na hlavní stránce portfolia; u jednotky se zvýrazní její záhlaví. Výchozí nastavení je bez barvy a obnovíte je volbou Bez zvýraznění.",
      "Volby se ukládají k vašemu účtu a platí i po přihlášení na jiném zařízení. Nemění nastavení ostatních lidí ani finanční stav. Zelená a červená částka dluhu vyjadřují skutečný stav, nikoli osobní barvu karty.",
    ],
    check: "Oblíbené objekty jsou nahoře, fotografie odpovídá objektu a osobní barva se neplete s finančními ukazateli.",
    href: "/portfolio",
  },
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
    title: "Valuace, valorizace a plán nájemného",
    summary: "Oddělení smluvní indexace od plánovacího scénáře a tržního benchmarku.",
    audience: "Asset manager",
    steps: ["V Reportech otevřete Valorizace a vyberte rozsah nemovitostí. Model pracuje s čistým nájemným bez služeb; MF je benchmark nájemného, nikoli prodejní hodnota nemovitosti.", "Rozlišujte tři křivky: smluvní vývoj je právně platný stav, headline rent je pracovní cenový plán a expected collection je očekávané inkaso po zohlednění vacancy a úspěšnosti plateb. Forecast sám smlouvy ani předpisy nemění.", "Model je event-driven. Headline rent se nemění každý měsíc, ale pouze při cenové události: smluvní indexaci nebo expiraci. Tříměsíční smlouva proto vytváří více rozhodovacích bodů než dvanáctiměsíční; smlouva na dobu neurčitou bez indexace zůstává vodorovná.", "Oranžové značky v grafu ukazují expirace. U jedné jednotky zobrazí datum, původní nájem, tehdejší MF, zvolenou strategii a nový headline rent. V portfoliu se expirace ve stejném měsíci agregují a tooltip vypíše konkrétní nemovitosti, jednotky a souhrnný dopad.", "Při prodloužení zvolte Automaticky dle scénáře, Cílit na X % MF nebo Vlastní nový nájem. Automatický režim použije vyšší z dosavadního nájmu, růstové cesty a postupného přiblížení k tehdejšímu MF; nájem automaticky nesnižuje. Cíl podle MF a vlastní nájem jsou explicitní rozhodnutí uživatele.", "Při přeobsazení nastavte headline rent jako X % MF v okamžiku expirace a počet měsíců vacancy. Vacancy nesnižuje headline rent, ale po zadanou dobu vynuluje expected collection dané jednotky.", "Příklad: nájem 15 000 Kč, MF v okamžiku expirace 18 000 Kč a cíl 95 % MF vytvoří nový headline rent 17 100 Kč. Při jednom měsíci vacancy zůstává headline rent 17 100 Kč, ale expected collection je v prvním měsíci přeobsazení nulové.", "Přepínač MF pouze skrývá nebo zobrazuje čárkovanou křivku; nemění výpočet. Křivka je dostupná při úplném pokrytí vybraných smluv; chybějící pokrytí nepovažujte za nulový potenciál ani nulový trh.", "Roční růst trhu mění budoucí MF vždy k 1. lednu. Jde o vlastní odhad, nikoli prognózu MF. Konzervativní −1 %, základní 2 % a optimistický 4 % jsou upravitelné pracovní předpoklady.", "Doba přiblížení k dnešnímu trhu je samostatný předpoklad a delší horizont neposouvá cenové události. Nad pět let lze přepnout měsíční body a roční přehled měsíčních částek. Dvacetiletá simulace je hrubý odhad, nikoli příslib výnosu.", "Náklady a úvěry: současný panel cashflow používá ručně zadané předpoklady. Chybějící údaj nepovažujte za nulový výdaj; domovní náklad potřebuje doložený podíl jednotky a nesmí se započítat znovu.", "Historické uložené scénáře v1, v2 a v3 zachovávají původní výpočet. Nové revize ukládají samostatně režim prodloužení, cílové procento MF nebo vlastní nájem, reletting a vacancy.", "Přepněte konzervativní, základní a optimistický scénář a vždy čtěte jeho viditelné předpoklady. Změny formuláře se přepočítají automaticky a nemění evidenci.", "Ve smluvní křivce zkontrolujte pevnou indexaci a expirace; po konci smlouvy smluvní příjem klesá na nulu, zatímco plán pracuje se zvolenou strategií pokračování.", "Uložte projednávanou variantu jako koncept; tím zmrazíte datum, rozsah, smluvní vstupy, vlastní předpoklady i MF referenci.", "Schválenou revizi používejte jako rozhodovací podklad. Další variantu zakládejte jako novou revizi, aby původní rozhodnutí zůstalo dohledatelné.", "Po schválení zkontrolujte dry-run náhled převodu. Rozlišuje návrhy k posouzení dodatku, smlouvy vyžadující nejprve obnovu, konflikt s indexací a jednotky beze změny; sám nic nezapisuje.", "Pro jednu způsobilou smlouvu připravte návrh změny, doplňte první den účinnosti a právní důvod. Na samostatné kontrolní obrazovce změnu potvrďte až po kontrole částky; potvrzení verzovaně změní nájemné a synchronizuje jen budoucí neuhrazené, automatické předpisy."],
    check: "Uložení, schválení ani dry-run forecastu nesmí změnit smlouvu, složku předpisu nebo předpis. Skutečný převod musí být jednotlivý, dvoukrokový, auditovaný a zablokovat expiraci, mezitím změněné nájemné, kolizi s indexací i uhrazený či ručně upravený budoucí předpis.",
    href: "/reporty",
  },
  {
    slug: "naklady-a-uvery",
    category: "Asset management",
    title: "Náklady, investice a úvěry",
    summary: "Jednotná evidence ročního rozpočtu, skutečných a plánovaných OPEX/CAPEX nákladů a datovaných stavů úvěrů.",
    audience: "Asset manager",
    steps: ["Bankovní výdaje otevřete z Náklady a úvěry. Importujte UTF-8 CSV podle uvedené hlavičky; použijte stabilní ID banky, výdaj záporně a vratku kladně. Nájemní příjmy sem nepatří. E-mailové notifikace dnes dokládají jen příchozí nájemné; úplnost výdajů kontrolujte proti výpisu.", "Před založením nového nákladu vyhledejte existující fakturu. Jednu platbu můžete postupně rozdělit mezi více faktur, jednu fakturu hradit více platbami. U každého pohybu zůstává nerozdělený zůstatek.", "Nový náklad z banky vzniká jako objednaný. Připojte fakturu, ověřte datum vzniku a rozdělení na jednotky a teprve potom potvrďte ACTUAL. ACTUAL není potvrzení zaplacení; úhrada nemění nákladové období ani výši nákladu.", "Zálohu dodavateli, vlastní převod, vratku kauce a jistinu úvěru zařaďte samostatně. Zálohu při přijetí faktury stornujte s důvodem a stejný pohyb připojte k faktuře. Úrok patří do nákladu odděleně od jistiny; bankovní klasifikace sama neaktualizuje zůstatek úvěru ani kauci.", "Dobropis dokládejte přílohou a opravou výsledné částky původního nákladu s důvodem; samostatně připojte skutečnou bankovní vratku. Přeplatek se ukáže k vrácení. Storno přiřazení zachovává původní záznam, autora a důvod; následné přiřazení je nový záznam.", "Výpis sdíleného účtu importujte vždy u stejného domu. Pro přiřazení nákladu jinému domu musíte mít oprávnění k oběma a cílový dům musí mít aktivně přiřazený stejný účet vlastníka.", "Ekonomické KPI započtou náklad jednou přes jeho stávající rozdělení. Bankovní úhrady jej nepřičítají podruhé. Roční podklady rozlišují ACTUAL náklady podle data vzniku a úhrady podle bankovního data, včetně meziročních plateb. Úplnost všech účtů a daňovou klasifikaci potvrzuje účetní.", "Založte schválený roční rozpočet odděleně od pracovních plánů.", "Oddělte provozní náklady OPEX od investic CAPEX a u nákladu určete celý objekt nebo konkrétní jednotku.", "Společný náklad rozdělte rovnoměrně, podle plochy nebo vlastními podíly; před uložením ověřte součet 100 %.", "Ke skutečné částce připojte číslo a soubor účetního podkladu.", "Nový zůstatek, sazbu a splátku úvěru vždy zapište s datem do historie.", "Tržní ocenění ukládejte jako nový datovaný stav se zdrojem; starší ocenění nepřepisujte.", "NOI, cashflow, yield, ROE, LTV a DSCR čtěte jako indikativní LIVE run-rate podle definice na kartě, nikoli jako účetní závěrku.", "Ve finančních alarmech řešte nejprve kritické překročení LTV 70 %, DSCR pod 1,00×, rozpočtu nad 100 % a prošlou fixaci; potom varování a chybějící podklady.", "Před reportem zkontrolujte odchylku rozpočtu, úplnost dokladů, ocenění a datum posledního stavu každého úvěru."],
    check: "Každá částka má objekt, období, stav a dohledatelný zdroj; plán se nevydává za skutečnost a finanční alarm vede přímo k místu nápravy.",
    href: "/portfolio",
  },
  {
    slug: "vyuctovani-sluzeb",
    category: "Finance",
    title: "Vyúčtování služeb",
    summary: "Podklady, odečty, pravidla rozúčtování a srozumitelný protokol pro nájemníka.",
    audience: "Správce nájmů",
    steps: [
      "Otevřete vyúčtování přímo ze smlouvy a zvolte uzavřené období nejvýše 12 měsíců. Rozlišujte předepsané zálohy, skutečně uhrazené zálohy a náklady; inkaso celého předpisu není samo o sobě výše zálohy na služby.",
      "V nemovitosti otevřete Podklady vyúčtování, připojte originál faktury nebo externího výsledku a samostatně potvrďte přepis. Používejte náklad dodávky před odečtením záloh dodavateli. Potvrzení podkladu nevytvoří předpis, kredit ani platbu.",
      "Pro domovní náklady založte Pravidla rozúčtování podle služby a data platnosti. Aplikace podporuje rozdělení podle spotřeby měřidel, plochy × času a osobodnů. Externí výsledek nebo ruční doložené rozdělení zadejte samostatnými řádky konkrétních jednotek; tyto metody se automaticky nedopočítávají.",
      "Na detailu potvrzeného domovního podkladu u nákladového řádku vyberte Pravidlo rozdělení a zvolte Spočítat a potvrdit rozdělení. Jde již o uložení rozdělení, nikoli pouhý náhled. Potvrzené částky a použitý základ se uchovají; opravu podkladu řešte novou verzí s důvodem.",
      "Pro osobodny doplňte časovou evidenci osob, pro plochu údaje jednotek. Spotřební pravidlo vyžaduje podružná měřidla, právě jedno hlavní domovní měřidlo daného média a hraniční odečty. Součet podružných spotřeb nesmí překročit hlavní měřidlo. Při střídání nájemníků zkontrolujte použitý časový podíl; není náhradou předávacího odečtu.",
      "V jednotce u měřidla zadejte osobní či dálkový odečet nebo výslovně odůvodněný odhad. Fotografii či PDF protokol nahrajte do dokumentů jednotky a připojte k odečtu. Oprava zachovává původní záznam a vyžaduje důvod. Bez přesných odečtů na hranicích období aplikace spotřebu pro vyúčtování sama nedopočítává. Výměnu evidujte novým měřidlem; automatické propojení spotřeb přes výměnu není součástí tohoto postupu.",
      "Teplo se v tomto postupu nepřepočítává z ručních odečtů; přebírá se potvrzený odborný výsledek. U všech služeb ověřte zdroj, období a přiřazení. Po prvním potvrzeném podkladu domu se OPEX náklady do náhledu nepřičítají; doplňte proto potřebné podklady i pro ostatní období.",
      "Zkontrolujte blokátory a uložte pracovní protokol. Vystavení protokolu zmrazí podklady; pracovní náhled je read-only a uložený pracovní protokol zůstává neměnný; jejich vytvoření nemění předpisy, kredity ani platby. Návrh označený NEURČENO K ÚHRADĚ není hotovým vyúčtováním k doručení.",
      "Na protokolu zvolte 1. Uzavřít skutečné úhrady. Uzávěrka načte aktuální podklady a vytvoří samostatný snímek. Zkontrolujte potvrzeně uhrazené zálohy a blokátory; částečné bankovní platby a nebankovní zápočty mohou bránit schválení. Nevydávejte předepsané zálohy za zaplacené.",
      "Po úspěšné kontrole zvolte 2. Schválit vyúčtování a Vytisknout / uložit PDF. Po skutečném doručení zvolte 3. Zaznamenat doručení, doplňte způsob, referenci a případný termín námitek. Záznam doručení sám neposílá e-mail ani datovou zprávu.",
      "Námitku a její vyřízení zapište do protokolu. Dokud běží zadaná lhůta nebo zůstává nevyřešená námitka, finanční vypořádání je zablokované. Poté zvolte 4. Finančně vypořádat: vznikne samostatný předpis nedoplatku nebo evidence přeplatku, případně nulový výsledek. Tento krok neodesílá bankovní platbu.",
    ],
    check: "Každá částka má dohledatelný zdroj a rozdělení. Konečný výsledek vychází z potvrzeně uhrazených záloh; schválení, skutečné doručení, námitky a finanční vypořádání jsou doložené samostatně.",
    href: "/smlouvy",
  },
  {
    slug: "rocni-podklady",
    category: "Finance",
    title: "Roční podklady vlastníka",
    summary: "Kontrolní balíček přijatých úhrad, evidovaných nákladů, samostatných bankovních úhrad nákladů, dokladů a úvěrových mezer před předáním účetnímu.",
    audience: "Vlastník a finanční správce",
    steps: ["Vyberte jednoho právního vlastníka a uzavřený kalendářní rok.", "Příjmy ověřte podle přiřazených bankovních úhrad. Evidované náklady vycházejí ze stavu Skutečnost a data vzniku; samostatná tabulka úhrad používá bankovní datum, i když náklad vznikl v jiném roce. Obě tabulky nesčítejte jako další náklady.", "Doplňte účinné intervaly vlastnických podílů; ke každému datu musí úplná struktura dát 100 %.", "Doplňte rozdělení společných nákladů, účetní doklady a stav odborné kontroly každé klasifikace.", "U úvěru zapište skutečně zaplacený roční úrok a připojte účetní doklad; sazba ani jistina nejsou náhradou výpisu.", "CSV předejte účetnímu jako pracovní zdroj, ne jako hotové daňové přiznání."],
    check: "Balíček nemá blokátor, náklady mají doklady a bankovní úhrady odpovídají výpisům. Odborník ověřil úplnost všech účtů, skutečného plátce, kategorizaci, historické vlastnictví i daňové zacházení.",
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
    summary: "Interní příprava korporátního příběhu, hodnoty portfolia, kapitol nemovitostí a kontrolovaného PDF z uzavřených Q4 datových záznamů.",
    audience: "Vedení, asset manager a interní reporting",
    steps: ["Zvolte aktivní reportovací skupinu a uzavřený rok; založením reportu se zmrazí přesný rozsah nemovitostí a jejich Q4 datové záznamy k 31. prosinci.", "V konceptu doplňte slovo zakladatele, shrnutí roku, investiční tezi, tvorbu hodnoty, výhled, hodnotu aktiv, dluh, exity a údaje o akcii.", "U každé nemovitosti oddělte počáteční, koncovou a cílovou hodnotu, investiční případ, tvorbu hodnoty, výhled exitu a poznámku ke zdroji.", "Před odesláním ke kontrole odstraňte všechny blokátory úplnosti a ověřte provenienci zmrazených dat v příloze.", "Ve stavu Ke kontrole otevřete deterministický PDF náhled; administrátor musí potvrdit jeho vizuální kontrolu před publikací.", "Publikovanou revizi neupravujte. Potřebnou opravu založte jako novou revizi, aby původní PDF, uložené verze dat i auditní stopa zůstaly zachované."],
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
    steps: ["Hodnoťte všechna oprávněně spravovaná aktiva bez ohledu na vlastníka, konsolidaci nebo zamýšlený prodej.", "Určete současný fyzický stav písmenem A–D a samostatně zvolte naléhavost investice.", "Doplňte realistický odhad CAPEX, stav plánu obnovy a u plánované či probíhající akce cílový termín.", "Poznámkou popište rozsah nebo zdroj odhadu tak, aby další hodnotitel dokázal rozhodnutí ověřit.", "Při změně stavu vytvořte nové hodnocení. Starší hodnocení se nepřepisuje; distribuční připravenost a valuace mají vlastní proces.", "Teprve schválený aktuální plán s kladnou částkou a termínem převeďte do realizace. Jedním krokem vznikne propojený úkol údržby, plánovaný CAPEX náklad a rozpočtová položka; opakovaný převod systém zablokuje.", "Realizaci zahajte a dokončete pouze z modulu Kvalita a CAPEX. Zahájení přepne úkol a náklad do průběhu; dokončení zapíše skutečnou částku, uzavře úkol a ukáže odchylku proti původnímu plánu. Historické události se nepřepisují.", "V CAPEX výhledu kontrolujte zvlášť položky po termínu, pětiletý horizont, pozdější záměry a položky bez termínu. Rozpad Záměr / Schváleno / V realizaci vychází vždy z posledního hodnocení a událostí realizace.", "Skutečnost a odchylka se počítají pouze z dokončených realizací v daném roce. Výhled je provozní plán, nikoli účetní či daňový podklad, a nemá vazbu na interní Distribuci."],
    check: "Každá jednotka má aktuální datované hodnocení, zdůvodněný CAPEX a dohledatelný stav plánu; schválená realizace má právě jeden úkol, náklad a rozpočtovou položku. Dokončená realizace má skutečný náklad a viditelnou odchylku vůči neměnnému plánu. Součet časových košů odpovídá aktivním plánům a technický stav ani výhled se nevydávají za valuaci, účetnictví nebo distribuční rozhodnutí.",
    href: "/portfolio/kvalita",
  },
  {
    slug: "prodejni-benchmark",
    category: "Asset management",
    title: "Orientační prodejní benchmark",
    summary: "Kvartální reference realizovaných a nabídkových cen bytů na úrovni katastrálního území pro trend, valuaci a scénáře portfolia.",
    audience: "Super-admin a asset manager",
    steps: ["Super-admin ukládá každý zdroj jako samostatný datovaný snímek. Realizovaný průměr z cenové mapy a medián aktivních nabídek se nikdy neslévají do jedné hodnoty.", "Zdrojové území mapujte na stejné katastrální území, které používá MF benchmark nájemného. Nepřesné, vícenásobné nebo nenamapované vazby výslovně označte; nenamapovaný snímek nevstupuje do KPI.", "U každého snímku zachovejte období trhu, zdrojové okno, počet vzorků, cenu za m², odkaz, verzi parseru a metodiky, čas načtení a kontrolní hash. Opakovaný shodný import nic nepřepisuje.", "Důvěru čtěte podle velikosti vzorku: vysoká od 20, střední 8–19, nízká 3–7 a nedostatek dat pod 3. Jde o provozní pravidlo kvality, nikoli statistický interval spolehlivosti.", "Benchmark hodnoty jednotky vzniká jako plocha × realizovaná cena za m². Chybějící plocha, lokalita nebo realizovaný snímek znamená chybějící výsledek, nikdy nulu.", "Nabídkové ceny slouží jen jako doplňkový signál. Asset KPI zobrazujte zvlášť od potvrzeného ocenění a vždy s kvartálem, pokrytím a důvěrou.", "Benchmark nikdy automaticky nepřepisuje schválenou valuaci jednotky. Asset manager musí návrh pro každou jednotku výslovně potvrdit; tím vznikne nový datovaný stav s referencí na použitý snímek.", "Hypotetický výnos při prodeji je scénář: od benchmarkové hodnoty odečtěte zadané transakční náklady, daňovou rezervu, další rezervu a evidovanou jistinu úvěru. Není účetním ani daňovým výpočtem.", "Automatické získávání dat zapněte až po potvrzení podporovaného přístupu, licence, limitů a stabilní metodiky. Do té doby používejte auditovaný ruční nebo CSV import; počáteční čtvrtletí může být označeno jako částečná základna."],
    check: "Každý výsledek má zdroj, období, územní mapování, počet vzorků a auditní stopu; realizované a nabídkové ceny zůstávají oddělené a benchmark se nevydává za individuální odhad ani automatickou prodejní cenu.",
    href: "/nastaveni/cenovy-benchmark",
  },
  {
    slug: "osobni-oceneni-jednotky",
    category: "Asset management",
    title: "Osobní orientační hodnota a kontrolní ocenění jednotky",
    summary: "Jak čtvrtletně zaznamenat vlastní tržní odhad a oddělit ho od oficiálního ocenění a plánovaného exitu.",
    audience: "Vlastník a uživatel s přístupem k jednotce",
    steps: [
      "Na kartě jednotky otevřete Sreality, Reas nebo jiný zdroj ve vlastním prohlížeči; ověřte přesné území, zda jde o realizované či nabídkové ceny a jakou plochu průměr zahrnuje.",
      "Při čtvrtletním zápisu uveďte datum odečtu, období trhu (například předchozí 3 nebo 12 měsíců), cenu za m², počet transakcí, zdrojový odkaz a případné omezení srovnatelnosti.",
      "Dvanáctiměsíční klouzavé okno odečtené každé čtvrtletí není cena obchodů uskutečněných pouze v jednom čtvrtletí. Při malém počtu transakcí se údaj může výrazně měnit; výsledek je hrubý orientační odhad, nikoliv přesná cena vašeho bytu.",
      "Bankovní nebo odborné ocenění zapište zvlášť jako datovaný checkpoint s identifikací podkladu. Zůstává poslední potvrzenou osobní hodnotou, dokud nezadáte nový checkpoint; pozdější mapový údaj jej automaticky nenahradí.",
      "Osobní údaje vidíte jen vy; nepřepisují společný index ČSÚ, KPI jiných uživatelů ani ručně zadaný plánovaný exit v distribučních reportech FlatCloud.",
    ],
    check:"Zdroj, rozsah, stáří a nejistota jsou čitelné; orientační místní cena a kontrolní ocenění jsou dvě oddělené historie.",
    href:"/portfolio",
  },
  {
    slug: "valuace-jednotek",
    category: "Asset management",
    title: "Valuace jednotek pro distribuci",
    summary: "Oddělená historie tržní hodnoty jednotlivé jednotky, zdroje ocenění a kontrolního přepočtu na m².",
    audience: "Interní asset manager",
    steps: ["Nejdřív doplňte plochu, samostatné technické hodnocení a odhad potřebného CAPEX.", "Zvolte zdroj valuace: interní srovnání, externí posudek, nabídkovou cenu, realizovanou transakci nebo výslovně potvrzený lokální benchmark.", "U benchmarku ověřte katastrální území, kvartál, počet vzorků a důvěru. Systém jej bez potvrzení asset managera do historie valuace nepřevede.", "Uveďte datum a dohledatelnou referenci; interní srovnání popište v poznámce.", "Novou informaci uložte jako další hodnocení, původní hodnotu nepřepisujte.", "Hodnotu Kč/m² používejte jako kontrolu konzistence, ne jako samostatný zdroj ocenění."],
    check: "Poslední valuace má datum, zdroj a referenci a není zaměněna s technickým ratingem, CAPEX ani automatickou prodejní cenou.",
    href: "/distribuce",
  },
  {
    slug: "crm-distribuce",
    category: "Asset management",
    title: "CRM zájemců pro distribuci",
    summary: "Interní vedení zájemce od prvního kontaktu přes prohlídku a nabídku až k rezervaci nebo uzavření.",
    audience: "Interní distribuční tým",
    steps: ["Otevřete Zájemci v levém menu nebo Distribuce → Přehled zájemců. Jeden kontakt může mít více samostatných příležitostí; přehled ukazuje jejich jednotky, fáze, termíny a poznámky.", "Hledejte kontakt podle jména, e-mailu, telefonu nebo zdroje. Filtry domu, jednotky, fáze a termínu se kombinují nad stejnou příležitostí. Bez příležitosti v přehledu zahrnuje kontakty bez vazby na aktivní dům interní distribuce; s filtrem jednotky nebo fáze nemají výsledek.", "Dnes není po termínu. Příštích 7 dní začíná zítřkem; datum dneška je v pásmu Europe/Prague. Termínové filtry vynechávají uzavřené a ztracené příležitosti. Souhrnné ukazatele zůstávají za celý adresář.", "Kontakt upravte přímo v přehledu. Detail a úprava příležitosti přejde na její řádek níže s cenou, opcí a historií. Přidat příležitost předvyplní vybraný kontakt.", "Založte zájemce až s alespoň jedním použitelným kontaktem a uveďte zdroj.", "Zájem o každou jednotku veďte jako samostatnou příležitost; nabídkovou cenu můžete převzít z poslední valuace, ruční hodnotu však systém bez výslovného pokynu nepřepíše.", "Nastavte věcnou fázi, cenu a konkrétní datum dalšího kroku.", "Opci veďte odděleným stavem. Nabídnutá nebo podepsaná opce vyžaduje cenu a platnost; podepsaná či využitá také referenci dokumentu.", "Po každé změně zkontrolujte neměnnou historii funnelu s původní a novou fází, stavem opce a autorem.", "Rezervaci v CRM nepovažujte za právní rezervaci a bez samostatného souhlasu neposílejte automatickou komunikaci."],
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
  { term: "LIVE stav", aliases: ["aktuální stav", "dnešní stav"], definition: "Aktuální provozní pohled přepočtený z dnešních dat. Není historickým záznamem ani účetní závěrkou.", chapterSlug: "reporting-distribuce" },
  { term: "Uložený stav", aliases: ["zmrazená data", "datový otisk"], definition: "Neměnný datovaný otisk vstupů použitý pro reprodukovatelný report nebo rozhodnutí.", chapterSlug: "vyrocni-report" },
  { term: "Stav k 31. prosinci", aliases: ["Q4", "uzavřená roční data"], definition: "Uzavřený stav nemovitosti k 31. prosinci, který je zdrojem výročního reportu za daný rok.", chapterSlug: "vyrocni-report" },
  { term: "OPEX", aliases: ["provozní náklad"], definition: "Výdaj související s běžným provozem a správou aktiva; v evidenci zůstává oddělený od investičního CAPEX.", chapterSlug: "naklady-a-uvery" },
  { term: "CAPEX", aliases: ["investiční náklad", "investice"], definition: "Investiční výdaj na pořízení, obnovu nebo významné zhodnocení aktiva; plán a skutečnost se evidují odděleně.", chapterSlug: "kategorizace-jednotek" },
  { term: "Roční nájemné", aliases: ["annual rent", "roční run-rate nájemného"], definition: "Indikativní roční nájemné odvozené z aktuálního měsíčního čistého nájemného. Nezohledňuje budoucí expirace ani neobsazenost.", formula: "Měsíční čisté nájemné × 12", chapterSlug: "naklady-a-uvery" },
  { term: "NOI", aliases: ["čistý provozní výnos"], definition: "Indikativní provozní výnos před financováním a daněmi. V aplikaci jde o LIVE run-rate, ne účetní závěrku.", formula: "Roční nájemné − skutečný OPEX za posledních 12 měsíců", chapterSlug: "naklady-a-uvery" },
  { term: "Cashflow", aliases: ["peněžní tok po dluhové službě"], definition: "Indikativní částka, která zbývá z NOI po odečtení evidované roční dluhové služby. Nezahrnuje daně ani neevidované výdaje.", formula: "NOI − roční dluhová služba", chapterSlug: "naklady-a-uvery" },
  { term: "Yield", aliases: ["výnosnost aktiva"], definition: "Poměr indikativního NOI k poslední evidované tržní hodnotě aktiva. Výsledek závisí na úplnosti OPEX a datu ocenění.", formula: "NOI ÷ tržní hodnota × 100 %", chapterSlug: "naklady-a-uvery" },
  { term: "ROE", aliases: ["return on equity", "výnosnost vlastního kapitálu"], definition: "Poměr indikativního cashflow k vlastnímu kapitálu odvozenému z evidované tržní hodnoty a nesplacené jistiny.", formula: "Cashflow ÷ (tržní hodnota − nesplacená jistina) × 100 %", chapterSlug: "naklady-a-uvery" },
  { term: "LTV", aliases: ["loan-to-value"], definition: "Poměr nesplacené jistiny úvěru k evidované hodnotě aktiva; závisí na datu obou vstupů.", formula: "Nesplacená jistina ÷ tržní hodnota × 100 %", chapterSlug: "naklady-a-uvery" },
  { term: "DSCR", aliases: ["debt service coverage ratio"], definition: "Poměr NOI k evidované roční dluhové službě. Hodnota pod 1,00× je kritický finanční alarm.", formula: "NOI ÷ roční dluhová služba", chapterSlug: "naklady-a-uvery" },
  { term: "Prodejní benchmark", aliases: ["cenový benchmark", "orientační valuace"], definition: "Kvartální orientační cena bytů za m² pro katastrální území. Je oddělená od individuálního ocenění a bez potvrzení nepřepisuje valuaci jednotky.", formula: "Plocha jednotky × realizovaná cena za m²", chapterSlug: "prodejni-benchmark" },
  { term: "Realizovaná cena", aliases: ["transakční cena"], definition: "Agregovaná cena skutečně uskutečněných převodů ve zdrojovém období. V benchmarku je primární referencí pro výpočet orientační hodnoty.", chapterSlug: "prodejni-benchmark" },
  { term: "Nabídková cena", aliases: ["asking price"], definition: "Cena požadovaná v aktivní nabídce. Je doplňkovým tržním signálem a nemusí odpovídat konečné realizované ceně.", chapterSlug: "prodejni-benchmark" },
  { term: "Důvěra benchmarku", aliases: ["confidence", "velikost vzorku"], definition: "Provozní označení založené na počtu zdrojových pozorování: vysoká od 20, střední 8–19, nízká 3–7 a nedostatek dat pod 3.", chapterSlug: "prodejni-benchmark" },
  { term: "Konsolidační podíl", aliases: ["podíl FlatCloud"], definition: "Potvrzený podíl, kterým aktivum vstupuje do korporátních KPI FlatCloud; není totožný s rozsahem svěřené správy.", chapterSlug: "vice-vlastniku" },
  { term: "Příležitost", aliases: ["opportunity", "zájem o jednotku"], definition: "Samostatně vedený zájem konkrétního zájemce o jednu jednotku, včetně fáze, ceny a dalšího kroku.", chapterSlug: "crm-distribuce" },
  { term: "Opce", aliases: ["option"], definition: "Interně evidovaná nabídka nebo smluvní právo s cenou, platností a případně referencí dokumentu; sama nenahrazuje právní kontrolu.", chapterSlug: "crm-distribuce" },
  { term: "Reportovací skupina", aliases: ["reporting group"], definition: "Řízený rozsah nemovitostí a oprávnění použitý pro kvartální a výroční reporting.", chapterSlug: "vyrocni-report" },
  { term: "Revize reportu", aliases: ["verze reportu"], definition: "Nová neměnná verze reportu. Publikovaná revize se neopravuje přepisem.", chapterSlug: "vyrocni-report" },
  { term: "PII", aliases: ["osobní údaje"], definition: "Údaje umožňující identifikovat člověka. Agregovaný distribuční report je nesmí obsahovat.", chapterSlug: "reporting-distribuce" },
  { term: "Uvítací dopis", aliases: ["welcome letter", "postprodejní e-mail"], definition: "Verzovaná a auditovaná komunikace novému vlastníkovi navázaná na konkrétní uzavřený prodej, datum nabytí, dům, jednotku a prodávající SPV.", chapterSlug: "uvitaci-dopis-vlastnikovi" },
];

export const methodologyMediaBriefs: MethodologyMediaBrief[] = [
  { kind: "Video", title: "Od Q4 datového záznamu k výročnímu reportu", duration: "6–8 min", purpose: "Ukázat interní editor, kontrolu úplnosti, PDF náhled a založení nové revize.", outline: ["Výběr skupiny a roku", "Zmrazená data a editace", "Kontrola a publikace"], chapterSlug: "vyrocni-report" },
  { kind: "Podcast", title: "Co znamenají NOI, LTV a DSCR", duration: "12–15 min", purpose: "Sjednotit interpretaci finančních KPI a vysvětlit jejich datové limity.", outline: ["Definice metrik", "Datované vstupy", "Alarmy a lidské rozhodnutí"], chapterSlug: "naklady-a-uvery" },
  { kind: "Video", title: "Roční podklady vlastníka bez záměny za daňové přiznání", duration: "5–7 min", purpose: "Provést kontrolou příjmů, nákladových dokladů, úvěrových mezer a exportu CSV.", outline: ["Uzavřený rok a vlastník", "Blokátory a doklady", "Pracovní export pro účetního"], chapterSlug: "rocni-podklady" },
  { kind: "Podcast", title: "LIVE funnel versus historie pohybů", duration: "10–12 min", purpose: "Vysvětlit dva odlišné řezy distribuční pipeline a pravidla agregace bez PII.", outline: ["Dnešní stav", "Neměnné události", "Bezpečný reporting"], chapterSlug: "reporting-distribuce" },
];

export function methodologySearchText(value: MethodologyGlossaryTerm | MethodologyMediaBrief) {
  if ("term" in value) return `${value.term} ${value.aliases.join(" ")} ${value.definition} ${value.formula || ""}`;
  return `${value.kind} ${value.title} ${value.duration} ${value.purpose} ${value.outline.join(" ")}`;
}
