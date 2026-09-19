# R26 – vyúčtování: vstupní rozbor a implementační bloky

Ověřeno 15. 9. 2026. Remote `osoha/flatcloud`, cílová větev `sandbox/ux-agent`, HEAD před změnami `d75d64d8131aa377d4d6065ac7290e5f812665e6` (PR110). Čistý checkout, přečten kořenový AGENTS.md; jiné v repozitáři nenalezeny. Pracovní větev R26A. Žádné osobní údaje ani originály vzorů nejsou součástí repozitáře.

## Současná implementace

| Oblast | Existuje | Mezery pro nový rozsah |
|---|---|---|
| Měřidla | Meter, MeterReading; API jednotky; sériové číslo, médium, jednotka, datum, stav, poznámka | Jen unitId, bez hlavního domovního měřidla/hierarchie, autora a metody odečtu, fotky a korekční vazby. Náhled filtruje aktivní měřidla, tedy ztrácí historická vyměněná. |
| Služby | LeasePaymentItem, ChargeItem, kategorie WATER/HEATING/SERVICES/ELECTRICITY | Chybí katalog jednoznačných služeb a časová pravidla; agregovanou SERVICES nelze automaticky rozdělit. |
| Náklady | PropertyCost, dodavatel, číslo dokladu, effectiveAt, přílohy, uložený podíl jednotky | Chybí interval dodávky, dobropisové vazby, potvrzení nákladu vs doplatku a kontrola čerpání zdroje mezi obdobími/smlouvami. |
| Platby | BankTransaction → PaymentAllocation → Charge; oddělené SecurityDepositMovement a LeaseCreditApplication | Přiřazení je na celý předpis, nikoli položku služby. Bez doloženého rozdělení částečné úhrady nelze tvrdit inkaso konkrétní služby. |
| Přílohy | Document → FileAsset, property/unit/lease/cost, soft delete; existující storage | Doplnit vazbu na konkrétní odečet a verzi externího rozúčtování; respektovat stávající přístupová pravidla. |
| Vyúčtování | Pracovní náhled jednotky/smlouvy a neměnný ServiceSettlementProtocol včetně DB triggeru | Původní vystavení vytvářelo Charge/LeaseCredit. Kontrolovalo jen shodné období; náklad podle effectiveAt, zálohy podle měsíce, bez platební uzávěrky. Není to nové zadání. |
| Domácnost | Occupant má active, nikoli interval přítomnosti | Zavést časovou historii; nepřebírat limit čtyř nájemníků. |

## Rozbor pěti příloh

Přečteny buněčné hodnoty a dostupné vzorce tří XLSX (10 + 1 + 1 list), extrahován text obou PDF (3 + 60 stran). Vizuálně zkontrolovány reprezentativní tabulky. Jde o rozbor struktury, vazeb a regresních rizik, nikoli potvrzení správnosti všech odborných výpočtů ISTA. Původní audit komunikace v Repilotu nebyl znovu prováděn.

- Přehled plateb: vedle bankovních příjmů obsahuje samostatnou matici předpisů/úhrad. Poslední částečný měsíc má dluh nájemného i záloh. Předepsaná záloha a skutečná úhrada proto nejsou zaměnitelné.
- Konečné vypořádání: společný součet zahrnuje služby, nájemné a celou jistotu; pro produkt nutno rozdělit na tři oddělené evidence. Dva elektrické registry mají vlastní počáteční stav. Položky i podpisová část vyžadují potvrzení osoby a období; popis „5 měsíců“ nezachycuje přesně částečný závěr nájmu.
- SVJ: tři stránky, jednotlivé služby, hrubý náklad a zaokrouhlení, domovní jmenovatele a podíl jednotky. Časové změny osob používají osobodny. Dva vodoměry jednotky, odečet proveden po konci období. Pojištění a správa nesmí automaticky přejít do nákladů nájemce. Nejasné „ostatní služby“ vyžadují obsahový doklad.
- Domovní XLSX: deset listů, limit čtyř střídání výslovně v návodu. Nalezeno 11 buněk s uloženou chybou dělení nulou. Doklady přesahují rok; odečtení odhadované elektřiny jednoho bytu ze společného nákladu potřebuje transparentní druhý zápis příjemci, nikoli ztrátu částky. Rozdíl hlavního a podružných měřidel, odhad proti měření, osoboměsíce a vzorcové odkazy se nesmí považovat za ověřené. Dřívější audit navíc uvádí lednovou platbu prosincového předpisu a zápočet jistoty.
- ISTA: 60 fyzických stran, 14stránkový domovní souhrn a individuální sestavy/doplňující informace. Dvě otopná období oddělená změnou v září. Rozlišení základní/spotřební složky, korekcí a zaokrouhlení; opakovaný domovní souhrn na individuální sestavě není další náklad. Samostatně voda na TV, ohřev, studená voda a elektřina. Prázdné/nebytové jednotky zůstávají příjemci alokace.

