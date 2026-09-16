# R27B – přehled expirací a testovací bytový dům

## Změny

Pod grafem aktuálního i uloženého scénáře: počet smluv na dobu neurčitou, končících v horizontu a končících později. Vysvětlení vodorovného příspěvku neurčitých smluv bez indexace. Expirační upozornění se vztahuje pouze na příjem z končících smluv, nikoli automaticky na celý dům.

Samostatný cílený seed vytvoří syntetického externího vlastníka, jeden dům a 12 bytů s nájemními vztahy. Vše označeno `R24_AGENT_QA_2026_09`. Bez e-mailových adres, bankovních účtů, předpisů, plateb, automatické tvorby předpisů a skutečných osobních údajů. Lokalitě se nevymýšlí oficiální MF reference.

| Byty | Původní délka | Zbývající měsíce od měsíce vytvoření | Indexace |
|---|---|---|---|
| V01–V08 | 12 měsíců | 1, 2, 3, 4, 6, 8, 10, 12 | Bez |
| V09 | 24 měsíců | 24 | Bez |
| V10 | 36 měsíců | 36 | 2 % od 13. měsíce |
| V11 | Neurčitá | — | Bez |
| V12 | Neurčitá | — | 3 % od 13. měsíce |

Nájem V01 je 10 000 Kč, každý další byt +500 Kč. Zálohy 2 500 Kč/byt jsou evidované zvlášť a nevstupují do nájemní křivky.

## Kontrolní hodnoty k prvnímu měsíci

- Smluvní nájem začíná na 153 000 Kč; druhý měsíc 143 000 Kč, třetí 132 500 Kč.
- Ve 13. měsíci po osmi expiracích a indexacích zbývá 59 755 Kč.
- Ve 37. měsíci zbývají dvě neurčité smlouvy: 31 937,27 Kč.
- Samostatný výpočet deseti určitých smluv má od 37. měsíce nulu. LIVE filtr zatím vybírá nemovitost, nikoli podmnožinu těchto jednotek; tato kontrola je automatická regrese.
- Přehled počtů pro horizont 12 / 24 / 36 měsíců: neurčité vždy 2; expirující 8 / 9 / 10; pozdější 2 / 1 / 0.
- Nájemní plán pokračuje s modelovou vacancy. Skutečné automatické prodloužení ani nájem po konkrétním přeobsazení se nevytváří.
- Měsíční model zahrnuje celý měsíc expirace; netvrdí denní poměrné krácení.

## Ochrana dat a opakování

Seed používá stabilní ID `r27b_forecast_test_house`, insert-only Serializable transakci a ochranu cíle. Při existujícím datasetu nemění nájem, data, indexaci ani archivaci. Odlišná struktura znamená chybu, nikoli přepis. Opakované spuštění nikdy neposouvá expirace. Kotva je měsíc prvního vložení v českém kalendáři; přesné datum je v auditu.

Nepřipojeno k migracím, obecnému demo seedu ani bootstrapu. Vlastník/dům není konsolidovaným aktivem FlatCloudu. Přístup automaticky nedostávají další uživatelé; role s omezeným rozsahem vyžadují pozdější vědomé přiřazení v administraci.

## Spuštění po obnovení schválené administrační cesty

Pouze v shellu určené Render sandbox služby `srv-dacselkmqu1s73bmjoq0`, větev `sandbox/ux-agent`:

```sh
FORECAST_QA_CONFIRM=R24_AGENT_QA_2026_09 node --import tsx scripts/seed-forecast-test-house.ts
```

Guard ověřuje skutečné prostředí `RENDER_SERVICE_ID` i `RENDER_GIT_BRANCH`; tyto hodnoty se nemají ručně podvrhovat. Alternativně je povolen localhost/CI host. Operátor musí zajistit, že jde skutečně o izolovanou testovací databázi; hostname sám izolaci nedokazuje. Chybějící identifikace sandboxu znamená stop. K založení není důvod spouštět obecný `db:seed:demo`.

Po vložení: `/reporty?view=forecast&properties=r27b_forecast_test_house&horizon=36`.

## Brány a audit

Lokální výpočetní kontrola ověřuje délky, aktivitu, přesné schody nájmu, nulový konec určité části a zamítnutí nepovoleného cíle. CI prohlížečový test vytvoří celý dům v izolované DB, ověří opakování s jiným datem, počty v grafu, mobilní šířku a zachování archivace/historie.

Živé vložení není součástí automatického deploye. Nadále otevřená blokace cloudového browser approval z předchozího auditu se neobchází serverovým seedem. Dokud není autorizovaná živá cesta obnovena a data vložena, nesmí být dům prezentován jako existující v sandboxu. Výsledky CI, merge a nasazení budou doloženy v PR.
