# V23-A – Autonomous QA foundation

V23-A přidává opakovatelnou browser QA vrstvu pro FlatCloud. Neprovádí autonomní merge ani produkční deploy; připravuje pracovní větev a důkazy pro lidský release audit.

## Lokální spuštění

Použij izolovanou PostgreSQL databázi a testovací přihlašovací údaje. Nikdy nepoužívej produkční `DATABASE_URL`.

1. `npm ci`
2. `npx prisma migrate deploy`
3. nastav `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` a bezpečný testovací `SESSION_SECRET`
4. `npm run e2e:seed`
5. `npm run build`
6. `npx playwright install chromium`
7. `npm run test:e2e`

Demo seed je deterministický a nedestruktivní: pokud databáze už obsahuje nemovitosti, skončí bez jejich přepsání. CI proto pro každý běh vytváří čistou databázi `flatcloud_e2e`.

## CI gates

1. `build`: Prisma migrace, všechny historické verify skripty, V23-A kontrola a production build.
2. `browser-smoke`: po úspěšném buildu založí testovacího administrátora, vloží demo data, spustí aplikaci a provede kritické scénáře v Chromiu.
3. Při selhání se na sedm dní uloží HTML report, trace, screenshot a video, pokud je Playwright vytvořil.

## Výstup agenta

- `READY`: oba CI joby jsou zelené, diff odpovídá zadání, nejsou skryté chyby a audit obsahuje změněné soubory, testy a rizika. Stav znamená pouze „připraveno k lidskému schválení“.
- `BLOCKED`: některý gate selhal, výsledek je nejednoznačný nebo chybí důkaz. Agent přiloží příčinu a bezpečný další krok; do `main` nic nemerguje.

## Hranice V23-A

Tato fáze staví QA základ. Automatické vybírání 1–2 GitHub issues, opravné smyčky a `release-ready` štítky patří do navazující fáze až po ověření stability V23-A na reálných pull requestech.
