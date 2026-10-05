# Portál a komunikace s nájemníkem – produkční balík 5. 10. 2026

Uživatel po kontrole sandboxového portálu výslovně zadal dokončení komunikace, povinných provozních upozornění a auditovatelného nahlášení změn kontaktů a vydání hotových bloků do produkce. Tento audit rozšiřuje původní sandboxový rozsah auditů PR #245–248. Jejich tehdejší omezení na sandbox popisují předchozí vydání.

Výchozí produkce: `c72ec293d7836842a63404168caf4daf2821419b`. Integrovaný sandbox: `b47d3ca98d83d8d5b2ffcbc9e8accc2050d74b92`. Větev: `feat/tenant-communication-production-20261005`.

## Chování

- „Napsat správci“ zakládá úkol se stejným adresátem, jakého ukazuje kontaktní karta. Nájemník otevře historii, stav a veřejné odpovědi přímo v portálu. Hlášení závad a zveřejněné úkoly používají stejnou konverzaci.
- Odpovědi `TENANT_VISIBLE` jsou výslovně odlišené od interních a vlastnických záznamů. Správce má oddělené rozepsané texty. Nájemník nikdy nečte obecný interní detail úkolu ani jeho interní přílohy.
- Provozní e-maily oznamují veřejné odpovědi, zveřejněné úkoly a oznámení a změny stavu nebo termínu. Nájemník nemá přepínač pro jejich vypnutí; nastavení zaměstnanců zůstává zachované. Zprávy se zpracovávají z trvalé fronty; existující hodinový scheduler zajišťuje obnovu po výpadku.
- Změna kontaktu vytváří žádost s původními a navrženými údaji, autorem a časem. Správce zaznamená převzetí k vyřízení nebo zamítnutí s vysvětlením. Samotné nahlášení ani převzetí nepřepisuje kontakt nebo přihlašovací identitu. Následný postup zůstává v konverzaci úkolu.
- Balík zahrnuje dříve ověřené opravy Basicu, zakládání smluv a služeb, dokumentů, podpisů a dokladů, bankovní fronty a odečtů a schválený vzhled portálu. Nájem a kontakt zůstávají před oznámeními; kontaktní karta nemá květinové pozadí.

## Kontrola dat a oprávnění

Produkční redakce bankovních zůstatků je zachovaná, její regresní verifikátor je znovu zařazen do CI. Konflikty historie main/sandbox byly vyřešeny se zachováním této produkční ochrany a novějšího sandboxového chování.

Jedenáct příchozích migrací je aditivních. Jediný datový backfill doplňuje autora nájemníka z jednoznačně dohledaného původního auditu. Balík neprovádí hromadný přepočet plateb ani přepis odečtů. Automatické pozvánky zůstávají ve výchozím ručním režimu; produkční automatika měřidel zachovává stávající aktivační bránu.

Nové zápisy kontrolují přístup, aktuální smluvní vztah, jednotku, nemovitost a aktivního nájemníka uvnitř serializovatelné transakce. Náhled správce je pouze pro čtení; plátce nedostává provozní oprávnění smluvní strany. Veřejná odpověď správce navíc kontroluje nezměněného adresáta a smluvní kontext oproti otevřenému úkolu. Opakované odeslání používá deduplikační klíče.

E-mail před odesláním znovu ověřuje aktuální přístup, kontaktní e-mail, aktivní smlouvu a veřejný zdroj zprávy. Odesílání má atomické převzetí, omezené bezpečné opakování a stav UNKNOWN při nejasném výsledku SMTP. Staré oznámení bez nové výslovné publikace se po nasazení nerozesílá. Testy používají izolované identity a náhradní poštovní transport.

## Ověření a vydání

Izolovaná databáze přijala všech 106 migrací; Prisma validate a bootstrap prošly. Verifikátor upozornění ověřuje povinné doručení nezávislé na tenantově nastavení, paralelní převzetí, odvolaný přístup, změněný kontakt, neaktivní nemovitost, skrytou zprávu, plánované oznámení, starší oznámení, SMTP a české kalendářní termíny.

Nová prohlížečová sada `e2e/tenant-portal-conversations.spec.ts` ověřuje celý průchod nájemník–správce, soukromé poznámky, oddělené rozepsané texty, opakované požadavky, cizího nájemníka, plátce, náhled, uzavřenou konverzaci a kontaktní žádost včetně auditní historie. Je součástí cíleného portálového kroku i úplné sady CI. Stávající kontroly plateb, dokladů, fotografií, rozsahu oprávnění, smluv a vyúčtování se zachovávají.

READY a merge jsou podmíněné úspěšným produkčním sestavením, prohlížečovými testy, vizuální kontrolou a zelenými kontrolami konečného SHA na nativním PostgreSQL v CI. Konkrétní výsledky a nasazené SHA jsou zaznamenané v navazujících pull requestech. Produkce a aktivní scheduler musí po vydání běžet z očekávaného commitu; sandbox musí obsahovat stejný ověřený obsah.
