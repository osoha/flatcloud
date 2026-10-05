# Generování smluv, podpisy a potvrzení — sandbox 2026-10-05

Rozsah schválil uživatel v tomto pracovním vlákně: společný balík předvyplnění, založení nové/existující smlouvy, papírového podpisu, vlastního podpisu a potvrzení v portálu, oznámení neprodloužení a upozornění správce. Následně doplnil uživatelský panel nájemníka po vzoru stávajícího účtu. Cílová větev je pouze `sandbox/ux-agent`, služba `srv-dacselkmqu1s73bmjoq0`.

## Výsledné chování

- Generátor přednostně načte evidovaného pronajímatele pro začátek nájmu, poté vlastníka jednotky. U více vlastníků potřebuje jednoznačnou vazbu vybraného účtu jednotky; vlastník účtu sám smluvní stranu neurčuje. Vlastník celého domu je náhradou pouze v režimu WHOLE_OBJECT. Historická změna vlastníka vyžaduje kontrolu. Datum narození a rejstříkové údaje vlastníka lze nově evidovat a opakovaně předvyplnit.
- Nová smlouva začne volbou existujícího dokumentu nebo nové smlouvy. Nová vede po uložení údajů do generátoru, existující do dokumentů smlouvy. Jednoznačný vlastník jednotky u nové smlouvy se eviduje současně se založením. PDF lze vytisknout nepodepsané, podepsat fyzicky a nahrát sken. OCR zůstává budoucím krokem.
- SIGN, RECEIVE, READ, APPROVE a NON_RENEWAL mají samostatný význam. Předání neodesílá e-mail ani pozvánku. Odesílatel potvrzuje obsah a konkrétní příjemce; nájemník přijme úkon ve vlastním portálu. SIGN vyžaduje konkrétní PDF, vlastní šifrovaný podpis a nové potvrzení heslem při každém použití. Podpisy starších dokumentů se nemění při změně osobního podpisu.
- Původní PDF se nepřepisuje. Záznam je vázaný na SHA-256 jeho obsahu a zmrazeného sdělení, účet, čas a význam potvrzení. Export přidává stránky záznamu k původnímu PDF. Časy aplikace a obrázek podpisu se neoznačují jako kvalifikované služby.
- Přístup znovu ověřuje aktuální smluvní stranu, vazbu přijaté pozvánky a kontaktní e-mail, případně oprávnění upravovat konkrétní jednotku. OWNER_VIEWER/allProperties ani náhled správce nepovolují zápis. Potvrzení a zrušení jsou serializované zámkem konkrétního úkonu. Již potvrzené úkony nelze zrušit.
- Před koncem pevného nájmu vzniká interní rozhodovací úkol, po konci kontrola skutečného předání. Nepotvrzené úkony připomínají jiné prokazatelné doručení. Nové úkoly jsou idempotentní a sandboxově omezené; kontrola se provádí v přehledu smluvních úkonů a ve scheduleru, pokud běží v povoleném prostředí. Vložení do portálu není samo prohlášeno za prokázané doručení. Oznámení před koncem nenahrazuje případnou pozdější výzvu k odevzdání.
- Levé menu portálu obsahuje panel uživatele a Můj účet se změnou hesla a osobním podpisem. Náhled správce zobrazuje tento vzor pouze pro čtení. Client komponentám se předává jen veřejné jméno, ID a volba avataru, žádný hash hesla.

## Kontroly a brány

Lokální statické kontroly: všech 36 variant smlouvy, chybné vstupy, výběr pronajímatele, význam potvrzení, existující portálové doklady a relevantní UX kontroly. Prisma validate prošla. Lokální production build prošel; finální commit dále ověří CI.

Databázové migrace, finální build a Playwright musí projít na přesném PR commitu v izolovaném CI. Nová sada testuje obě zakládací cesty, předvyplnění, vlastní účet a změnu hesla, náhled, únik heslového hashe, odebraný kontakt, cizí účet, CSRF, současná potvrzení, připomínky, osobní podpis, heslo, porušené PDF, neměnnost podpisu a původního PDF i export.

**Stav před CI: BLOCKED pro nasazení; čeká na výsledky izolovaných testů.** Lokální PostgreSQL není v pracovním prostředí spustitelný. Není proveden žádný produkční zápis ani komunikace s reálnými příjemci. Migrace je pouze rozšiřující. Generický `lib/documents/service.ts` zůstává beze změny. Sandbox nasazení proběhne až po ověření CI a auditu diffu.
