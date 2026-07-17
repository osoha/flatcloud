# FlatCloud Rent V8 – bankovní napojení, uživatelé a párování plateb

Produkční webová aplikace pro správu nájemních nemovitostí oddělených podle objektu, vlastníka/SPV a uživatelských oprávnění.

## Hlavní funkce

- více vlastníků jednoho objektu a vlastníci jednotlivých jednotek,
- jednotky, nájemníci, smlouvy, pravidelné položky a měsíční předpisy,
- přímý konektor připravený pro Premium API České spořitelny,
- samostatný bankovní souhlas a šifrované tokeny každého uživatele,
- volitelný Open Banking konektor pro další banky,
- automatická synchronizace přes Render Cron Job,
- frekvence 1–24 synchronizací denně nastavitelná hlavním administrátorem,
- ruční historické načtení transakcí od zvoleného data,
- ochrana proti duplicitám podle bankovního účtu a externího ID transakce,
- zpracování pouze příchozích plateb,
- fronta „Ke spárování“, ruční přiřazení a pravidla podle VS, účtu plátce, jména, zprávy nebo částky,
- pravidla pro automatické ignorování budoucích nerelevantních příchozích pohybů,
- editace uživatelů a práv ke každé nemovitosti,
- e-mailové pozvánky nových členů,
- audit změn a bankovních synchronizací.

## Nasazení aktualizace

1. Rozbalte ZIP.
2. Nahrajte celý obsah do kořene stávajícího GitHub repozitáře.
3. Commitněte změny do větve `main`.
4. V Renderu proveďte **Blueprint → Sync Blueprint**, protože V8 přidává hodinový Cron Job a nové proměnné prostředí.
5. Zadejte nové tajné hodnoty podle `DEPLOY-V8-CZ.md`.
6. Spusťte nový deploy webové služby a cron služby.

Migrace jsou nedestruktivní. Stávající uživatelé, objekty, smlouvy, předpisy a platby zůstávají zachovány.

## Důležitá podmínka přímého API České spořitelny

Zdrojový kód obsahuje připravený přímý konektor a konfigurovatelné API cesty. Produkční technické URL, rozsahy oprávnění a klíče poskytne Česká spořitelna po registraci aplikace na Erste Developer Portalu a schválení zvoleného modelu přístupu.

Pokud přes aplikaci připojují účty různí vlastníci a externí klienti, jde z pohledu banky typicky o přístup k účtům třetích stran. Ten může vyžadovat PSD2 oprávnění nebo individuální smlouvu s bankou. Do získání tohoto přístupu lze otestovat aplikační logiku přes mock nebo licencovaného Open Banking poskytovatele.

## Dokumentace v balíčku

- `DEPLOY-V8-CZ.md` – aktualizace GitHubu a Renderu,
- `BANKOVNI-NAPOJENI-V8-CZ.md` – Česká spořitelna, historie, cron a párování,
- `CHANGELOG-V8-CZ.md` – přehled změn.

## Architektura

Aktuální struktura databáze, vazby, oprávnění a projektové konvence jsou udržovány v souboru [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Lokální spuštění

```bash
npm ci
npx prisma migrate deploy
npm run db:bootstrap
npm run dev
```

## Ověření

Prisma schéma bylo validováno přes interní DMMF parser. Projekt prošel kompletní TypeScript kontrolou a produkčním `next build`. Render při běžném buildu provede vlastní `prisma generate` se stažením příslušného Prisma enginu.
