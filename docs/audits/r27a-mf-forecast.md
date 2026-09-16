# R27A – MF benchmark a vlastní horizont scénářů

## Rozsah

Sandbox only, base `dd158d640f2766017aadef1cab8afd85fbbc22d1`, větev `r27a-mf-forecast`.

- Čárkovaná MF křivka v Kč/měsíc a přepínač MF. Skrytí neovlivňuje výpočet.
- Samostatný vlastní růst trhu −20 až +20 % ročně; pracovní presety −1 / 2 / 4 % nejsou prognózou MF.
- Vlastní horizont 1–360 měsíců / 1–30 let. Nad 60 měsíců roční přehled měsíčních částek, volitelně všechny měsíce.
- V2 odděluje dobu využití dnešního kladného MF rozdílu (výchozí 24 měsíců) od horizontu. Roční růst nájmu působí samostatně; růst MF nepřičítá další příjem.
- Při neúplném MF pokrytí se celková tržní křivka nezobrazuje, aby nebyla porovnávána část portfolia s celým. Jednotlivé reference zůstávají v tabulce.
- JSON snapshot v2 zmrazí předpoklady trhu; v1 uložené plány zachovávají původní výsledky včetně historického limitu smluvní indexace. Nové revize zachovávají model své řady.
- Rozšíření existujícího DB CHECK pro horizont; bez odstranění dat, tabulek nebo sloupců.
- Metodika obsahuje ovládání, numerický příklad, omezení a rozlišení nájemného, prodejní hodnoty, cashflow a návratnosti.

## Kontrolní příklady

1. Nájem 10 000 Kč, MF 12 000 Kč, využití 50 %, přiblížení 24 měsíců, růst nájmu 0 %: plán měsíc 12 = 10 500 Kč; měsíc 24 = 11 000 Kč. Prvních 12 měsíců je shodných pro horizont 12 a 240 měsíců.
2. Růst trhu 2 %: MF od měsíce 13 = 12 240 Kč; růst −2 % = 11 760 Kč. Příjmový plán se samotnou změnou tohoto předpokladu nemění.
3. Chybějící MF jedné jednotky zablokuje celkovou MF křivku; skutečná nulová reference zůstává nulou.
4. Snapshot v1 pro stejný příklad a horizont 12 měsíců zachová původních 11 000 Kč; v2 má 10 500 Kč. Změna se nepřenáší do schválené historie.
5. Dvacetiletý výpočet smluvní indexace pokračuje i po desátém výročí; cashflow obsahuje všech 240 měsíců a CAPEX jednou.
6. E2E: zadání záporného růstu, vlastní 20letý horizont, zachování předpokladů při navigaci, MF přepínač, uložení v2, schválení a nová revize se stejnými předpoklady, neměnnost původního snapshotu, dohledatelnost metodiky.

## Návazný blok – evidence výdajů

Předvyplnit známé náklady a dluhovou službu z evidence jednotky a vazeb úvěrů. U domovních nákladů použít pouze doložené přiřazení/podíl, zabránit duplicitám. Rozlišit skutečnost, rozpočet a uživatelskou variantu; zobrazit zdroj a datum. Chybějící náklady nejsou nula. Ruční zadání ponechat pro chybějící data a scénářové změny. Přepínač výdajů, milník kladného měsíčního cashflow a vyrovnání kumulovaného schodku následují až po tomto napojení. Současný ruční cashflow panel je jen rozšířen na delší horizont, splátka v něm zůstává konstantní.

## Ověření a stav

Lokálně: TypeScript; 8 nových výpočetních regresí a relevantní existující kontroly R4A/B/C. Production build prošel, stejně jako kontroly R4D, R15A a R23. Prisma validate prošla s izolovanou lokální adresou; běžící lokální PostgreSQL není k dispozici, migraci a DB/E2E ověří CI. První validate bez DATABASE_URL selhala na chybějící proměnné, nikoli na schématu.

Kompletní CI včetně izolované PostgreSQL migrace a Playwright, merge, Render a živý audit se doplní do PR po skutečném ověření. Dokud chybí živé ověření, blok není READY.

Předchozí živý audit R26B je stále BLOCKED automatickou kontrolou prohlížeče (kapacita vybraného review modelu). Tato změna jej neoznačuje za dokončený ani tuto bránu neobchází. Žádné reálné e-maily, platby či produkční změny. Syntetické E2E scénáře mají `R24_AGENT_QA_2026_09`.
