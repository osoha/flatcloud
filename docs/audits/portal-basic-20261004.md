# Basic a Portál nájemníka – schválený sandboxový balík 4. 10. 2026

Základ: sandbox/ux-agent, b41eec2f1c86dc72a05edee930b84482c6932197 (PR 246).
Autorizace uživatele: implementace, push a merge do sandboxu. Produkce není cílem této větve.

## Rozsah a provedení

1. Odkazy v Basic přehledu, sekcích a navigaci přenášejí výběr properties. Přepnutí na všechny objekty také v Úkolech vymaže zapamatovaný podvýběr.
2. Basic pracovní fronta obsahuje otevřené úkoly, dokončené jsou v archivu. Odznak v navigaci používá aktuální výběr. Výběr objektů napříč sekcemi zahrnuje stejné dostupné aktivní i neaktivní objekty; provozní finanční KPI zůstávají omezené na aktivní.
3. Český pozdrav používá výslovně známé tvary jmen, pro neznámé jméno, titul či firmu neutrální pozdrav.
4. Název nemovitosti a jednotka mají oddělovač; kontaktní karta vede do celého profilu nájemníka.
5. Basic má primární Platby; kontrola a párování účtů je dostupné z této sekce. Samostatná bankovní položka zůstává v Profi.
6. Před splatností se uvádí zvlášť od dluhu. Basic platby neukazují procento celého zvoleného rozsahu. Prázdná banka nevydává nulový seznam za připravené pohyby.
7. Karta nájemníka má tři hlavní finanční KPI: dluh po splatnosti, historické pohledávky, držená jistina. Součty všech předpisů jsou v rozbaleném detailu; Neuhrazené předpisy byly odstraněny z hlavního přehledu.
8. Portál drží preferované dvě horní karty, tři zkratky, kompaktní spodní karty, ikonové menu s aktivním stavem a responzivní mobilní navigaci.
9. Požadavky mají jediný formulář a historii. Zkratka Nahlásit závadu odkazuje na tuto sekci, spodní karta pouze shrnuje poslední požadavek.
10. Pozvánka, správa přístupu a náhled jsou dostupné z profilu, seznamu osob a jednotky. Z jednotky jsou viditelné i bez rozbalení dalších údajů.
11. Semafor rozlišuje aktivní účet odpovídající kontaktnímu e-mailu, platnou nevyřízenou pozvánku a absenci přístupu. Není ukazatelem online aktivity.
12. Pozvat, odebrat přístup a prohlédnout portál mohou správci s EDIT/ADMIN k jednotce či objektu. Náhled omezuje výběr smluv na spravované jednotky a nemá oprávnění k tenantovým mutacím. Samotný allProperties u read-only role není oprávnění ke správě portálu.
13. Platební detail uvádí český měsíc a rok, K úhradě, datum splatnosti, příjemce, účet a VS. QR generuje stávající ověřený platební mechanismus.
14. Historie obsahuje všechny aktivní předpisy včetně budoucích. Úhrady jsou zelené, otevřené budoucí splatnosti modré, prodlení červené. Každá bankovní částka má skutečné datum připsání, zápočty jsou výslovně oddělené.
15. Kontakt správce má velké tel: číslo, e-mail a avatar. Tenantův avatarový endpoint je omezen na správce jeho dostupné aktivní smlouvy. Chybějící údaje mají skutečný prázdný stav.
16. Můj účet obsahuje vlastní kreslený či nahraný podpis s náhledem, identitu vystavitele a výslovné povolení použití podpisu. Obrázek se ověří a normalizuje; nejde o kvalifikovaný elektronický podpis.
17. Dokumenty obsahují roletku plně uhrazených nájmů. Server ověří aktuální tenantův přístup, skutečné připsané úhrady ve stejné měně, oprávněného vystavitele a jeho podpis. Částečné platby, zápočty, budoucí bankovní transakce ani přerozdělená částka převyšující skutečný příjem nejsou podkladem pro potvrzení plné úhrady. PDF se ukládá jako finanční snapshot s unikátním otiskem; opakované generování stejného podkladu vrací stejný dokument. Staré PDF nemění pozdější úprava podpisu. Chybějící historický rozpis služeb se nedopočítává z dnešních smluvních částek.
18. Převzetí existující smlouvy, počáteční saldo, kauce a finanční evidence zůstávají obecné a dostupné i externím vlastníkům. Běžné vysvětlující texty používají FlatBerry místo interního FC kontextu.
19. Regresní kontrola zachovává původní testy založení smlouvy, účtu vlastníka, osobní identity, rozpisu služeb, avatarů a skutečného uploadu dokumentů. Sandbox merge se provede až po zeleném CI.

## Datový a bezpečnostní audit

Adiční migrace přidává volitelná nastavení podpisu a tabulku TenantPaymentReceipt. Nemění stávající bankovní částky ani alokace. PDF a snapshot jsou ukládány v databázi; vystavený doklad brání odstranění podkladového předpisu přes cizí klíč RESTRICT. Vydání dokladu běží v serializovatelné transakci s auditním záznamem a opakováním při souběhu. Tenant neposílá potvrzovanou částku, identitu vystavitele ani podpis.

Změna oprávnění portálu a nové potvrzení plateb jsou bezpečnostně citlivé části výslovně schváleného balíku. Náhled pouze čte, tenantovy mutační endpointy nadále vyžadují osobní TenantPortalAccess a shodu kontaktního e-mailu. Soukromý podpis se nenachází v publicUserSelect ani v klientských props.

## Ověření

Lokální statické kontroly: TypeScript, Prisma validate/generate, build, diff --check, finanční regresní verifikace a nová verify-portal-receipts. PDF render používá pouze syntetické údaje a syntetický podpis.

Izolované CI musí před mergem potvrdit migraci, úplnou sadu verifikátorů a Playwright včetně nového portal-receipts-and-scope. Prohlížečové důkazy obsahují skutečný render portálu na desktopu a mobilu a testovací PDF.
