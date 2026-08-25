# FlatCloud Rent V21.1 – UX polish a automatizace předpisů

## Úkoly a navigace

- návrat klikacího loga FlatCloud do levého panelu,
- globální tlačítko `+ Nový úkol` v headeru,
- kontextové předvyplnění nemovitosti / smlouvy při založení úkolu,
- notifikační badge v levém menu pro úkoly, revize, smluvní termíny a nespárované platby,
- položky „Stav objektu“ jsou přímé odkazy do příslušných agend,
- detail úkolu je přepracovaný na čitelné diskusní vlákno s autorem, časem, typem události a strukturovaným příslibem úhrady,
- upomínkový úkol vytvořený ručně musí být navázaný na konkrétní smlouvu,
- dluh v upomínkovém případu zobrazuje pouze skutečný dluh po splatnosti.

## Automatické předpisy

- při založení smlouvy je automatická tvorba předpisů standardně zapnutá,
- smlouva na dobu určitou dostane předpisy na celé sjednané období,
- smlouva na dobu neurčitou udržuje průběžný horizont 12 měsíců,
- prodloužení / zkrácení smlouvy automaticky doplní nebo deaktivuje neuhrazené budoucí předpisy,
- změna nájemného nebo služeb se promítne do neuhrazených předpisů od aktuálního období; uhrazená historie se nemění,
- historické verze pravidelných položek zůstávají zachované přes `validFrom` / `validTo`,
- volitelná pevná procentní indexace nájemného se provede při výročí smlouvy a následně přepočítá budoucí předpisy,
- unikátní DB vazba `leaseId + period` nadále brání duplicitním předpisům.

## Scheduler / Render

- dva samostatné cron services byly sloučeny do `flatcloud-rent-scheduler`,
- scheduler každou hodinu: zkontroluje bankovní e-mail, udržuje předpisy/indexaci a vyhodnotí nájemní notifikace,
- nenastavený nebo vypnutý sběrný e-mail je bezpečný `skip`, nikoli chyba Render cronu,
- skutečné provozní chyby jednotlivých kroků se auditují a mohou cron označit jako failed.
