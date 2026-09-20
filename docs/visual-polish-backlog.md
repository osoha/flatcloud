# Vizuální polish — odložený backlog

## Lidské review Flatberry po R31 — 20. 9. 2026 (pouze evidence)

Tyto připomínky nyní NEIMPLEMENTOVAT. Uživatel bude přidávat další a následně spustí samostatný blok grafiky a UX. Funkční administrátorská pipeline pokračuje odděleně.

- **FB-01 — Avatar objektu:** kresba je po R31 příliš velká. Mírně ji zmenšit; cílem není návrat k původní téměř prázdné dlaždici. Velikost znovu posoudit podle screenshotu `b178be4c-570c-4f66-847e-3bd14873cd27.png`. H1 tímto požadavkem neměnit.
- **FB-02 — Bubliny v reportech:** přehodnotit zejména „LIVE · Data k …“ a „Provozní KPI · napříč vlastníky“ pod H1. Navrhnout zjednodušení, přesun či odstranění podle informačního významu, ne pouze další změnu barvy. Reference `950857ee-35e5-46cd-88b1-75ef1ff0bc29.png`.
- **FB-03 — Nefunkční výzvy k akci:** projít celou aplikaci a doplnit skutečné prolinkování textů typu „Otevřete nastavení“. Konkrétně Administrace: Bankovní schránka a Odesílání e-mailů. Odkaz musí vést přímo k odpovídajícímu nastavení a fungovat i z klávesnice. Reference `97f67fde-5c3c-4f50-a7e3-d4254a0965a9.png`. I tato položka je na výslovný pokyn zatím jen evidovaná.

### Doplnění 20. 9. 2026 — UX, reporty, spotřeby a interní distribuce

**Stav všech FB-04 až FB-22: EVIDOVÁNO, NEIMPLEMENTOVAT nyní.** Společný budoucí blok obsahuje i funkční rozšíření; nejde pouze o CSS. Stávající uživatelský blok R32 pokračuje samostatně. Návrhy řešení níže nejsou tvrzením o hotové implementaci.

