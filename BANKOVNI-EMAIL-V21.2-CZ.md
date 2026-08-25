# Bankovní platby přes e-mail – V21.2

## Princip

FlatCloud se nepřihlašuje do banky. Banka posílá e-mailové notifikace příchozích plateb do centrální IMAP schránky. V21.2 používá **bank-agnostický parser**: nejdřív vytěží platební údaje a teprve potom určí banku podle cílového účtu / IBANu.

Parser není omezený na konkrétní banku. U českých účtů používá 4místný kód platebního styku a vestavěný číselník ČNB (verze 253, platná od 1. 7. 2026), takže umí pojmenovat běžné české banky včetně KB, ČSOB, MONETA, České spořitelny, Fio, CREDITAS, UniCredit, Air Bank, Raiffeisenbank, mBank, Partners Banky a dalších.

## Dvě oddělené vrstvy

### 1. Rozpoznání platby

Obecná extrakce hledá bez ohledu na banku:

- částku a měnu,
- cílový účet / IBAN,
- účet a jméno plátce,
- VS / SS / KS,
- datum platby,
- zprávu / poznámku.

Pokud je rozpoznaná kladná částka a cílový účet, zpráva je bankovní platba a může jít do ruční fronty i tehdy, když pro danou banku ještě neexistuje speciální adaptér.

### 2. Důvěryhodnost zdroje

Automatické zaúčtování je přísnější než samotné rozpoznání. Vyžaduje ověřený sender adaptér pro konkrétní banku. V první verzi jsou reálnými notifikacemi ověřené RB / 5500 a Česká spořitelna / 0800. Další banky fungují přes univerzální parser okamžitě, ale do doby ověření jejich skutečné odesílací domény čekají na ruční potvrzení.

Tím se FlatCloud vyhne nebezpečné variantě, kdy by libovolný autentizovaný e-mail z cizí domény mohl předstírat bankovní platbu.

Pokud jsou k dispozici `Authentication-Results`, explicitní DMARC fail nebo současný SPF+DKIM fail zdroj zneplatní.

## Párování platby

1. cílový účet,
2. variabilní symbol,
3. částka pro rozdělení na otevřené předpisy,
4. účet plátce jako pomocná indicie.

Nejednoznačná platba se automaticky nezaúčtuje.

## Test 1,00 Kč

Ověřovací koruna potvrzuje vazbu bankovního účtu na nemovitost, nikoliv nájemní smlouvu nebo jednotku. Každá vazba má vlastní testovací VS. Úspěšná testovací platba se nikdy nezaúčtuje jako nájemné.

U banky bez ověřeného sender adaptéru může hlavní administrátor test ručně potvrdit; systém i tak vyžaduje přesnou shodu částky 1,00 Kč, cílového účtu a testovacího VS.

## Reprocess

Dříve uložený e-mail ve stavu ERROR / UNMATCHED lze znovu vyhodnotit tlačítkem **Znovu zpracovat parserem**. Pokud univerzální parser data přečte, ale zdroj zatím není automaticky důvěryhodný, položka zůstane ve frontě k ručnímu potvrzení místo chybového stavu.
