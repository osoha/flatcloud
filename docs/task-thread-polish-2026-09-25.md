# Úkoly: komentáře a skupinové zmínky – 25. 9. 2026

Schválený návrh: kompaktní editor nahoře, větší text a obrysový SmilePlus pro reakce, oddělené komentáře, méně výrazné systémové události, přepínač Jen komentáře a odpověď označením autora. Přehled zmínek není trvale v editoru; odkaz na nápovědu vede do metodiky.

## Kontext editoru

- Obecné, technické, revizní a běžné automatické úkoly: jednoduchý komentář.
- Ruční úkol k nájemnímu vztahu navázaný na jednotku, nájemníka nebo smlouvu: poznámka, telefonát, e-mail.
- Vymáhání s touto vazbou: navíc příslib úhrady, pouze v otevřeném stavu a mimo řízenou CAPEX realizaci. Automaticky vzniklé vymáhání zachovává tuto účelnou výjimku.
- Pravidla kontroluje také server. Historické záznamy zůstávají beze změn.

## Zmínky a upozornění

- `@all` a `@board`: stejná skupina oprávněných aktuálních účastníků úkolu.
- `@flatcloud`: skrytý ručně napsaný příkaz pro skupinu FC; respektuje existující model, kde hlavní administrátor patří do interního kontextu vždy. Běžný našeptávač ani veřejná metodika jej nepropagují.
- Skupina FC se může oslovit i mimo seznam účastníků, pouze pokud už má přístup k úkolu a viditelnosti záznamu. Zmínka nikomu nepřidává oprávnění ani členství v úkolu.
- Skupiny se z textu rozpoznávají a příjemci znovu vyhodnocují na serveru. Duplikáty a autor se vynechají. Uživatel vidí počet adresně oslovených osob; skutečný e-mail respektuje jejich preference a kontrolu přístupu před odesláním.
- Beze změny databázového schématu a migrací. Existující ochrany testovacích adres a sandboxových e-mailů zůstávají aktivní.

## Ověření

- Pravidla rozpoznání skupin, hranic tokenů, deduplikace, členství a kontextového editoru: `node --import tsx scripts/verify-task-thread-polish.ts` – prošlo.
- Prisma validate – prošlo; žádná nová migrace.
- Produkční build na Node 22.23.1: `npm run build -- --webpack` – prošlo.
- Nutná související oprava buildu: stránka dokumentů používá již existující helper z `lib/documents/catalog.ts`; odstraněn nepovolený duplicitní export ze stránky Next.js.
- Přidány Playwright regresní scénáře pro skupiny, viditelnost FC, odmítnutí nesouvisejícího příslibu, čitelnost ikony a screenshoty ve světlém/tmavém režimu a na mobilu. Aktualizovány selektory starších testů podle nových popisků. Souběh příslibu a uzavření se testuje na skutečném vymáhání.
- Integrační testy a vizuální kontrola skutečné aplikace zatím neproběhly: prostředí nemá lokální PostgreSQL ani Chromium. Připravené testy jsou součástí standardního CI po vytvoření PR.

## Předání

Pracovní větev: `feat/task-thread-polish`, základ `sandbox/ux-agent` na `f9e063d085d96232303a494815deeb8b510c6bcd`.
Push byl dvakrát zamítnut automatickým schvalováním: neuznalo dřívější souhlas jako oprávnění publikovat tuto změnu do `osoha/flatcloud`. Nebyla použita jiná cesta zápisu. Dokončení PR, CI, vizuálního ověření a sandboxového nasazení čeká na výslovné potvrzení uživatele. Stav není READY ani nasazeno.
