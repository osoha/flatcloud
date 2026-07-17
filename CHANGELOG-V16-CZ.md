# FlatCloud Rent V16 – změny

## Karta jednotky

- Stav jednotky má jemné barevné rozlišení podle obsazenosti, neobsazenosti, rekonstrukce nebo neaktivního stavu.
- Karty vlastníka, nájemníka a aktuálního předpisu jsou klikací.
- Karta dluhu po splatnosti posune stránku na došlé platby jednotky.
- Celý řádek měsíčního předpisu je klikací a otevře jeho detail.
- Vizitka hlavního nájemníka zobrazuje telefon, e-mail, adresu a další dostupné kontaktní údaje a vede na jeho detail.

## Seznamy a navigace

- Odstraněn zelený indikátor „Bankovní API“ z horní lišty.
- Navigace vlastníků je sjednocena pod názvem **Vlastníci a SPV**.
- Celé řádky vlastníků a uživatelských účtů jsou klikací.
- Profilová část karty přihlášeného uživatele vlevo dole vede do **Můj účet**; odhlášení zůstává samostatnou akcí.
- Duplicitní položky nastavení byly nahrazeny rozdělením na **Administrace aplikace** pro hlavního administrátora a **Můj účet** pro osobní nastavení.

## Pozvánky a bezpečnost

- Čekající pozvánku lze ručně smazat z globálního i objektového seznamu.
- Smazání je bezpečná revokace: token pozvánky přestane okamžitě fungovat, ale auditní záznam zůstane zachován.
- Revokace pozvánky nevytváří deaktivovaný účet a neblokuje případný existující účet se stejným e-mailem.
- Deaktivovaný uživatel se nemůže přihlásit a jeho existující session přestane fungovat při následujícím požadavku.

## Databáze

- Prisma schéma se nemění.
- V16 neobsahuje novou databázovou migraci.
