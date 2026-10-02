# Bankovní pohyby podle účtu

Po polishi karty jednotky byl doplněn schválený blok společných bankovních účtů.

- `/platby/banka`: k řešení, ignorované a všechny pohyby účtů uživatele. Nevyžaduje určený dům ani VS. Historické ignorace se zobrazují podle cílového účtu bez přepisování starých dat.
- `/platby/banka/pravidla`: předvyplnění z pohybu, pravidla pro účet napříč domy, zapnutí/vypnutí.
- IGNORE funguje pro příchozí i odchozí pohyby, pro zvolený směr a měnu. Všechny vyplněné podmínky se vyhodnocují současně; prázdné pravidlo je odmítnuto.
- MATCH_LEASE a SUGGEST_LEASE mají konkrétní smlouvu na stejném účtu. Párování je pouze pro příchozí CZK; návrh nevytváří alokaci. Nejednoznačné stejně prioritní cíle zůstávají v ruční frontě.
- Pravidla působí na nové důvěryhodné notifikace před směrováním k domu. Nedůvěryhodný zdroj zůstává pro ruční potvrzení. Ověřovací platby mají přednost před pravidly.

## Oprávnění a audit

Vlastnictví účtu se odvozuje výhradně z `Owner.userId`, nikoli z podobnosti jména či e-mailu. Oprávněný správce má EDIT/ADMIN ke všem domům účtu (i historickým vazbám), případně existující oprávnění k celému portfoliu. Duplicitní evidence stejného fyzického účtu je posuzována společně. Grant k jedinému domu ani VIEW neotevírá zbytek účtu. Každý serverový POST kontroluje zdrojový účet a cíl znovu; změny neudělují nové uživatelské granty.

Známý účet má úkol u aktivního registrovaného vlastníka nebo dostupného správce celého účtu. Bez takového uživatele zůstává úkol nepřiřazený. Nerozpoznaný účet zůstává u hlavního administrátora. Přidělení úkolu samo neuděluje přístup.

Uložené pravidlo má unikátní fingerprint podmínek, účtu a cíle; jeho vytvoření i přepnutí se auditují. Nová migrace pouze přidává tabulku pravidel a indexy. Nemění historická zaúčtování, uživatelská oprávnění ani produkční bankovní data.

## Ověření

Čisté regrese ověřují směr, měnu, všechny podmínky, IBAN/domácí číslo, VS s nulami a přístup k úplnému účtu. Playwright na lokální/CI databázi ověřuje dva domy na stejném účtu, ignorovanou historii, předvyplněné vytvoření pravidla, budoucí ignoraci bez domu, odmítnutí cizího účtu a částečného správce, alokaci do zvolené smlouvy, pouhý návrh, vypnutí, duplicity, konfliktní cíle a nedůvěryhodné notifikace. Stávající testy ČSOB a bankovního směrování zůstávají součástí CI.

## Release

Sandbox je sjednocen s novějšími již schválenými produkčními opravami. Produkční release má zahrnout schválenou kartu jednotky (PR 223, 224) a tento blok. Samostatné dosud nevydané sandboxové úpravy nejsou automaticky součástí tohoto release.
