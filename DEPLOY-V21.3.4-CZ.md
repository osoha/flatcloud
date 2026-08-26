# Nasazení FlatCloud V21.3.4

1. Nahrajte celý release proti aktuálnímu `main`.
2. Render ponechte na standardním buildu a pre-deploy migraci.
3. V logu musí být `flatcloud-rent-production@1.21.3-hotfix.4`.
4. Nová migrace pouze přidává `Charge.manualOverride` s výchozí hodnotou `false`.
5. Po deployi ověřte:
   - logo v levém sidebaru,
   - `Administrace → Otestovat IMAP připojení` (prázdná schránka má skončit v sekundách),
   - objekt s více vlastníky nezobrazuje jeden ověřený účet jako ověření celého domu,
   - u konkrétního měsíčního předpisu lze přidat zápornou položku a změna přežije další automatickou synchronizaci,
   - globální `Předpisy` obsahují prokliky na jednotku a detail měsíce.
