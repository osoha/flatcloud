# FlatCloud Rent V21.3.5

- Bankovní e-mailové notifikace nyní vytvoří transakci jen při silné vazbě na nájem nebo explicitním matching rule; ostatní známé příjmy se uchovají jako `IGNORED` mimo pracovní frontu.
- Hlavní administrátor vidí posledních 100 ignorovaných bankovních notifikací v samostatné sekundární sekci.
- Automatické párování už nepoužije globální shodu VS bez ověření správného cílového účtu vlastníka.
- Portfolio oprávněných administrativních rolí zobrazuje archivované nemovitosti odděleně; KPI a provozní fronty zůstávají omezené na aktivní objekty.
- Vlákno úkolu řadí nejnovější odpovědi a události nahoře.
- Typografie V21 má na desktopu lepší čitelnost při zachování kompaktního rozložení.

Release nevyžaduje změnu DB schématu ani databázovou migraci.
