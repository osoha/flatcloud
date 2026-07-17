# FlatCloud Rent V14

Interní aplikace FlatCloud pro správu nájemních nemovitostí, jednotek, nájemníků, smluv, předpisů, plateb a bankovního párování.

## Hlavní funkce

- portfolio, nemovitosti a bytové / nebytové jednotky,
- vlastníci objektů a vlastníci jednotlivých jednotek,
- nájemníci, smlouvy a verzované pravidelné položky,
- měsíční předpisy a alokace příchozích plateb,
- globální ruční platba ke kterémukoli spravovanému nájemnímu vztahu,
- bankovní synchronizace, párovací pravidla a fronta ke spárování,
- klikací KPI reporty pro portfolio i jednotlivé nemovitosti, vlastníky, předpisy, inkaso a saldo,
- přehled dlužníků včetně ukončených smluv a neaktivních nájemníků,
- technický pasport budovy,
- uživatelská oprávnění k celým objektům nebo konkrétním jednotkám,
- samoobslužné avatary uživatelů s automatickým ořezem, zmenšením a fallbackem na iniciály,
- audit významných změn.

## Nasazení aktualizace

1. Rozbalte ZIP.
2. Nahrajte celý obsah do kořene stávajícího GitHub repozitáře.
3. Commitněte změny do větve `main`.
4. Render automaticky provede build, migrace a bootstrap administrátora.

Podrobnosti jsou v [`DEPLOY-V14-CZ.md`](DEPLOY-V14-CZ.md). Migrace jsou nedestruktivní a stávající data zůstávají zachována.

## Architektura

Aktuální databázové vazby, oprávnění, konvence a přijatá rozhodnutí jsou průběžně udržovány v [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Lokální spuštění

```bash
npm ci
npx prisma migrate deploy
npm run db:bootstrap
npm run dev
```

## Produkční ověření

```bash
npm run build
```

Skript provede `prisma generate` a následně `next build`.
