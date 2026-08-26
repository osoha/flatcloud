# Ověření FlatCloud V21.3

Po nasazení ověřte zejména:
- jednotka bez aktuální smlouvy je Volná,
- FUTURE smlouva jednotku před začátkem neobsadí,
- dvě překrývající FUTURE smlouvy nelze uložit,
- navazující smlouvy s koncem 31. 8. a začátkem 1. 9. lze uložit,
- aktivní smlouvu lze ukončit bez smazání nájemníka,
- FUTURE smlouvu lze zrušit a zůstane v historii,
- po skončení vztahu zůstávají viditelné historické předpisy a platby,
- opožděnou platbu lze přiřadit k ukončené smlouvě,
- u jednotky nelze ručně přepínat Volná / Obsazená,
- u smlouvy nelze ručně přepínat ACTIVE / FUTURE / ENDED,
- `npm run verify:v21.3` skončí hláškou `FlatCloud V21.3 lease lifecycle verification OK`.
