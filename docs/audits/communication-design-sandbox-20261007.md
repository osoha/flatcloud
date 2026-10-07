# Jednotná komunikace a Berry – sandbox

## Zadání a rozsah
Souhlas 7. 10. 2026: PDF pro smluvní dokumenty, doklady a oficiální oznámení s dopadem na smluvní vztah. Běžná oznámení, úkoly a zprávy jednoduchým e-mailem. Navazuje na schválený doklad v sandboxu. Tento blok cílí pouze na `sandbox/ux-agent`; produkce vyžaduje samostatné rozhodnutí.

- Společná e-mailová obálka: logo schváleného dokladu, tmavomodrá / modrá / světlomodrá, čitelná šířka, vložené CID logo a textová alternativa.
- Platební údaje a upomínky: částka, splatnost, IBAN, VS, QR a původní upravitelný text. Výběr příjemců, výpočet částek, QR i deduplikace zůstávají stávající.
- Úkoly a portál: stručný obsah a jedno hlavní tlačítko, bez PDF.
- Změna či zrušení změny účtu: po ověření stávajícího přístupu a zmrazených smluvních příjemců příloha z již archivovaného PDF. SHA-256 musí odpovídat; poškozený archiv se neodesílá ani nepřegeneruje. Odeslání nenahrazuje potvrzení přečtení.
- Nová oficiální oznámení a záznamy podpisů: společná sazba Inter, hlavička a patička, opakování na dalších stranách, zachování všech údajů a právních upozornění. Uložené dokumenty se nemění; u podpisových balíčků se připojují pouze nové evidenční stránky.
- Modelové náhledy `/nastaveni/nahled-komunikace` a PDF endpoint pouze pro superadministrátora v sandboxu / izolovaném lokálním pilotu. Nepřistupují k příjemcům a neodesílají poštu. QR v náhledu není platební příkaz.

## Berry
Obsah a ověření viz `docs/berry-bank-guide-2026-10-07.md`. Patnáct bank + obecná varianta, jasně označené neověřené postupy, přímé bankovní zasílání versus filtrování v poště, vybrané příchozí platby s VS, negativní test soukromých zpráv, testovací platba a skutečný výsledek napojení. Retence zůstává 100 dnů. Návod sám nezaručuje podporu konkrétního formátu banky.

Samostatná opravená Berry větev `01e658f9529efc9cd5b596f12a1e987a3ffc3c0b` má úspěšný build i browser-smoke: Actions 37658855562.

## Sloučení základu sandboxu
Sandbox `d9a5b945` ještě neobsahoval provozní změny účtů z main `e3dca149`. Pro celý náhled je připojena tato již vydaná větev spolu s Berrym. Zachovány sandboxové smlouvy, podpisy a schválený doklad. Sloučeny aditivní modely/migrace. Nájemnická navigace zachovává sandboxový účet a náhled pouze pro čtení; doplněna existující vlastní avatarová forma a neduplicitní popisek profilu. Nezahrnuje rozpracovaný PR 271 o použití účtu bez ověření.

## Ověření
- Lokálně: TypeScript, Prisma generate/validate; branding/CID/QR; Berry; právní významy dokumentových akcí a smluvní generátor; zabezpečení notifikací; PDF kompletnost a hranice při 1 i 8 stranách; vizuální kontrola oznámení a referenčního dokladu.
- Přidané regresní testy: běžný úkol bez PDF; totožné archivované PDF v e-mailu; zrušený přístup a poškozený hash blokují přílohu; e-mail nepotvrzuje přečtení; desktop/mobil čtyř náhledů, přístup k PDF pouze oprávněným administrátorem.
- Před zveřejněním musí projít celý sandbox CI včetně izolovaných migrací, production buildu a browser testů. Reálné e-maily se při ověřování neposílají.