- **FB-04 — Trendy u KPI (funkční rozšíření):** navázat na schválený návrh s ikonou trendu, rozdílem a srovnávaným obdobím. Ověřit historická data, srovnatelný rozsah objektů i část období; rozlišovat procenta a procentní body, směr změny a její příznivost. Chybějící data nenahrazovat nulou. Současné Portfolio obsahuje dílčí `KpiTrend` pro inkaso, nikoli kompletní pokrytí všech KPI.
- **FB-05 — Upravit kartu:** nahradit „Vzhled objektu / jednotky“ názvem **„Upravit kartu“**. Tooltip např. „Změnit barvu karty nebo titulní obrázek“. Titulní obrázek / ikona avatara má otevřít stejný editor fotografie, avatara a barvy. Zachovat samostatnost oblíbených/označených objektů a jejich přednostního řazení; barvu volí uživatel ručně.
- **FB-06 — Historie jednotky mimo rozměr:** sjednotit šířku a odsazení spodní historie vlastnictví s ostatními kartami jednotky, prověřit responsivitu a přetékání. Screenshot `95e97148-869d-43ad-aff2-b2c1d7af86f8.png`.
- **FB-07 — Nájemní vztahy místo Tenancy:** použít srozumitelný český název, návrh „Nájemní vztahy“ / „Přehled nájemních vztahů“. Před sloučením s reportem Smlouvy porovnat sloupce, filtry, poznámky, odkazy a exporty. Převést přidanou hodnotu Smluv do společného reportu, zachovat staré odkazy a odstranit duplicitní položku navigace.
- **FB-08 — Souhrnná karta KPIs pro všechny oprávněné vlastníky (nová funkce):** NOI, ROE, Yield, hodnota nemovitosti a další relevantní ukazatele podle evidovaných nákladů, financování a hodnot. Oddělit obecné ukazatele vlastníka od konsolidace a vyhrazených reportů FlatCloud. Upřesnit definice, vstupy, období a chování při neúplných datech; chybějící hodnoty označit. Samotná absence úvěru nemá blokovat ukazatel, který jej nepotřebuje. Toto zadání nyní neotevírá korporátní reporty externím uživatelům.
- **FB-09 — České názvosloví místo snapshot:** projít uživatelské rozhraní napříč aplikací; překládat podle kontextu, např. „záznam hodnocení“, „stav k datu“, „uzavřená verze reportu“. Interní názvy modelů/API nemusí být přejmenovány. Zachovat význam historie a uzavřených verzí.
- **FB-10 — Rozsypané hodnocení kvality:** opravit formulář Nové hodnocení kvality, zarovnání datumových polí a nápověd, nadměrnou prázdnou výšku a responsivitu. Akce má srozumitelně říkat „Uložit hodnocení“. Screenshot `fa8dd035-d359-413b-b798-d494c365aeff.png`.
- **FB-11 — Revize a protokoly:** zpřehlednit přidání, nalezení a případné dodatečné připojení skenu/PDF přímo u provedené revize, včetně návaznosti na Dokumenty. Zjištěný stav kódu: detail nemovitosti → Provoz → Revize a povinné kontroly → Provedeno již obsahuje pole „Revizní protokol“; server ukládá přílohy s `complianceRecordId` a kategorií `INSPECTION_PROTOCOL`, historie je zobrazuje. Ověřit dosažitelnost z centrálního seznamu Revize i scénář, kdy protokol dorazí dodatečně. Nezakládat druhou nesouvisející kopii dokumentu.
- **FB-12 — Samostatné bytové měřidlo a oprávnění:** umožnit vytvoření/odečty bez hlavního domovního měřidla a bez oprávnění ke správě celého domu. Zjištěný stav: `parentId` je nepovinný a endpoint pro jednotku vytváří měřidlo bez něj, ale UI `canManageMeters` a server `requireManagedProperty` vyžadují správu domu. Upravit jednotková oprávnění konzistentně v UI i API, otestovat vlastníka jedné jednotky a izolaci ostatních jednotek. Vazba na domovní měřidlo může být volitelná.
- **FB-13 — Spotřeby a odhad nákladů (nová funkce):** monitoring komodit z odečtů podružných měřidel a uživatelem zadané ceny za jednotku; graf vývoje spotřeby/nákladů a srovnání se zálohami, průběžná predikce a podklad pro odhad záloh. Nenahrazuje vyúčtování. Návrh musí zohlednit interval mezi odečty, měrné jednotky, časovou platnost cen, neúplná data, výměnu/reset měřidla, změnu nájemníka a oddělení skutečnosti od odhadu. Inspirace dodaným screenshotem Repilot `93c23c4e-4aca-47b8-a71b-a20c7de26bfc.png`; nejde o ověření funkcí konkurenční služby.
- **FB-14 — Systematická revize doprovodných textů:** odstranit matoucí technické či sebeujišťující popisky typu „data nevedou ven“, „nikdy nerozšiřují přístup“ a podobné texty napříč aplikací, zejména v reportech nemovitostí/jednotek. Zachovat pouze informace, které uživateli pomáhají s konkrétním rozhodnutím. Navazuje na opakované připomínky uživatele, nikoli jen na jeden screenshot.
- **FB-15 — Jedna sekce Reporty a nastavení reportů:** posoudit odstranění duplicitních reportovacích záložek z karet nemovitostí/jednotek. Preferovaný návrh: hlavní Reporty s předvoleným objektem/jednotkou a z detailu pouze kontextový odkaz. Dnešní „Otevřít report“ vede na `/nemovitosti/[id]/reporting?unitId=…`, což je stručný aktuální přehled obsazenosti, nájemného, služeb, dluhu a konce smlouvy, nikoli plnohodnotný samostatný report. Editace MF a historických kvartálních dat již má route Nastavení → Reporty, ale informační architekturu i čtecí sekce je nutné sjednotit; historické kvartální podklady zachovat jen pro oprávněný rozsah FlatCloud.
- **FB-16 — Distribuční matice jednotek:** dostupné hodnocení zobrazovat přímo v tabulce, bez zbytečného rozklikávání. Rozlišit chybějící hodnocení od nízkého hodnocení; používat aktuální platný záznam.
- **FB-17 — CRM zájemců, návaznost na komentář 18. 9. 2026:** dohledaný požadavek uživatele: nefungující „Upravit“ / ořezaný editační panel v posuvné tabulce; databáze zájemců s kontakty pro oslovení a přiřazováním k příležitostem. Evidovat samostatný přehled osob i bez jednotky, vyhledávání a přiřazení k jedné či více příležitostem. Existující CRM obsahuje základ osob a příležitostí; splnění celého požadavku není doloženo a nepovažuje se za hotové v uživatelském bloku R32. Ověřit při společném bloku. Odesílání oslovení není tímto zadáním autorizováno.

