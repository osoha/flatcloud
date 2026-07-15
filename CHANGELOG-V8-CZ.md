# Změny ve FlatCloud Rent V8

## Banky

- prioritní přímý adaptér České spořitelny,
- samostatný šifrovaný souhlas/token každého uživatele,
- evidence uživatele, který účet připojil,
- ruční historické načtení od zvoleného data,
- deduplikace podle účtu a externího ID,
- hodinový Render Cron Job,
- globální frekvence 1–24 synchronizací denně,
- zapnutí/vypnutí automatické synchronizace po účtech,
- pouze příchozí transakce,
- oddělená fronta „Ke spárování“ a spárované platby.

## Párování

- automatické přiřazení podle VS,
- automatické přiřazení podle známého účtu plátce,
- vlastní pravidla ignorovat / spárovat / navrhnout,
- pravidla podle účtu, jména, VS, zprávy a částky,
- vytvoření pravidla přímo z detailu transakce,
- budoucí ignorování opakovaných nerelevantních příjmů,
- opětovné zpracování nespárovaných plateb.

## Uživatelé

- editace jména, e-mailu, role a stavu uživatele,
- práva VIEW / EDIT / ADMIN pro každou nemovitost,
- hlavní administrátor vidí a upravuje vše,
- administrátor nemovitosti může pozvat nové členy,
- přijetí pozvánky novým nebo existujícím účtem,
- e-mailové pozvánky přes Resend,
- zrušení čekající pozvánky.

## Databáze a bezpečnost

- nové tabulky UserInvitation a AppSetting,
- bankovní tokeny šifrované AES-256-GCM,
- nové vazby connectedBy na bankovní autorizaci a účet,
- externí ID účtu je unikátní v rámci poskytovatele,
- nedestruktivní migrace stávajících dat.
