# Smoke test V21.2

1. Globální fronta používá **Bankovní e-maily bez objektu**, nikoliv RB-specific názvy.
2. ČS notifikace na účet `/0800` se zobrazí jako **Česká spořitelna · 0800**.
3. RB notifikace na účet `/5500` se zobrazí jako **Raiffeisenbank · 5500**.
4. Testovací zpráva na `/2010` se rozpozná jako **Fio banka**, i bez speciálního Fio adaptéru; zůstane k ručnímu potvrzení.
5. Totéž ověřte pro další kód, např. `/0100`, `/0300`, `/0600`, `/2700`, `/3030` nebo `/6363`.
6. E-mail z neověřené domény se nikdy automaticky nezaúčtuje, i když text napodobuje známou banku.
7. Explicitní DMARC fail blokuje automatický import.
8. Platba 1,00 Kč zobrazuje **Ověření bankovního účtu**, nikoliv seznam nájemních smluv.
9. Ruční potvrzení testu 1 Kč vyžaduje shodu cílového účtu i testovacího VS.
10. U starého ERROR/UNMATCHED e-mailu funguje **Znovu zpracovat parserem**.
11. Běžná platba z banky bez trusted sender adaptéru může být po rozpoznání ručně přiřazena k ACTIVE/FUTURE smlouvě.
12. `npm run verify:v20`, `verify:v21`, `verify:v21.1`, `verify:v21.2` a `npm run build` jsou zelené.
