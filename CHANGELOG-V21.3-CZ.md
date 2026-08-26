# FlatCloud V21.3 – lifecycle nájemního vztahu

## Hlavní změny
- Nájemní smlouva je zdroj pravdy pro obsazenost jednotky. Volná / Obsazená se odvozuje automaticky podle platnosti smlouvy.
- Stav smlouvy Aktivní / Budoucí / Ukončená se odvozuje z dat a lifecycle událostí; uživatel jej ručně nepřepíná.
- Nájemník se při skončení vztahu nemaže ani nedeaktivuje. Historie smluv, předpisů, plateb a komunikace zůstává zachována.
- Přidáno samostatné ukončení aktivního nájmu a zrušení FUTURE smlouvy.
- FUTURE smlouvy jsou podporované bez toho, aby jednotku obsadily před datem začátku.
- API i PostgreSQL zabraňují překryvu nájemních období na jedné jednotce.
- Variabilní symbol se na stejném účtu vlastníka historicky nerecykluje.
- Opožděná platba bývalého nájemníka se může dál spárovat na jeho historický vztah.
- Provozní stav jednotky (standard / rekonstrukce / neaktivní) je oddělen od obsazenosti.
- Detail jednotky rozlišuje aktuální, budoucí a historické vztahy bez fallbacku na poslední smlouvu.

## Kompatibilita
Legacy sloupce `Lease.status` a `Unit.status` jsou v V21.3 dočasně ponechány jako odvozená cache kvůli bezpečnému rolling deployi. Aplikační logika z nich již nevychází jako ze zdroje pravdy.
