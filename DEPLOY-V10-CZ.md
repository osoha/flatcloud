# Nasazení V10 na Render

1. Nahrajte obsah ZIPu do kořene existujícího GitHub repozitáře.
2. Commitněte změny do větve `main`.
3. Render spustí build a před nasazením aplikuje Prisma migraci.
4. V logu zkontrolujte migraci `20260716130000_stable_members_owners_charges`.

Build přidává soubor `public/flatcloud-logo.png`; ověřte, že byl nahrán do GitHubu.