## Bloky a brány

Každý blok: relevantní testy → PR do sandbox/ux-agent → celé CI → merge → ověřit SHA nasazení a živé chování → audit. Žádné zápisy do main/produkce, reálné odesílání ani platby. Sandbox QA značka `R24_AGENT_QA_2026_09`.

1. **R26A: bezpečný pracovní protokol a období.** Oddělit uložení od účtování, neměnný v2 snapshot s chybějícími podklady; historické v1 zachovat. Překryvy všech protokolů smlouvy v serializovatelné transakci, platná data a 12 kalendářních měsíců. Explicitní kontrola nemovitosti v POST. Do dalšího bloku nejde o schválené vyúčtování ani konečné saldo. Uložené pracovní období zatím rezervováno; navazující revize musí být append-only s odkazem na předchůdce, nikoli obejití překryvu.
2. **R26B: služby, faktury a externí výsledky.** Období dodávky, náklad před dodavatelskými zálohami, dobropis, identita dokladu/části, rozdělení přes období. Režim HOUSE/EXTERNAL_UNIT; originál a potvrzené řádky externího výsledku, složky a souhrny s jasnou rolí. Vlastnické položky default OWNER; ruční zahrnutí s výrazným upozorněním, odůvodněním a auditní událostí. Deratizace k individuálnímu posouzení. Žádný vlastní výpočet tepla.
3. **R26C: měřidla a historie.** Rozšířit existující modely: domovní hlavní/podružné, parent, umístění, období osazení, korekce odečtu jako nový záznam; autor, metoda, foto/protokol. Validovat médium/jednotku/chronologii/hierarchii. Výměna nesmí vyvolat zápornou spotřebu ani vymazat staré měřidlo.
4. **R26D: rozúčtování.** Pravidla po službě/období, plochy a osoby v čase, neomezené střídání, prázdné a nebytové jednotky. Voda z odečtů a faktur, viditelný rozdíl hlavní minus podružné včetně doloženého klíče. Externí teplo se pouze převezme; povinný chybějící výsledek = čeká, nikoli nula.
5. **R26E: uzávěrka, úhrady a salda.** Perioda předpisu, datum platby, datum uzávěrky a původ zdroje; doložené rozdělení úhrad po službách. Oddělit nájem, zálohy, zápočty, přenosy, vratky. Zápočet jistoty není bankovní příjem. Kontrolní rovnice a náhrada/převod již evidovaného zálohového dluhu zabrání dvojímu vymáhání.
6. **R26F: schvalování a vypořádání.** Draft → správce → vlastník → evidence doručení → námitky → vypořádání. Append-only schválené verze a korekce. Tenant PDF jen vlastní řádky a bezpečné domovní souhrny. Samostatná idempotentní operace pro návazný předpis/kredit/vratku; žádné automatické e-maily ani skutečné platby v rámci vývoje.

## Anonymizované kontrolní příklady

