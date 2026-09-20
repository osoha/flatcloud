# R32 — Administrace, uživatelé a super-admin

Zahájeno na výslovný pokyn uživatele 20. 9. 2026 po nasazení R31 / PR150. Výchozí sandbox: `9e697fa357ef5f3e8de7577c5228c082eda57a7d`. Autoritativní zadání: aktuální `Flatberry_Admin_UX_backlog.md`, verze 2, doplněná o Dovednosti / Avatary domů.

## R32A — Provozní panel a aktivita účtů

- Pod Administrací v rozbaleném menu jsou přesně tři údaje: online uživatelé, platné čekající pozvánky a chybné bankovní zprávy. Každý má konkrétní odkaz; při sbalení menu se panel skryje.
- Online znamená viditelnou přihlášenou kartu během posledních dvou minut. Viditelná karta odesílá heartbeat nejvýše jednou za minutu; skrytá nepokračuje. Po zavření / odhlášení stav nejpozději do dvou minut vyprší. Deaktivované účty se jako online nezobrazují.
- Server zapisuje jen skutečně přihlášeného uživatele a vlastní čas. Identita a čas z klienta se nepřijímají. Historická přihlášení slouží jako náhradní zdroj poslední aktivity, nikoli jako důkaz online přítomnosti.
- Přehled účtů: běžné řazení, online přednostně, aktivita starší než 30 dní, bez záznamu aktivity. Chybějící historie se nevydává za důkaz, že se uživatel nikdy nepřihlásil.
- Online účet má silnější zelený kroužek a textové označení. Detail zachovává poslední odladěný editor oprávnění.
- Osobní heartbeat je dostupný přihlášenému účtu; agregace a seznam/detail aktivity pouze skutečnému SUPER_ADMIN. Auth/session/permission pravidla se v této etapě nemění.
- Aditivní migrace přidává tabulku UserActivity. Nepřepisuje historické uživatele ani jejich role a nepoužívá updatedAt účtu, takže heartbeat nemění verze avatarů.
- Povinné ověření: TypeScript, Prisma validate/migrate v izolovaném CI, build, celá existující prohlížečová sada a nové testy expirace/řazení/rolí. Výsledek a nasazení se doplní do PR.

## Následující části stejného admin bloku

1. **Pohled vybraného uživatele.** Skutečná super-admin relace a levé menu zůstávají; obsah se vyhodnocuje jako vybraný účet. Zřetelný rám, jméno a exit. Výchozí návrh je náhled pouze pro čtení; před implementací oddělit skutečného a zobrazovaného aktéra i na serveru, v přímých URL a API. Žádné vydávání skutečné přihlašovací relace cílového uživatele.
2. **Příslušnost ke skupině FlatCloud.** Oddělit členství, roli/oprávnění a správu nemovitosti. Vymezit interní údaje a vyhrazené reporty; čisté externí prostředí musí platit i při přímém přístupu a v náhledu uživatele. Neodvozovat členství automaticky z vlastnictví spravovaného objektu.
3. **Dovednosti / Avatary domů.** Super-admin nástroj z existujícího FlatBerry_3D_prototype.html; čtyři pohledy, adresy/souřadnice, rámeček, soukromé uložení a zapomenutí demo klíče, lokální náhled a stažení PNG skutečného výřezu. Zachovat omezení a podmínky dokončení aktuálního backlogu včetně ověření WebGL exportu, atribuce a chráněných endpointů. Žádné placené AI API ani automatické přiřazení / veřejné publikování obrázků.

## Výslovně odložené grafické připomínky

FB-01 až FB-03 jsou evidované v `docs/visual-polish-backlog.md`: mírné zmenšení avatarů, bubliny v reportech a stávající nefunkční výzvy „Otevřete nastavení“. Uživatel nařídil pouze evidenci a bude přidávat další poznámky. R32A tyto prvky neopravuje.
