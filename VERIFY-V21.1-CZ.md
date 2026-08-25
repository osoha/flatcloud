# Smoke test V21.1

1. V levém panelu je viditelné klikací logo FlatCloud.
2. Header obsahuje `Ruční platba`, `Nový úkol` a podle oprávnění `Přidat nemovitost`.
3. Z detailu nemovitosti otevřete `Nový úkol`; nemovitost musí být předvyplněná.
4. U úkolu typu Vymáhání / upomínka systém vyžaduje konkrétní smlouvu.
5. Detail upomínky ukazuje nájemníka, jednotku, smlouvu/VS a skutečný dluh po splatnosti.
6. Do vlákna přidejte Telefonát a Příslib úhrady; datum a částka příslibu jsou vidět přímo v timeline.
7. Na kartě nemovitosti klikněte na `Otevřené úkoly`, `Revize` a `Expirace`; odkazy musí otevřít odpovídající filtrovanou agendu.
8. Vytvořte smlouvu s automatickými předpisy. U doby určité ověřte celé období; u doby neurčité 12měsíční horizont.
9. Změňte nájemné a ověřte, že neuhrazené budoucí předpisy se přepočítají a uhrazené předpisy se nezmění.
10. Pokud je nastavena pevná procentní indexace, lze její logiku ověřit přes `npm run verify:v21.1` a testovací datum ve vývojovém prostředí.
11. V Renderu zůstává jediný cron `flatcloud-rent-scheduler`; vypnutý sběrný e-mail nesmí cron shodit.
