# FlatCloud Rent V21.2

Interní property-management aplikace FlatCloud pro správu nájemních nemovitostí, smluv, předpisů, plateb a každodenního provozu objektů.

## V21.2 – multi-bank platby a provozní automatizace

FlatCloud je nově orientovaný na otázku **„co právě vyžaduje pozornost“**. Portfolio i detail nemovitosti spojují ekonomiku, smluvní termíny a provozní agendu do jedné pracovní fronty.

Hlavní funkce:

- portfolio a provozní dashboardy nemovitostí,
- jednotky, nájemníci, smlouvy, předpisy, inkaso a pohledávky,
- bankovní platby přes centrální e-mailové notifikace a konzervativní automatické párování,
- fronta nespárovaných plateb,
- Úkoly a případová vlákna včetně automatických upomínkových případů,
- Revize a povinné kontroly,
- Důležité kontakty,
- auditní stopa a provozní deník,
- expirace a výročí smluv,
- role a oprávnění na úrovni portfolia, nemovitosti a jednotky,
- automatické platební zprávy a upomínky přes SMTP,
- automatická tvorba a průběžná synchronizace předpisů podle smlouvy,
- volitelná pevná procentní indexace nájemného při výročí,
- jednotný hodinový scheduler pro bankovní e-mail, předpisy a nájemní notifikace.

## Bankovní platby

FlatCloud nepoužívá přímé přihlášení do banky. Banky zasílají e-mailové notifikace příchozích plateb do centrální IMAP schránky. Parser je bank-agnostický: zpracuje běžné české účty podle bankovního kódu a pro neověřené formáty použije bezpečnou ruční frontu. Jeden bankovní účet může používat více nájemníků i více nemovitostí; platba se směruje primárně kombinací **cílový účet + VS**.

Podrobnosti: [`BANKOVNI-EMAIL-V21.2-CZ.md`](BANKOVNI-EMAIL-V21.2-CZ.md).

## Nasazení a ověření

- [`DEPLOY-V21.2-CZ.md`](DEPLOY-V21.2-CZ.md)
- [`VERIFY-V21.2-CZ.md`](VERIFY-V21.2-CZ.md)
- [`CHANGELOG-V21.2-CZ.md`](CHANGELOG-V21.2-CZ.md)
- [`ARCHITECTURE.md`](ARCHITECTURE.md)

## Lokální příkazy

```bash
npm ci
npx prisma migrate deploy
npm run db:bootstrap
npm run verify:v20
npm run verify:v21
npm run verify:v21.1
npm run verify:v21.2
npm run build
```
