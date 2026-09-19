# R28 — vizuální audit a sjednocení FlatCloud

## Cíl
Sjednotit horní část obrazovek, typografii, rozestupy a informační hierarchii bez změny business logiky. Referenční vzor: detail jednotky / nemovitosti s kompaktním záhlavím a schválenou tab navigation.

## Dvě optiky auditu

### Senior web designer
1. Konzistence page headeru: breadcrumb → H1 → jediný kontextový subline → akce → tabs.
2. Jednotná typografická škála, vertikální rytmus a šířky karet.
3. Odstranění duplicitních statusových badge a notice karet, pokud opakují kontext.
4. Desktop 1440–1920 px bez horizontálního scrollu tam, kde se obsah může bezpečně zkomprimovat; scroll zůstává u skutečně širokých dat.
5. Mobile/zoom zachová scroll tam, kde je nutný.
6. Tab navigation: bez inward hooku, čistá horní hrana, jemně zakulacený pouze spodní vnější roh.

### Asset manager
Každý badge/callout musí odpovědět na otázku: mění interpretaci KPI nebo rozhodnutí uživatele?
- Pokud ano a je stavový: integrovat do page headeru / scope pickeru / titulku KPI.
- Pokud ano, ale jde o metodické vysvětlení: kompaktní info/help affordance, ne velká permanentní karta.
- Pokud pouze opakuje již viditelný scope nebo datum: odstranit.
- Warning/blocker/action-required zůstává vizuálně výrazný.

## První konkrétní rozhodnutí

### Reporty
Současné LIVE datum, Provozní KPI napříč vlastníky a velká karta Provozní rozsah správy sdělují překrývající se kontext.
- datum dat ponechat jako subtilní metadata u H1;
- scope Vše ve správě / vlastník / vybrané objekty zobrazit v jednom scope controlu;
- Provozní KPI napříč vlastníky nepoužívat jako samostatný badge, pokud stejný scope plyne z pickeru;
- dlouhou kartu Provozní rozsah správy odstranit z běžného stavu; vysvětlení dát do tooltip/help textu scope pickeru;
- pokud pohled kombinuje právní vlastníky a hrozí záměna s konsolidovanými FlatCloud KPI, zobrazit krátký inline disclaimer pod H1, nikoli plnou notice kartu.

### Karta nemovitosti / jednotky
Považovat za referenční layout: identita + primární akce + tabs. Nepřidávat mezi header a tabs další dekorativní informační karty.

### Sidebar
- Přehled je trvale otevřený.
- Provoz a Finance jsou sbalitelné.
- Doporučené chování: bez aktivní události jsou po čistém načtení sbalené; pokud skupina obsahuje aktivní notifikaci, otevře se automaticky. Aktivní route ji vždy otevře.
- V minimalizovaném railu se názvy skupin ani jejich toggle nezobrazují. Zůstane pouze vertikální mezera mezi skupinami; žádný mrtvý klikací dělič. Ikony mají tooltip.

### Horizontální scrollbar
Na širokém desktopu nesmí vznikat kvůli několika pixelům paddingu. Reportové tabulky při >=1450 px používají kompaktnější padding a fixed layout. Na menším viewportu se zachová bezpečný horizontální scroll.

## Stránky pro systematický průchod
Portfolio; Reporty a všechny report tabs; detail nemovitosti a všechny property tabs; detail jednotky; nájemník; smlouva; platby/předpisy/saldo/kauce; úkoly; kvalita/CAPEX; revize; Distribuce/CRM; Metodika; Akcionářské reporty; Uživatelé; Administrace; Vyúčtování.

## Výstup další vlny
Pro každou stránku: KEEP / MERGE / REMOVE pro statusové bubliny; header pattern A (identity card) nebo B (category header); typografické odchylky; spacing; overflow; návrh před/po. Implementace až po sandboxovém vizuálním ověření.