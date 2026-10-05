# Portál nájemníka: dokumenty, vystavitelé a kontrola z jednotky

Výchozí produkce: `50b15735fc032b690550cbc85545a2b4549dfe23`. Pracovní větev: `fix/tenant-portal-documents-issuers-20261005`.

## Důvod změny

Nahraná smlouva byla správně přiřazená k nájmu, ale její stav „Pouze správa“ nebyl vidět v dokumentech jednotky. Správcovský náhled portálu zobrazoval sdílený dokument bez možnosti stažení. Vystavování dokladů hledalo osobní podpis podle vazby na správce nebo bankovního vlastníka; neposkytovalo jednoznačné nastavení osoby jednající za konkrétního pronajímatele.

## Rozsah

- Portál používá stejný soubor loga FlatBerry jako aplikace; kontakt bez správce je označen „Pronajímatel“.
- Stavy předpisů mají textové popisky i barevné rozlišení: budoucí modře, aktuální před splatností oranžově, neuhrazené po splatnosti červeně, uhrazené zeleně. Přehled zobrazuje pouze skutečné předpisy.
- Karty dokumentů v jednotce, katalogu a detailu smlouvy ukazují sdílení a oprávněnému správci nabízejí jeho výslovnou změnu. Nepřiřazený dokument není automaticky zveřejněný.
- Sdílená smlouva a archivní doklad jsou ze správcovského náhledu stažitelné přes správcovskou kontrolu přístupu. Náhled nadále neprovádí zápisy.
- Z jednotky lze otevřít oznámení s předvybranou dostupnou aktivní smlouvou. Text formuláře odpovídá existujícím provozním e-mailům.
- Obecný avatar zůstává dostupný i při vypnutí fotografií v Profi.

## Vystavitel a podpis

Pronajímatel má vlastní profil vystavitele a více evidovaných jednajících osob. Jedna osoba může zastupovat více pronajímatelů, ale svůj podpis a souhlas potvrzuje samostatně pro každého. Správce může připravit nastavení a vybrat podepisujícího; osobní souhlas nemůže udělit za něj ani v náhledu jeho účtu.

Pronajímatel konkrétního nájmu se výslovně potvrzuje pro rozsah měsíců. Tato vazba je oddělená od příjemce bankovní platby a nepřepisuje jej. Překrývající se aktivní rozsahy jsou odmítnuté. Nové potvrzení starších období je explicitní úkon s auditem, nikoliv zpětný odhad aplikace.

Správce a nájemník používají stejnou finanční validaci, podpisový profil a neměnný archiv PDF. Správce vystavuje z dokumentů jednotky/smlouvy; nájemník z portálu. Vytvoření vyžaduje přesné oprávnění k danému nájmu, nikoliv jen globální čtení. Přijaté platby, rozpis, vystavitel, podepisující a podpis se zachycují ve snapshotu. Již vystavené PDF se při změnách nepřepisuje.

Změna názvu nebo adresy vystavitele vyžaduje obnovení osobního souhlasu. Odvolání souhlasu, deaktivace zástupce nebo vypnutí profilu blokují nové vystavení.

Správce může vystavit doklad také k uhrazenému historickému nájmu. Nájemník potřebuje nadále aktuální smlouvu a platný přístup. Archiv zachovává původní období a PDF i tehdy, když se později předpis deaktivuje; tuto skutečnost označí.

## Dopad vydání a lidská brána

Migrace je aditivní. Nevytváří podpisy, souhlasy ani vazby pronajímatelů automaticky a nepřepisuje platby, bankovní účty nebo staré doklady. Pro nové vystavování je potřeba jednorázově potvrdit pronajímatele a jeho podpisové nastavení; dosavadní samotný osobní podpis tento souhlas nenahrazuje. Starý archiv zůstává dostupný.

Jde o změnu určování vystavitele a podpisových oprávnění. `AGENTS.md` proto vyžaduje před produkčním nasazením lidské rozhodnutí po předložení auditu. Příprava kódu, izolované ověření a sandbox předcházejí tomuto rozhodnutí. Produkční podpisy, zastoupení a sdílení dokumentů se tímto vývojovým úkolem nenastavují.

## Ověření

Izolované ověření funkcí: **PASS**. Finální stav vydání je podmíněný zeleným CI konkrétního commitu a lidským rozhodnutím uvedeným výše.

- Prisma validate a všech 107 migrací v čisté izolované databázi: PASS.
- Izolovaný verifier zastoupení a dokladů: 9/9 skupin PASS. Pokrývá více pronajímatelů na osobu, vlastní souhlas, přesný rozsah jednotky, souběžné přiřazení období, odděleného bankovního příjemce, společné PDF správce/nájemníka, změnu identity, odvolání souhlasu i historické nájmy.
- Statické kontroly dokladů a kontaktů: PASS. Verifier provozních oznámení: 11/11 PASS bez skutečného SMTP.
- Nezávislý audit zdrojového kódu a všech šesti nových endpointů: PASS, bez blokujícího nálezu. Ověřeny rozsahy smluv, osobní souhlas, kontrola revizí, náhledy a neměnnost archivu.
- Production build: PASS. Všech 17 cílených prohlížečových scénářů: PASS bez opakování (1,3 min). Zahrnují skutečné stažení PDF, změnu sdílení, cizí dokumenty a interní přílohy, nastavení vystavitele, čtyři stavy plateb, náhled i přepínání avatarů. Předvolba oznámení funguje i s EDIT přístupem pouze k jedné jednotce; rozšiřovat oprávnění nebylo potřeba.
- Vizuální kontrola dokumentů, portálu a nastavení vystavitele na desktopu a mobilu: PASS. Následně doplněn scroll-margin kotvy dokladů a mobilní karty místo vodorovně posouvané tabulky, aby bylo tlačítko PDF ihned dostupné. Závěrečné CSS změny mají samostatnou vizuální kontrolu; produkční sestavení celé konečné verze opakuje CI.

Testy používají pouze izolovanou databázi, lokální úložiště a testovací identity. Produkční data ani skutečné e-maily nebyly změněny.
