# V23-A – Autonomous QA foundation

V23-A přidává opakovatelnou browser QA vrstvu pro FlatCloud. Neprovádí autonomní merge ani produkční deploy; připravuje pracovní větev a důkazy pro lidský release audit.

## Lokální spuštění

Použij izolovanou PostgreSQL databázi a testovací přihlašovací údaje. Nikdy nepoužívej produkční `DATABASE_URL`.

1. `npm ci`
2. `npx prisma migrate deploy`
3. nastav `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` a bezpečný testovací `SESSION_SECRET`
4. `npm run e2e:seed`
5. `npm run build`
6. `npm run e2e:prepare` připraví `public` a `.next/static` pro standalone server (příkaz se zopakuje automaticky i při startu Playwrightu)
7. `npx playwright install chromium`
8. `npm run test:e2e`

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

## V23-B – řízený vstup a dry run

V23-B přidává fail-closed vstupní bránu před samotnou autonomní implementací. Operátor založí jedno otevřené Issue pomocí šablony `Agent-ready úkol` a uvede cíl, povolený rozsah, checklist, rizikovou třídu, zakázané operace, povinné ověření a lidskou bránu.

Workflow `Agent intake dry run` se spouští ručně s jedním číslem Issue. Má pouze `contents: read` a `issues: read`, checkout neponechává přihlašovací údaje a výsledkem je sedmidenní auditní artefakt. Nemůže měnit kód, Issue, PR ani `main`; neobsahuje automatický merge, produkční secrets ani deploy.

První řízený cyklus je záměrně dvoufázový:

1. příjem Issue a audit vstupní smlouvy,
2. samostatná implementační větev → plné CI → browser smoke → `release-ready` audit → lidské rozhodnutí.

Skutečné bezobslužné spuštění `openai/codex-action` v GitHub Actions vyžaduje samostatný GitHub Secret `OPENAI_API_KEY` a API billing. Pro dry run V23-B se klíč nepoužívá ani neukládá. Dokud nebude samostatně schváleno jeho zavedení, provádí implementační část Codex z autorizované ChatGPT relace a GitHub zůstává společnou auditní pamětí.

Stav `READY_FOR_IMPLEMENTATION` pouze potvrzuje úplnost vstupu. Stav `release-ready` pouze potvrzuje zelené release gates. Ani jeden stav nepovoluje merge do `main`.

## V23-C – autonomní fronta a řízené opravné cykly

Workflow `Agent queue dry run` běží každou hodinu a lze jej spustit i ručně. Jde o deterministický, read-only heartbeat: načte otevřené Issues a PR, ale nesmí je upravit. Z fronty označené prefixem `[AGENT]` vybere nejvýše jeden nejstarší úkol. Pokud je vstup neúplný, má riziko HIGH nebo už existuje otevřený PR z větve `agent/issue-…`, skončí `BLOCKED` nebo `IDLE`; nikdy nepřeskočí nevalidní první úkol a nezačne další práci.

Výstupem je pouze auditní artefakt a strojově čitelné rozhodnutí. Workflow nemá write oprávnění, credentials pro push, `OPENAI_API_KEY`, Codex Action, merge ani deploy. Samotnou implementaci spouští autorizovaná ChatGPT/Codex relace podle auditovaného rozhodnutí.

Implementační řadič dodržuje následující smlouvu:

1. vytvoří větev `agent/issue-<číslo>-<slug>` a pracuje pouze v ní,
2. po změně spustí všechny relevantní verify kontroly, production build a Playwright smoke,
3. při selhání smí provést nejvýše **2 opravné cykly**; potom označí výsledek `needs-human`,
4. při zelených branách vytvoří nebo aktualizuje PR a audit `release-ready`,
5. nikdy sám nemerguje do `main`, nenasazuje produkci ani nepoužívá produkční data či secrets.

Nouzové zastavení je fail-closed: vypnutí workflow, odebrání prefixu `[AGENT]` nebo ponechání otevřeného agentního PR zabrání výběru dalšího bodu. Plánovaný heartbeat tedy frontu pouze kontroluje; právo měnit repozitář zůstává v oddělené autorizované relaci a konečný merge vždy vyžaduje výslovný lidský souhlas.
