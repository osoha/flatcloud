# FlatCloud Rent 1.21.3-hotfix.6

- Karty bankovních účtů uvádějí skutečně přiřazené jednotky ve formátu nemovitost – jednotka.
- Vlastník s rolí OWNER_VIEWER může bezpečně spravovat vlastní účet u jednotek, ke kterým má přístup; pokročilá pravidla zůstávají jen správcům.
- Návod bankovních notifikací vysvětluje prodlevu, doporučené čekání a přeposílání zpráv včetně České spořitelny.
- Obecné nerelevantní e-maily se ukládají do sekundární složky mimo pracovní počty; bankovně působící neúplné zprávy zůstávají ke kontrole.
- Adresa nemovitosti odkazuje na vyhledání celé adresy v Google Maps.
- Správce budovy a důležité kontakty mají přehledné kontaktní karty.
- Provozní deník používá čitelnější vlákno a české názvy známých systémových událostí.
- Historické finanční hodnoty archivovaných nemovitostí jsou vizuálně mírně potlačeny.

Databázová migrace: **není vyžadována**. Změna využívá stávající stav `InboxPaymentStatus.IGNORED` a existující vazby vlastnictví.
