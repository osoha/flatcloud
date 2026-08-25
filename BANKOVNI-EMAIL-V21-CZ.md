# Bankovní platby přes e-mail – V21

## Princip

FlatCloud se nepřihlašuje do banky. U účtu, na který chodí nájemné, se v internetovém bankovnictví nastaví e-mailové notifikace všech příchozích pohybů na centrální sběrnou adresu administrátora FlatCloudu.

### Jeden účet pro více nájemníků

To je standardní scénář. FlatCloud používá:

1. **cílový účet** – určí relevantní účet/vlastníka a množinu smluv,
2. **VS** – určí konkrétní aktivní nebo budoucí smlouvu,
3. **částku** – rozdělí platbu na otevřené předpisy; vznikne plná úhrada, částečná úhrada nebo přeplatek,
4. **účet plátce** – pomocná indicie, pokud chybí nebo nesedí VS.

Nejednoznačná platba se automaticky nezaúčtuje.

### Unikátnost VS

VS musí být unikátní mezi aktivními a budoucími smlouvami, které používají stejný bankovní účet pro nájemné. Stejný VS lze použít na jiném cílovém bankovním účtu.

## Nastavení účtu

1. Administrátor nastaví centrální IMAP schránku v **Administrace aplikace**.
2. U nemovitosti otevřete **Banka a pravidla** a připojte účet vlastníka/SPV.
3. V bance nastavte upozornění na všechny příchozí pohyby e-mailem na sběrnou adresu.
4. Odešlete testovací platbu **1,00 Kč** s VS zobrazeným u konkrétního účtu/nemovitosti.
5. Klikněte **Odeslal jsem testovací platbu – zkontrolovat schránku**.
6. Po nalezení notifikace se vazba označí jako **Ověřeno**.

Pokud stejný účet používá více nemovitostí, každá má vlastní testovací VS. Ověřovací koruna se nikdy nezaúčtuje jako nájemné.
