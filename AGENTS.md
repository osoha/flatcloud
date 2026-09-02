# FlatCloud agent rules

Tato pravidla platí pro automatické i interaktivní vývojové agenty v celém repozitáři.

## Povolená autonomie

- Pracuj pouze v samostatné pracovní větvi.
- Můžeš procházet a měnit repozitář, instalovat projektové závislosti, spouštět migrace nad lokální/CI databází, testy, lint, build a browser smoke testy.
- Můžeš commitovat a pushovat do pracovní větve a připravit pull request.
- Zachovej stávající architekturu a konvence; změny drž v rozsahu zadání a přidej regresní ověření.

## Povinné lidské brány

- Nikdy nemerguj ani nepushuj změny přímo do `main` bez výslovného souhlasu člověka po předložení auditu.
- Nikdy nenasazuj do produkce bez výslovného souhlasu člověka.
- Nikdy neměň produkční databázi, produkční secrets, oprávnění nebo externí produkční data.
- Destruktivní migrace, mazání dat, změny autentizace, plateb a bezpečnostních hranic vždy označ jako rizikové a vyžádej lidské rozhodnutí.

## Definition of ready

Před označením `READY` musí projít relevantní statické verifikace, Prisma validate/migrate nad izolovanou databází, production build, Playwright smoke testy a audit diffu. Při nejasnosti, selhání nebo chybějícím důkazu vrať `BLOCKED`; testy neobcházej a nesnižuj jejich přísnost jen kvůli zelenému výsledku.
