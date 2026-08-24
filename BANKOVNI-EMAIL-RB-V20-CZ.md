# Sběrný e-mail bankovních plateb – RB / V20

## Cíl

FlatCloud může načítat příchozí platby z notifikačních e-mailů Raiffeisenbank bez placeného bankovního agregátoru. Dedikovanou schránku čte přes IMAP jednou za hodinu společně se stávajícím bankovním cronem.

## Doporučené nastavení schránky

- samostatná adresa na vlastní doméně, např. `platby@vase-domena.cz`,
- IMAP přes TLS, obvykle port 993,
- pokud poskytovatel podporuje aplikační hesla, použít samostatné aplikační heslo,
- schránku nepoužívat pro běžnou korespondenci.

## Nastavení RB

Pro každý příjmový účet nastavte službu **Informuj mě** pro pohyb na účtu:

1. vyberte účet,
2. směr **Příchozí**,
3. způsob odeslání **E-mail**,
4. kontakt = sběrná adresa,
5. pokud je dostupný limit částky, nastavte ho tak, aby zachytil všechny relevantní nájemní platby,
6. nedoporučuje se filtrovat jen jeden VS – chybně zadané VS musí dojít do globální fronty.

Parser umí starší textovou šablonu s údaji `Z`, `Na`, `Realizováno`, `Dne`, VS/SS/KS i HTML e-mail. Banka může formát změnit; nerozpoznaná zpráva se proto nemaže a zobrazí se hlavnímu administrátorovi jako chyba k prověření.

## Logika párování

- ruční párovací pravidlo má vždy přednost,
- silná kombinace cílového účtu, VS a částky se účtuje automaticky,
- známý účet plátce bez shody částky se pouze navrhne,
- nejednoznačné platby se automaticky nezaúčtují,
- e-mail bez určeného objektu zůstává v globální frontě a `SUPER_ADMIN` ho může ručně přiřadit ke smlouvě.

## První test

1. uložte IMAP konfiguraci,
2. pošlete testovací příchozí platbu s VS existující smlouvy,
3. v Administraci klikněte **Zkontrolovat schránku nyní**,
4. zkontrolujte stav plánovače a nespárovanou frontu,
5. ověřte transakci u příslušné nemovitosti a alokaci na předpis.