- **FB-18 — Noční / tmavý režim celé aplikace:** připravit kompletní tmavou variantu schváleného Flatberry UX. Přepnutí světlý/tmavý jedním kliknutím, dostupné např. ve spodní části levého menu v rozbalené i sbalené podobě, s uložením volby uživatele. Zahrnout Shell, všechny stránky, dialogy, formuláře, tabulky, grafy, avatary bez fotografie, stavové barvy, hover/focus a prázdné stavy. Zachovat barevnou identitu, čitelnost a význam semaforů; nepoužívat prostou inverzi barev. Fotografie a exportované dokumenty řešit odděleně od motivu rozhraní. Pouze evidence pro společný blok.
- **FB-19 — Konzistentní šířka obsahu / ultrawide:** sjednotit rozdílné pevné a roztažené kontejnery napříč stránkami. Nabídnout možnost roztažení obsahu na dostupnou šířku a zapamatovat volbu, zejména pro tabulky a široké monitory. Konkrétní příklad Interní distribuce má velké prázdné boční okraje; screenshot `ac891f6e-779c-4b81-985c-ee3b0f4e1076.png`. Respektovat sbalené menu, mobil a čitelné šířky textových formulářů; ověřit běžný desktop i ultrawide. Pouze evidence.
- **FB-20 — Duplicitní bubliny rozsahu objektů:** u Revizí ponechat pravý selektor rozsahu a odstranit bublinu pod titulkem, která opakuje stejné údaje (např. „Zobrazeno všech 15 dostupných objektů“ vs. „Vše ve správě · 15 objektů“). Stejný audit provést všude, kde se tato duplicita opakuje; navazuje na FB-02 a FB-14. Selektor musí sám srozumitelně ukazovat aktuální rozsah. Screenshot `713e7048-1a8e-4353-bff5-ce344f52af99.png`. Pouze evidence.

- **FB-21 — Explicitní volba avatara domu a jednotky:** první volba **„Obecná ikona“**; možnost **„Automaticky“ úplně odstranit**. Další volby **„Vybrat z nahraných fotografií“** a **„Nahrát nový avatar“** přímo v editoru „Upravit kartu“. Doplnit srozumitelnou nápovědu stejně jako u avatara uživatele a využít stejný způsob automatické úpravy fotografie; při implementaci prověřit a převzít aktuální uživatelský avatarový postup. Platí jednotně pro bytový dům / objekt i bytovou jednotku. Toto novější výslovné zadání nahrazuje starší automatický výběr titulní či první fotografie. Stávající ručně zvolené avatary zachovat; automatické starší nastavení převést podle předem stanoveného pravidla a ověřit. Pouze evidence, implementace až ve společném bloku UX a grafiky.

