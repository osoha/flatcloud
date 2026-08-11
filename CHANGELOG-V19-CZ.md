# FlatCloud Rent V19 – spolehlivé upomínky a ruční vynucení

## Opravy

- automatický Render cron pro upomínky nyní přebírá `SESSION_SECRET` a `BANK_TOKEN_ENCRYPTION_KEY` přímo z webové služby,
- cron přebírá z webové služby také fallback SMTP proměnné (`SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`),
- dešifrování umí bezpečně vyzkoušet oba podporované klíče a při chybě poskytne srozumitelnější diagnostiku,
- pokud nelze databázové SMTP heslo dešifrovat, ale je dostupné `SMTP_PASSWORD` v prostředí, použije se bezpečný fallback,
- neúspěšná nebo přeskočená upomínka už neblokuje další pokus; jako dokončená se považuje pouze skutečně odeslaná zpráva.

## Upomínkový kalendář

- milník upomínky je nově stabilně svázán s datem splatnosti, nikoli s dnem, kdy zrovna proběhl cron,
- běžná automatická i ruční kontrola dožene zmeškané splatné milníky,
- každý stupeň se po úspěšném odeslání odešle pouze jednou,
- zmeškané platební údaje před splatností se doženou pouze do dne splatnosti; po splatnosti se použije upomínkový tok.

## Vynucené rozeslání

V Administraci přibyla samostatná obrazovka **Vynutit rozeslání mimo kalendář**:

- zobrazí náhled dotčených smluv a neuhrazených předpisů,
- ukáže příjemce, dluh, nejstarší splatnost a stupeň, který se odešle,
- vyžaduje výslovné potvrzení,
- ignoruje standardní počet dní pro 1. a 2. upomínku,
- u každé smlouvy odešle pouze nejbližší dosud neodeslaný tenant-facing stupeň,
- respektuje uhrazené předpisy a individuální pozastavení upomínek,
- po dokončení zobrazí jednotlivé výsledky včetně chyb.

## Databáze

V19 nepřidává novou databázovou migraci. Používá stávající `RentNotification` a `AuditLog`.
