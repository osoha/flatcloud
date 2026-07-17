# FlatCloud Rent V17

Interní aplikace FlatCloud pro správu nájemních nemovitostí, jednotek, nájemníků, smluv, předpisů, plateb a bankovního párování.

## Hlavní funkce

- portfolio, nemovitosti a plně klikací seznamy nemovitostí, jednotek, vlastníků a uživatelů,
- vlastníci objektů a jednotlivých jednotek,
- fyzické i právnické osoby s rozšířenými kontaktními a fakturačními údaji,
- smlouvy na dobu určitou i neurčitou,
- automatický návrh a kontrola unikátního variabilního symbolu,
- další osoby evidované k nájemnímu vztahu,
- měřidla vody, elektřiny a plynu včetně historie odečtů,
- měsíční předpisy a dluh počítaný pouze po splatnosti,
- globální ruční platba ke kterémukoli spravovanému nájemnímu vztahu,
- bankovní synchronizace, párovací pravidla a fronta ke spárování,
- KPI reporty pro portfolio i jednotlivé nemovitosti,
- technický pasport budovy,
- oprávnění k celým objektům nebo konkrétním jednotkám,
- avatary uživatelů s automatickým ořezem a zmenšením,
- audit významných změn, revokace pozvánek a okamžité blokování deaktivovaných účtů,
- nastavitelné SMTP pro pozvánky i nájemní komunikaci,
- platební e-maily s QR kódem, automatické upomínky a interní eskalace,
- historie výzev, pozastavení upomínek a evidence slíbené úhrady,
- klikací KPI, předpisy, kontaktní vizitky a sjednocená navigace k profilu uživatele.

## Nasazení aktualizace

1. Rozbalte ZIP.
2. Nahrajte celý obsah do kořene stávajícího GitHub repozitáře.
3. Commitněte změny do větve `main`.
4. Render automaticky provede build, migrace a bootstrap administrátora.

Podrobnosti jsou v [`DEPLOY-V17-CZ.md`](DEPLOY-V17-CZ.md). Přehled změn je v [`CHANGELOG-V17-CZ.md`](CHANGELOG-V17-CZ.md).

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
