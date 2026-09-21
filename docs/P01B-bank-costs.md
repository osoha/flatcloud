# P01B — bankovní výdaje a úhrady nákladů

Rozsah: pouze sandbox. Výchozí sandbox 861274d50a420dc9daf0efcecd2a74ca9b4da9ce, produkce 9038070e758137b3e550fd93dfa1535c482221fd; shodný strom ea03dc545a0a41e09ab44d9abfa826f4b387a3ac.

## Chování

- Náklady a úvěry → Bankovní výdaje a úhrady. UTF-8 CSV s hlavičkou `id;datum;castka;mena;protistrana;ucet;vs;zprava`, max. 1 000 řádků / 2 MB. Stabilní ID banky, datum YYYY-MM-DD, výdaj záporně, vratka kladně, CZK. Prázdná šablona je dostupná v importu.
- Import vyžaduje aktivní účet vlastníka přiřazený domu. Kanonická identita českého účtu brání založení druhé evidence při změně domácího formátu na IBAN. Stejná ID se přeskočí; konflikt údajů vrátí celý import zpět. Nájemní příjmy a pohyby jiného již použitého konektoru do tohoto výpisu nepatří.
- Zdrojový audit: `lib/inbound-bank/process.ts` materializuje jen částky > 0; parser je orientovaný na příchozí notifikace. Pro odchozí transakce neslibujeme úplnost e-mailu ani novou živou bankovní integraci. Použitelný nezávislý vstup je CSV podle zveřejněného formátu; nativní formáty jednotlivých bank nejsou automatické adaptéry.
- Jedna bankovní transakce → libovolný počet nákladů; jeden náklad → libovolný počet úhrad. Vazba uchovává částku, kategorii, autora, důvod a případné storno. Souběžné operace používají serializovatelnou transakci a kontrolu verze pohybu. Zůstatky vznikají součtem aktivních vazeb.
- Existující náklad zachová ID, přílohy a rozdělení jednotek. Nový návrh vzniká jako COMMITTED, nikoliv automaticky ACTUAL. V detailu se přiloží faktura, nastaví podíly a potvrdí skutečnost.
- Záloha, vlastní převod, jistina úvěru, vratka kauce a jiný pohyb jsou samostatné kategorie bez automatického OPEX. Klasifikace jistiny ani kauce nemění jejich jiné evidence. Úrok patří do samostatného nákladu.
- Při přijetí konečné faktury se klasifikace zálohy stornuje a stejný bankovní pohyb připojí k faktuře; nevzniká druhá bankovní platba.
- Dobropis je auditovaná změna výsledné částky původního nákladu včetně možnosti nuly. Přiložit dobropis a do důvodu uvést číslo. Bankovní vratka je samostatná vazba, nesnižuje automaticky ekonomický náklad. Přeplatek je zobrazen k vrácení; nelze odstranit úhradu, na které závisí vratka.
- Sdílený účet má jednu výpisovou evidenci u zvoleného zdrojového domu. Přiřazení jinému domu vyžaduje oprávnění EDIT k oběma a aktivní vazbu cíle na stejný účet vlastníka. Pouhé stejné jméno vlastníka nestačí.
- Ekonomické KPI nad ACTUAL se nezvyšují o bankovní vazby. Náklad se do domu a jednotek započítává stávajícím způsobem pouze jednou. Bankovní přehled používá datum úhrady; simulované cashflow zůstává oddělené.
- Roční podklady mají samostatné náklady a bankovní úhrady, včetně nákladů vzniklých v jiném roce. Poměr vlastníka úhrady používá rozdělení a vlastnictví při vzniku nákladu, nikoli automatický daňový závěr. Úplnost bank musí člověk porovnat s výpisy; výkaz nepředstírá účetní uzávěrku.

## Kontroly

- Parser a výpočty: `scripts/verify-p01b-bank-costs.ts`.
- Integrační / browser scénáře: `e2e/zzz-p01b-bank-costs.spec.ts`; faktura 18 000 Kč / 10 000 + 8 000 / tři jednotky, souhrnná platba, jiný rok, opakovaný import a konflikt ID, souběhy, cizí scope, nový návrh, zálohy, vratky, úplný dobropis, sdílený účet, historie oprav.
- Migrační změna je pouze aditivní. Nové vazby chrání FK RESTRICT; nezmění stávající finanční částky.
- Lokální TypeScript, Prisma validate a relevantní statické kontroly; kompletní migrační a browser gate přes izolovaný PostgreSQL v CI. Živý UX průchod zůstává samostatný krok.

## Stav převzetí

Implementace a kontrolní scénáře jsou v PR155 (https://github.com/osoha/flatcloud/pull/155). Aktuální výsledky CI, sandboxového nasazení a živého UX převzetí eviduje tento PR a autoritativní projektová pipeline. P01B se označuje za dokončený až po ověření migrací, buildu, regresí a skutečného sandboxového průchodu. Produkční nasazení není součástí oprávnění tohoto bloku. Další pořadí P07A → P02; Matterport odložen k externí distribuci, onepager samostatně.
