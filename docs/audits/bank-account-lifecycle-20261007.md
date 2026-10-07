# Bankovní účty vlastníka a změna platebních pokynů

## Rozsah a schválení
Uživatel po předložení auditu schválil implementaci a produkční nasazení 7. 10. 2026. Citlivá změna: platební směrování, autorizace a soukromí. Žádné konkrétní účty vlastníků, smlouvy ani příjemci se nasazením nepřevádějí. Změnu musí vlastník/správce potvrdit v aplikaci.

## Funkce
- Centrální účty, ověření bankovní notifikace bez smlouvy, explicitní vazba na vlastníka. Ověření notifikace není bankovní ověření identity majitele.
- Kontextové tlačítko na jednotce/smlouvě; průvodce účet → jednotky/datum → dopad/potvrzení. Jeden vlastník může používat různé účty pro různé jednotky.
- Okamžitá nebo budoucí účinnost, idempotence, opětovná kontrola oprávnění a změn smlouvy při aktivaci. Konflikty blokují aktivaci a zakládají úkol.
- Neměnné PDF s hashem, oznámení v portálu, emailová fronta, audit smlouvy, individuální potvrzení přečtení a úkol pro doložení doručení. Automatický email vyžaduje existující portálový kontakt a aktivní objekt. Neúspěšné nebo jiné doručení řeší evidovaný úkol.
- Zrušení plánované změny vytváří další oznámení s původním seznamem nájemců. Původní dokumenty zůstávají zachované.
- Historické účty se uchovávají pro rozpoznání dobíhajících plateb. Stav archivace neruší historii ani příjem.
- Čtení a výběr cizích účtů omezeny na vlastnictví a spravovaný rozsah. Samotné VIEW členství objektu nedává přístup ke všem jeho jednotkám a účtům.

## Migrace a provoz
Aditivní migrace 20261007090000_bank_account_lifecycle: nové tabulky historie/oznámení/doručení/příjmových vazeb, dvě pole účtu. Bez mazání a bez převodu reálných účtů. Aktivace je součást scheduleru a přihlášených požadavků. Nová smlouva u jednotky s čekající změnou vyžaduje nejprve vyřešení této změny.

## Ověření před PR
- TypeScript: prošel.
- Prisma validate: prošel.
- Parser/směr bankovních plateb, QR plateb, v21.3.6 a v21.6: prošly.
- Production build (webpack kvůli externímu lokálnímu symlinku node_modules): prošel.
- PDF vzorek vygenerován a vizuálně ověřen: jedna čistá stránka, česká diakritika, úplné údaje.
- Nový Playwright scénář pokrývá vlastníka, cizí účet, ověření bez smlouvy, změnu účtu, PDF, tenant confirmation, starý příjem, budoucí účinnost, idempotenci a zrušení.
- Databázová migrace a úplný CI/browser smoke: vyžadují zelený výsledek PR před sloučením. Stav v tomto dokumentu není prohlášením READY.

## Omezení
Průvodce vyžaduje potvrzení smluvního podkladu pro oznámení. Nepředstírá univerzální právní účinek jednostranného dodatku. Potvrzení přečtení není elektronický podpis ani důkaz všech zákonných způsobů doručení. Jednotky s více vlastníky vyžadují jednoznačné určení vlastníka před touto změnou. Při změně osob smlouvy se nová aktivace blokuje; doručovací úkol vyžaduje kontrolu původních adresátů.

## Navázání práce v novém vlákně 7. 10.
- Zachovaný pracovní strom převzat a porovnán s produkčním main e6cb72c; baseline je obsahově shodný.
- Doplněna opětovná kontrola aktivního uživatele, sériová izolace změn, lifecycle revize a kolize VS včetně počátečních nul.
- Zrušení používá původní adresáty i pro mailovou frontu; bankovní oznámení nejsou současně duplicitní běžná oznámení v portálu.
- Náhled nespouští další aktivaci na stránce účtů ani nezapisuje otevření PDF. Čtenářské vlastnictví nepřidává právo editace běžných dokumentů.
- Úprava běžných údajů smlouvy zachovává její platební účet a kontroluje souběžnou změnu.
- Rozšířené E2E: změněný idempotentní požadavek, normalizovaný VS, ztráta oprávnění před účinností, blokace a zrušení s oznámením.
- ČSOB parser, v21.3.6, v21.6 a Prisma validate lokálně znovu prošly. Kompletní CI této finální změny dosud není dokončeno; nejde o READY.

- První úplné CI zachytilo regresi výslovného globálního práva pro čtení archivu dokladů. Toto právo je zachované; nezakládá právo změny bankovního účtu. Běžné VIEW členství domu nadále neodemyká cizí jednotky a účty.
- Obecná dokumentová autorizace byla vrácena přesně na produkční verzi; její integrity-pinned test se nemění. Nová bankovní oznámení mají oddělené vlastní autorizované endpointy.
- Nový účet drží kontext jednotky po registraci i kontrole ověření; domácí číslo účtu a vyplněný IBAN musí souhlasit.

- Souběžné aktivace při načtení stránek opakují celou serializovatelnou transakci při konfliktu P2034; nový E2E spouští dva aktivátory současně. Kolize VS při aktivaci blokuje konkrétní změnu místo opakovaných chyb všech přihlášených stránek.

- Portál původního ověřeného adresáta uchová bankovní oznámení i po změně smluvních osob; manažerský náhled zůstává omezen na své smlouvy. E2E ověřuje původního adresáta a nepřítomnost oznámení pro nového nájemníka. Výběr při zakládání jednotky skrývá archivované účty.