- **FB-22 — Vrátit prioritu informací na dashboardu Portfolia:** původní pořadí **horní KPI → Vyžaduje pozornost + Stav portfolia → Nemovitosti**. Přesun dlouhého seznamu nemovitostí nad upozornění/sumář uživatel nepožadoval a schovává důležité informace zejména u velkých portfolií. Ověřeno z historie: commit `334297ea09e6030d9f67f58e4b72f3d5fe6b0dcc` (R31, 20. 9. 2026) přesunul tabulku před dashboardový souhrn; předchozí revize měla požadované původní pořadí. Není nutná změna dat ani logiky. Ve společném UX bloku vrátit pořadí také v DOM a zachovat je při mobilním skládání; ověřit krátký i dlouhý seznam. Do spuštění společného bloku pouze evidence.

Tento backlog se otevře až po dokončení funkční opravné pipeline. Nálezy zde nejsou důvodem k průběžnému přestavování funkčních bloků; projdou samostatnou agentní kontrolou v roli grafického designera a následným lidským review.

## VP-01 — Filtry Dokumentů

- Zdroj: lidské review sandboxu, 6. 9. 2026.
- Stránka: Dokumenty.
- Nález: filtrovací karta má na desktopu nepřiměřenou výšku a velkou prázdnou plochu; pole „Datum dokumentu do“ přepadá do druhého řádku, zatímco první řádek nevyužívá dostupnou šířku konzistentně.
- Očekávání pro designerskou vlnu: sjednotit grid, šířky ovládacích prvků, vertikální rytmus a responsivní zalamování s ostatními filtračními panely. Zachovat logické pořadí a přístupné popisky obou dat.
- Stav: opraveno v R11A; široký desktop, střední šířka i mobil mají explicitní grid bez náhodného zalomení.

## VP-02 — Kotvy detailu jednotky

- Zdroj: designerská cloudová kontrola scénářové jednotky, 6. 9. 2026.
- Stránka: Detail jednotky.
- Nález: při přímém otevření `#kvalita`, `#komunikace` nebo `#dokumenty` překryla sticky navigace začátek cílové sekce.
- Stav: opraveno v R11A doplněním jednotného scroll offsetu pro všechny položky lokální navigace.

## VP-03 — Husté provozní tabulky

- Zdroj: designerská cloudová kontrola Kvality, Distribuce a reportu Smluv, 6. 9. 2026.
- Nález: osm a více sloupců se na běžném notebookovém viewportu smrštilo tak, že se názvy objektů, stavy a akce lámaly po několika znacích.
- Stav: opraveno v R11B; husté tabulky mají čitelnou minimální šířku a zůstávají uvnitř existujícího horizontálně posuvného kontejneru.

## VP-04 — Mezera po skrytém sidebaru

- Zdroj: CSS průřez responzivních breakpointů, 6. 9. 2026.
- Nález: mezi 701 a 900 px se sidebar transformací skryl, ale pozdější pravidlo ponechalo hlavnímu obsahu odsazení 196 px.
- Stav: opraveno v R11B; kompaktní shell v celém rozsahu do 900 px používá plnou šířku hlavního obsahu.

## VP-05 — Prázdné stavy a mobilní akce

- Zdroj: průřez globální kaskádou stylů a vstupními formuláři, 6. 9. 2026.
- Nález: pozdější obecné pravidlo zmenšovalo všechny prázdné stavy na parametry kompaktního widgetu; mobilní pravidla současně skrývala sekundární titulkové akce a odebírala text primárním tlačítkům bez ikony.
- Stav: opraveno v R11C; plnostránkové a kompaktní prázdné stavy mají explicitně oddělenou hierarchii a všechny důležité titulkové akce zůstávají na mobilu viditelné a čitelné.

## VP-06 — Nepravdivý popis formátu reportu

- Zdroj: cloudová kontrola skutečného kvartálního náhledu, 6. 9. 2026.
- Nález: aktivní šablona i renderer správně používaly zdrojový poměr FlatCloud 13:9, ale karta editoru stále výstup popisovala jako A4 na šířku.
- Stav: opraveno v R11D; editor používá neutrální popis a samotný náhled zobrazuje konkrétní formát aktivní šablony i správnou cestu pro tiskovou kontrolu.
