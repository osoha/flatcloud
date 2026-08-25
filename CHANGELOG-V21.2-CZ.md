# FlatCloud Rent V21.2 – univerzální bankovní e-mailové notifikace

## Bank-agnostický parser

- parser už není omezený na Raiffeisenbank ani Českou spořitelnu,
- nejdřív obecně vytěží částku, měnu, cílový účet / IBAN, účet a jméno plátce, VS/SS/KS, datum a zprávu,
- banku určí primárně podle 4místného kódu cílového účtu,
- vestavěný číselník českých bank vychází z adresáře ČNB 253 platného od 1. 7. 2026,
- neznámý formát banky už není chyba: pokud jsou rozpoznané platební údaje, zpráva jde do ruční fronty,
- technické zdroje `rb-email` / `email-rb` se migrují na obecné `bank-email` / `email-bank`.

## Bezpečnost zdroje

- rozpoznání platby a povolení automatického importu jsou dvě oddělené věci,
- automatické zpracování vyžaduje ověřený sender adaptér dané banky,
- RB / 5500 a Česká spořitelna / 0800 zůstávají první ověřené reálné formáty,
- ostatní české banky fungují univerzálně přes parser a ruční potvrzení bez nutnosti nového workflow,
- parser čte `Return-Path` a `Authentication-Results`,
- explicitní DMARC fail nebo současný SPF+DKIM fail zablokuje automatický import,
- spoofovaný e-mail může být nanejvýš nabídnut k ruční kontrole, nikdy se sám nezaúčtuje.

## Testovací platba 1 Kč

- platba 1,00 Kč se nepřiřazuje k nájemní smlouvě ani prázdné jednotce,
- ověřuje vazbu **nemovitost + bankovní účet**,
- systém kontroluje přesnou shodu cílového účtu a testovacího VS,
- hlavní administrátor může bezpečně potvrdit test i u banky, jejíž sender ještě není v automatickém trust registru.

## Reprocess

- ERROR / UNMATCHED e-maily lze znovu zpracovat aktuálním parserem,
- nově rozpoznaná zpráva z dosud neověřené banky přejde do ruční fronty místo dalšího ERROR,
- díky tomu lze opravit i již uložené notifikace bez resetu IMAP checkpointu.
