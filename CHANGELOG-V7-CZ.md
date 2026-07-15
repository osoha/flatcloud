# FlatCloud Rent V7

## Více vlastníků

- Jedna nemovitost může mít více vlastníků a evidenční podíly.
- Každá jednotka může mít jednoho nebo více odlišných vlastníků.
- Dosavadní vlastník se při migraci automaticky převede na 100% podíl.
- Bankovní účet lze přiřadit objektu/SVJ nebo konkrétnímu vlastníkovi.

## Bankovní sandbox

- Přidán adaptér Enable Banking pro autorizaci účtu, načtení účtů, zůstatků a transakcí.
- Připojení používá redirect/callback tok a soukromý RSA klíč uložený pouze v Render Environment.
- Pro sandbox lze použít Mock ASPSP.
- Po připojení se transakce automaticky načtou a projdou párovacím enginem.

## Párování

- Automatické párování podle variabilního symbolu.
- Automatické párování podle známého účtu plátce u nájemníka.
- Vlastní pravidla: ignorovat, automaticky párovat, pouze navrhnout.
- Podmínky pravidla: bankovní účet, IBAN protistrany, jméno, VS, zpráva a částka.
- Z konkrétní transakce lze vytvořit trvalé ignorační pravidlo pro budoucí opakování.
- Ruční přiřazení transakce k otevřenému předpisu.
- Rozlišení spárované platby, částečné úhrady a přeplatku.
