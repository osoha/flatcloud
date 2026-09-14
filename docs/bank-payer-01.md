# BANK-PAYER-01 — účet protistrany v bankovní notifikaci

Uživatel doložil nesoulad: původní text České spořitelny obsahuje „Číslo účtu protistrany“, zatímco detail uložených informací ukazuje prázdný účet plátce. Čísla skutečných účtů a screenshoty se do repozitáře nepřenášejí.

## Oprava

Parser rozpoznává explicitní názvy Číslo účtu protistrany / Účet protistrany, včetně variant bez diakritiky. Stávající normalizace zachovává význam předčíslí a kód banky. Mapování counterpartyAccount do InboxPayment při synchronizaci i znovuzpracování a zobrazení v detailu již existují.

Rozsah je pouze extrakce účtu protistrany. Pravidla rozpoznávání cílového účtu, částky, důvěryhodnosti a párovací algoritmus se nemění. Doplněný účet může být vstupem již existujících párovacích pravidel; nejde o potvrzení identity plátce podle čísla účtu. Jméno není doplňováno, pokud ho zdroj neobsahuje.

## Důkazy

Dvě parserové regrese nejprve selhaly na chybějícím účtu (undefined) a po opravě procházejí. Testují předčíslí, aliasy, obrácené pořadí účtů, HTML, nepřevzetí cílového účtu, neověřený zdroj a selhané ověření zdroje; RB zůstává pokrytý. Třetí scénář v izolovaném CI znovuzpracuje syntetický neověřený e-mail přes UI, ověří uložený účet a jeho zobrazení, původní obsah, stejné ID zprávy a audit bez vzniku transakce. Žádné IMAP/SMTP spojení ani reálná zpráva nejsou pro test potřeba.

Finální úplné CI, merge pouze sandbox/ux-agent a přesný deploy se doplní do PR. Produkční pilot je samostatný budoucí krok s výběrem projektu a konkrétním rozsahem, nikoli součást tohoto patche.

## Historické zprávy

Deploy sám nemění již uložená data. Starší zaúčtované e-maily nelze přes stávající reprocess znovu importovat. Nebyl zaveden hromadný backfill ani změna původního párování. Případné doplnění historických metadat vyžaduje samostatný auditovatelný postup se zachováním originálu a vazeb; nesmí se kvůli němu vytvářet duplicitní transakce.
