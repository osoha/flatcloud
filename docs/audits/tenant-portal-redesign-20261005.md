# Portál nájemníka – schválený návrh 5. 10. 2026

Výchozí sandbox: `1adf78314470522b7d9f000242fd6aaba7f7d8b4` (PR #247).
Pracovní větev: `feat/tenant-portal-redesign-20261005`.

Uživatel schválil grafický návrh a návazné stavy, zadal přípravu a vydání do sandboxu. Upřesnil pořadí: nájem a kontakt správce před oznámeními a úkoly. Dekorativní kytky u správce se nepoužijí. Produkce není součástí vydání.

## Výsledek

- Krátká hlavička s českým pozdravem a Berrym, funkční detail bydlení namísto samostatné dekorativní fotografie.
- Jediný vodorovný panel Můj nájem s platebními údaji a QR. Splatné, dnešní a budoucí nájmy se rozlišují; budoucí nájem nezpůsobuje tvrzení o dluhu. Uhrazený stav je přívětivý, bez výzvy k další platbě.
- Výrazný kontakt s existujícím avatarem, telefonem a e-mailem. Chybí-li správce, kontakt se určí z konkrétního pronajímatele; při nejednoznačném vlastnictví se osoba neodhaduje.
- Oznámení a úkoly od správy za hlavním platebním a kontaktním panelem; text, autor, termín, potvrzení a archiv. Dlouhá historie nezvětšuje úvodní přehled neomezeně.
- Tři pracovní karty otevírají přístupné panely. Formulář hlášení, historie, odečty a dokumenty se nevykreslují znovu pod přehledem.
- Měřidla ukazují poslední platný stav a umožňují nový odečet s nepovinnou fotografií. Opravy a výměny zůstávají v režimu správce.
- Dokumenty rozlišují smlouvy/předání a doklady o zaplacení. Roletka obsahuje skutečně způsobilé plně uhrazené nájmy; opakované vystavení zachovává stávající archiv a finanční snapshot.
- Kompaktní platební historie s filtry a rozbalením, skutečnými daty připsání a oddělenými zápočty.

## Oprávnění a data

Publikace úkolu nájemníkovi je výslovná. Samostatný veřejný název a text neodhalují interní popis ani diskusi úkolu. Nové tenantové publikum oznámení je oddělené od interních zaměstnaneckých příjemců. Plátce má finanční pohled, nikoli provozní zprávy a akce smluvní strany. Náhled správce zůstává pouze pro čtení.

Potvrzení zveřejněného úkolu nebo zprávy je svázané s její verzí. Opětovné zveřejnění zneplatní staré potvrzení; serializovatelné transakce chrání souběh. Skrytá, budoucí nebo cizí oznámení nelze načíst ani potvrdit tenantovým endpointem.

Hlášení závady zachovává původní text nájemníka odděleně od následných interních úprav. Zápis závady, odvolání souhlasu a uložení odečtu kontrolují aktuální přístup i uvnitř transakce. Fotografie je soukromý dokument konkrétní smlouvy/jednotky; při chybě se nedokončené soubory uklidí.

Adiční migrace `20261005070000_tenant_portal_messages` přidává zveřejnění a potvrzení úkolu a explicitní tenantové publikum oznámení. Původní úkoly zůstávají interní. Změna nepřepočítává bankovní transakce, alokace, nájemní předpisy ani jistoty.

## Ověření

Lokálně prošly TypeScript, `git diff --check`, produkční build v Node 22.23.1, všech 105 migrací nad izolovanou databází, verifikátory kontaktu, dokladů, QR, odečtů a finančních omezení. Verifikátor fotografií odečtu prošel všemi 10 kontrolami. Nezávislá kontrola přístupů a diffu nemá zbývající blokující nález.

Finální prohlížečová kontrola: šest scénářů ve třech portálových sadách prošlo bez opakování (31,9 s); samostatný scénář fotografie odečtu se skutečným nahráním a stažením přes izolované S3 prošel (5,3 s). Kontroly používají přihlášené uživatele také pro přímé API požadavky. Zahrnují vystavení/archiv dokladu, náhled správce, plátce a cizí smlouvy, původní text závady, zveřejnění/archivaci zpráv a odmítnutí potvrzení zastaralé verze.

Skutečné screenshoty prošly vizuální kontrolou: desktop 1280 px, tablet 1024 px a mobil 390/375/320 px. Kontrola odhalila a opravila zmenšený QR, návrat focusu po zavření dialogu, překrytí částky QR na mobilu a lámání názvů měsíců. Regrese ověřují také skutečné hranice textu, nikoli jen nepřetékání stránky.

Lokální vizuální prostředí používá izolovaný PGlite. Nativní PostgreSQL v CI je závazná kontrola migrací a souběhů; finální stav kontrol konkrétního SHA a vydání je evidován v [PR #248](https://github.com/osoha/flatcloud/pull/248). READY a merge jsou podmíněny zelenými kontrolami finálního SHA.

Kontroly zahrnují původní přístupy, pozvánky, podpisy, doklady a rozsah nemovitostí; nové zveřejnění/odebrání obsahu, cizí tenanty, plátce, náhled správce, revize potvrzení, příjem plateb, fotografie a nezobrazení interních textů. Screenshoty jsou součástí CI artefaktů.

## Vydání

Vydání proběhne přes PR #248 jediným merge do `sandbox/ux-agent` po úspěšných kontrolách. Následuje ověření přesného SHA a stavu LIVE na Renderu včetně migrace a provozních chyb. Stav nasazení je zaznamenán v PR; produkce není součástí tohoto vydání.
