# FlatCloud Rent V13

## Horní navigace

- logo FlatCloud je odkaz na hlavní portfolio `/portfolio`,
- vedle tlačítka „Přidat nemovitost“ je nové globální tlačítko „Ruční platba“,
- tlačítko se zobrazuje pouze uživateli, který může editovat alespoň jeden objekt nebo jednotku.

## Globální ruční platby

- nová obrazovka `/platby/nova`,
- výběr ze všech nájemních vztahů, které má přihlášený uživatel právo spravovat,
- zahrnuty jsou aktivní, budoucí i ukončené smlouvy a aktivní i neaktivní nájemníci,
- platba se automaticky rozděluje na nejstarší otevřené předpisy vybraného nájemního vztahu,
- případný přeplatek zůstává navázaný na vybranou smlouvu přes `suggestedLeaseId`,
- výsledek je uložen jako standardní `BankTransaction` a `PaymentAllocation`, bez paralelního platebního modelu.

## KPI a reporty

KPI karty na portfoliu jsou klikací a otevírají reporty:

- výkonnost nemovitostí,
- portfolio podle vlastníků / SPV,
- vývoj předpisů za 12 měsíců,
- vývoj inkasa za 12 měsíců,
- saldo a přehled dlužníků včetně ukončených smluv a neaktivních nájemníků.

Reporty respektují objektová i jednotková oprávnění přihlášeného uživatele.

## Avatary uživatelů

- v editaci uživatele lze nahrát PNG, JPG nebo WebP do 2 MB,
- obrázek je kontrolován podle MIME typu i signatury souboru,
- avatar je uložen v PostgreSQL, aby nebyl závislý na dočasném disku Renderu,
- bez avataru se nadále zobrazují iniciály,
- avatar se zobrazuje v postranním panelu, seznamu uživatelů a profilu správce objektu.

## Technický pasport nemovitosti

- nová sekce „Technické údaje“ v detailu nemovitosti,
- typ a konstrukce budovy, roky výstavby a rekonstrukce,
- podlaží, plochy, vytápění, ohřev vody, PENB, výtahy a parkování,
- EAN/EIC, katastrální identifikace, pojištění a technická poznámka,
- bezbariérovost, sklepy a balkony/lodžie,
- údaje jsou uloženy v jednom strukturovaném poli `Property.technicalData` typu JSONB, bez zavádění dalších tabulek.

## Databáze

Nová nedestruktivní migrace:

`20260717080000_property_technical_avatar`

Přidává:

- `Property.technicalData` (`JSONB`),
- `User.avatarData` (`BYTEA`),
- `User.avatarMimeType` (`TEXT`).