| Scénář | Očekávání |
|---|---|
| Náklady 30 000, předpis záloh 24 000, skutečně pokryto 22 000 | Službový rozdíl 8 000 obsahuje již evidovaný dluh záloh 2 000; nová změna účetní pozice pouze 6 000. Nikoli dalších 8 000 vedle dluhu. |
| Prosincový předpis, úhrada 5. ledna | K uzávěrce 31. prosince nezahrnout; k 31. lednu zahrnout jednou, stále k prosincovému předpisu. |
| Banka 20 000 + zápočet jistoty 2 000 | Pokryto 22 000, bankovní příjem jen 20 000. |
| Faktura náklad 120 000, dodavateli zálohy 100 000, doplatek 20 000 | Rozdělovat 120 000, nikoli 20 000. |
| Faktura přes 2 roky + dobropis | Doložené části se rovnají čistému nákladu; žádná část nesmí být spotřebována dvakrát. |
| Hlavní voda 100 m³, podružné 90 m³ | Rozdíl 10 m³ explicitně zobrazen a přidělen dle doloženého klíče. |
| Osoby 2 × 31 dní + 1 × 334 dní | 396 osobodnů, nikoli 24 osoboměsíců. |
| Pět střídání + prázdný interval | Všichni příjemci a vlastník prázdného období zahrnuti; součet podílů zachován. |
| ISTA základ 100, spotřeba 200, mezisoučet 300, domovní souhrn 5 000 | Individuální náklad 300, nikoli 600/5 600; zaokrouhlení podle potvrzeného zdroje. |
| Chybí teplo, ostatní služby hotové | Lze uložit pracovní stav, nelze schválit kompletní vyúčtování. |
| Pojištění/správa/fond/revize | OWNER default; potvrzení varování nepředstavuje právní způsobilost. |
| Dva souběžné překrývající POST | Jeden záznam, druhý odmítnut; žádný finanční zápis. |
| Jiná smlouva/nemovitost/VIEW účet | Žádný neoprávněný zápis nebo únik osobního salda. Archivovaná historie nadále čitelná. |

## Právní a integrační zdroje

Prověřeno 15. 9. 2026, použitelnost je nutné v dalších blocích vztáhnout ke konkrétnímu období a vztahu poskytovatel/příjemce.

- [67/2013 – historie](https://www.zakonyprolidi.cz/cs/2013-67/historie): rok 2025 používá znění 1. 1. 2024–31. 12. 2025; aktuální rok 2026 znění od 1. 1. 2026 (novela 176/2025). Budoucí znění 2027 nepoužívat předčasně.
- [67/2013 – znění pro 2025](https://www.zakonyprolidi.cz/cs/2013-67/zneni-20240101), [aktuální](https://www.zakonyprolidi.cz/cs/2013-67): §2 limit 12 měsíců a definice nákladu, §5 pravidla, §7 skutečné náklady a přijaté zálohy, doručení do 4 měsíců a finanční vyrovnání nejpozději do 4 měsíců od doručení; §8 podklady a námitky. R26A netvrdí právní úplnost protokolu a neurčuje splatnost.
- [269/2015](https://www.zakonyprolidi.cz/cs/2015-269): znění od 1. 1. 2024 je relevantní pro 2025 i aktuální stav 2026; tepelné algoritmy nejsou implementovány.
- [Občanský zákoník §2251–2254](https://www.zakonyprolidi.cz/cs/2012-89#p2251): oddělení nájemného, služeb a jistoty; pro časové právní výstupy bude ještě nutné ověřit konkrétní historické znění, nikoli aplikovat dnešní celek zpětně.
- [MMR – platby](https://mmr.gov.cz/cs/ministerstvo/bytova-politika/najemni-vztahy/platby-spojene-s-najmem-bytu): pojištění, správa, fond a revize nejsou automaticky službami nájemce; deratizace závisí na příčině a okolnostech.
- [ISTA developer portal](https://www.ista.com/developer-portal/) a [ista24 CZ](https://www.ista.com/cz/technologie-a-produkty/ista24/): existující nabídka neprokazuje dostupnost API pro konkrétní českou smlouvu. První verze používá potvrzený import/protokol.

## R26A validace a omezení

Lokální TypeScript a production build prošly. Prisma validate s lokální testovací URL prošlo. Rozšířená R5A regrese 7/7. Lokální PostgreSQL není nainstalovaný; instalace narazila na omezení oprávnění prostředí, nebylo obcházeno. Migrace a DB/concurrency testy proto musí proběhnout v izolované PostgreSQL CI; bez zeleného CI se nemerguje. Živý prohlížeč zobrazuje přihlášení, bezpečné browserAuth bylo vyžádáno. Stav CI/nasazení/živého auditu bude doložen v PR, tento dokument sám neznamená splnění bran.
