# FlatCloud Rent V20 – bankovní e-mail, párování a smluvní KPI

## Sběrný e-mail a Raiffeisenbank

- hlavní administrátor může v **Administraci aplikace** zapnout samostatnou IMAP schránku pro bankovní notifikace,
- přihlašovací heslo se ukládá šifrovaně stejným mechanismem jako bankovní tokeny / SMTP,
- stávající hodinový Render bankovní cron kontroluje vedle API také sběrnou schránku; není potřeba další placená Render služba,
- parser podporuje MIME text i HTML, quoted-printable/base64 a běžné české charsety,
- parser RB podporuje současné HTML notifikace i starší formát `Informuj mě` s poli `Z:`, `Na:`, `Realizováno:`, `Dne:`, VS/SS/KS,
- importují se pouze kladné příchozí částky; odchozí platba se nezaúčtuje jako nájemné,
- IMAP checkpoint se neposune přes zprávu, kterou se nepodařilo bezpečně uložit.

## Párování plateb

Původní ruční párovací pravidla mají nadále nejvyšší prioritu. Automatické vyhodnocení potom pracuje konzervativně s kombinací:

1. cílový účet vlastníka + VS + přesná otevřená částka,
2. cílový účet vlastníka + VS,
3. VS + přesná otevřená částka,
4. známý účet plátce + přesná otevřená částka,
5. jednoznačný VS,
6. samotný známý účet plátce pouze jako návrh (`SUGGESTED`).

Nejednoznačné případy zůstávají `UNMATCHED`.

## Globální fronta nespárovaných plateb

- nová stránka **Nespárované platby** je dostupná pouze `SUPER_ADMIN`,
- obsahuje standardní bankovní transakce `UNMATCHED` / `SUGGESTED` i nerozhodnuté / chybové e-mailové notifikace,
- e-mail bez jednoznačného objektu lze ručně přiřadit k libovolné aktivní / budoucí smlouvě; následně vznikne standardní `BankTransaction` a úhrada se rozpočítá na otevřené předpisy,
- nerelevantní e-mail lze označit jako ignorovaný,
- počet položek je vidět v navigaci a v globálním KPI portfolia.

## Expirace a výročí smluv

- nové KPI **Smlouvy do 3 měsíců** ukazuje konce a nejbližší výročí aktivních smluv v následujících třech kalendářních měsících,
- samostatná stránka kalendáře je řazena podle nejbližší události,
- KPI funguje globálně i pro konkrétní nemovitost.

## Databáze

V20 přidává migraci `20260824133000_inbound_bank_email_contract_alerts`:

- nový model `InboxPayment`,
- nový enum `InboxPaymentStatus`,
- IMAP konfiguraci a checkpoint do `AppSetting`,
- `recipientAccount` a `source` do `BankTransaction`.
