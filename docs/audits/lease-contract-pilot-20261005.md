# Pilot nájemní smlouvy FO — 5. 10. 2026

## Výsledek a rozsah

Technická příprava sandboxového náhledu; živý uživatelský pilot je **BLOCKED** do ověření přihlášené sandboxové aplikace a jejího PDF na existujících označených testovacích záznamech. Ve zpřístupněné browser relaci je pouze přihlašovací obrazovka, nikoliv přihlášený testovací správce. Lokální browser a HTTP PDF nejsou vydávány za živé sandboxové ověření.

První varianta: jeden nájemce fyzická osoba, byt, CZK, doba určitá nejvýše jeden rok, bez indexace a bez předem naplánovaných změn financí během nájmu. Prodloužení pouze podepsaným dodatkem. Individuální sazba jistoty se načítá z uložených podmínek účinných při začátku nájmu; globální/defaultní sazba se nepoužívá. Zákonný nárok z článku 5.3 zůstává zachovaný.

## Vstupní brána Nájemnického portálu

- PR [#252](https://github.com/osoha/flatcloud/pull/252), base `sandbox/ux-agent`, head `32b1752f7e08dc67eb80e9453020031ae1570c07`; merge `45465917779458d304b395d3cf078b2ce49de65a` dne 5. 10. 2026 v 10:28:39 UTC.
- Finální head: všechny čtyři nalezené workflow runs úspěšné (`37294614119`, `37294614059`, `37294614062`, `37294610907`). Dokončenou desktop/mobile vizuální kontrolu dokládá popis PR a `docs/audits/tenant-portal-documents-issuers-20261005.md`; 17 cílených browser testů a 259 širších testů prošlo, pět podmíněných přeskočení je zaznamenáno ve zdrojovém auditu.
- Render workspace `tea-d9bpoou1a83c73blflg0`, služba `srv-dacselkmqu1s73bmjoq0`: deploy `dep-db1nnmavcj2c73aek77g` je **LIVE**, commit přesně `45465917779458d304b395d3cf078b2ce49de65a`, dokončeno 10:33:04.757 UTC (12:33 Praha). Veřejná aplikace a přihlašovací stránka na [sandbox URL](https://flatcloud-ux-sandbox.onrender.com) byly otevřeny v prohlížeči. Merge a CI byly kontrolovány odděleně od Render LIVE.

## Autoritativní podklady

Oba dokumenty byly načteny a materializovány v aktuální verzi **2**. Vzor má tabulkovou košilku, čistý název, deset článků a konečný podpisový blok. Testovací plán vychází z kapitoly 13 poznámek.

| Dokument | Library ID | SHA-256 |
| --- | --- | --- |
| FlatCloud_najemni_smlouva_FO_v1.docx | `libfile_82e9b6f7f06081919bcbd444546ce695` | `12b082986683548d554caf79251e84ce4b249b146e093c1cf5f6fc593739cff6` |
| FlatCloud_pravni_poznamky_a_varianty_v1.docx | `libfile_6040b4566b78819189ff88a975a4115a` | `c361c9476420375173b31a79fec26c4d95ddeca1ae4a4e83df8a0728f2feecc1` |

`template-v1.json` obsahuje přepis aktuálního schváleného vzoru, nikoliv dřívější pracovní verzi. Košilka i články používají jeden model částek, dat, identit a sazby. Rozpis v článku 4.1 a v košilce obsahuje pouze zadané zajišťované služby; součet musí přesně souhlasit s evidencí. Podmíněná pracovní věta pro společnost se nahradí konkrétním zápisem nebo vynechá. Při nulové jistotě se odstraní povinnost složení/doplňování a úrok se neuplatní. Pro správce, který není sjednán, se uvede provozní kontakt pronajímatele.

## Implementace a audit diffu

- Samostatná větev `feat/lease-contract-pilot-20261005` z ověřeného sandboxového merge. Cíl PR výhradně `sandbox/ux-agent`.
- GET `/smlouvy/:leaseId/nahled-smlouvy` a POST `/api/leases/:leaseId/contract-preview`. Odkazy v detailu smlouvy a Dokumentech jednotky.
- Pilot se zapne pouze pro konkrétní sandbox Render service ID, nebo explicitně v izolovaném lokálním/CI prostředí. Vyžaduje zároveň prefix `TEST` čísla smlouvy i názvu nemovitosti a existující oprávnění editovat jednotku. Tenant, anonymní a cizí správce nemají přístup. Existující auth/proxy pravidla se nemění.
- Finance, jméno a datum narození nájemce, byt, termín a účet se načítají na serveru. Pronajímatel se neodvozuje z příjemce platby; chybějící smluvní údaje se potvrzují ve formuláři bez ukládání.
- PDF obsahuje celou košilku, všechny články a podpisy, vložený font s českou diakritikou a číslování stran. Košilka musí zůstat na jedné straně; příliš dlouhé údaje jsou výslovně odmítnuty. Nevyplněné hranaté závorky jsou blokovány.
- POST kontroluje existující oprávnění, same-origin, URL encoded formulář a velikost. Výstup je soukromý `no-store`. Žádná změna Prisma schématu ani migrace, žádný zápis nebo nahrazení Document/FileAsset, podpis, e-mail nebo platba. Editor vzoru a navazující mutace nejsou součástí změny.

## Ověření

- `node --import tsx scripts/verify-lease-contract.ts`: PASS. Kontroluje shodu košilky/článků, 2,75 % individuální úrok, zákonné minimum, přesný součet služeb 2 600,50 Kč a celkem 17 600,50 Kč, dodatky, chybějící sazbu a datum, >1 rok, indexaci, limit jistoty, více nájemců, nezajišťované služby, formulář a sandbox/test guardy. Standard, nulová jistota/žádné služby/žádný správce a dlouhá jména/adresy: kompletní pětistránková PDF.
- TypeScript `tsc --noEmit`: PASS. `prisma validate`: PASS; všech 107 migrací aplikováno na nové izolované databázi s `btree_gist`, bez změn migrací. Production build: PASS.
- `e2e/lease-contract-pilot.spec.ts`: dva testy PASS na skutečném standalone production serveru a izolované DB. Formulář desktop/mobil 390 px bez vodorovného přesahu; reálné PDF stažené přes chráněný HTTP endpoint. Sazba účinná při začátku se používá místo pozdější 4 %. Původní Lease, Document a FileAsset zůstávají shodné. Ověřeno odmítnutí špatného součtu, cizího originu, anonymního/cizího účtu a neoznačené smlouvy.
- Vizuálně prohlédnuty všechny strany tří variant a všechny strany skutečného HTTP PDF: diakritika, košilka, články, úrok, služby, poslední podpisový blok, zlomy a číslování. Textová kontrola HTTP výstupu ověřila všech 87 očekávaných položek košilky/článků/podpisů. Kontrola zachytila chybnou rozteč původního webfontu; výstup nyní používá stabilní vložený TTF font a po opravě znovu prošel generováním, renderem, browser testem i vizuální kontrolou.
- Nová verifikace a browser testy jsou součástí CI. Finální CI, SHA merge a případné Render LIVE doklady patří do popisu PR; nesmí být nahrazeny pouhým lokálním výsledkem.

## Cesta k živému dokončení

Po zeleném CI a schváleném sandboxovém release: přihlášený oprávněný správce → označená testovací smlouva → **Připravit náhled nájemní smlouvy** → doplnit doložené údaje → **Vytvořit náhled kompletní smlouvy PDF**. Při chybějícím údaji či nepodporované variantě formulář popíše překážku. Skutečné záznamy a produkční služba zůstávají mimo pilot.

K označení celého pilotu za dokončený stále chybí přihlášená živá kontrola této cesty a výsledného sandboxového dokumentu na existujícím TEST záznamu. Přístup se nesmí nahrazovat novou autentizační zkratkou ani čtením secrets.

## Navazující kontrola nevyplněných evidovaných polí

PR #255 implementuje přesně tento úzký preview pilot a je sloučen jako `fb213b2b2c39f6ba7d2f3c2b713c38877cb6c1a5`. Finální head `4715e5672d47dcacc78cfdd399e5b05c7fe5fed1` má všechny tři CI workflow SUCCESS. Render sandbox deploy `dep-db1p005g1s2s739td4k0` je LIVE od 5. 10. 2026 11:58:33 UTC (13:58 Praha) a odpovídá přesně merge SHA.

PR #254 byl po porovnání se skutečně sloučeným #255 zúžen na validační doplnění: prázdné jméno nájemce, označení/adresa bytu nebo variabilní symbol a evidované placeholdery nyní blokují náhled. Nezavádí druhý generátor ani jiný font; zachovává celý #255 včetně vloženého Geist TTF. Tři nové negativní kontroly ověřují prázdný VS, placeholder jména a prázdnou adresu. Žádný zápis do evidence ani schema/migrace.

Finální CI a sandboxový release tohoto doplnění se dokládají v popisu PR. Přihlášený živý průchod stále není doložen a celý uživatelský pilot zůstává BLOCKED. Dostupná browser relace při obnovené kontrole zobrazovala `/login`.
