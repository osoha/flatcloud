# FlatCloud V21.3.4 – release blockers

Opravný release po produkčním testování V21.3.3.

- Bankovní ověření se vyhodnocuje podle jednotky → vlastníka → účtu, nikoli globálně podle objektu.
- Administrace má samostatný rychlý test IMAP spojení; test nestahuje zprávy a klient korektně reaguje na `end/close` a timeout.
- Sidebar používá nové transparentní bílé logo bez bílého obdélníku a s novou URL kvůli cache.
- Konkrétní měsíční předpis má editovatelný rozpad položek, záporné korekce/slevy a možnost odpuštění/vypnutí.
- Ručně upravený měsíční předpis dostává `manualOverride`; automatický generátor jej znovu nepřepíše.
- Celková částka měsíčního předpisu se dopočítává z položek; už se neupravuje odděleně od rozpadu.
- Globální report Předpisy zobrazuje konkrétní měsíční záznamy s prokliky na nemovitost, jednotku a detail předpisu.
