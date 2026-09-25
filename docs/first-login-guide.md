# P10A — Průvodce prvním přihlášením

Schválená identita C: pan správce s decentním úsměvem, kombinovaná bublina bez svatozáře. Průhledné rastrové WebP ilustrace ve vektorovém stylu navazují na schválenou sadu. Pro krok Smlouvy má Berry vlastní gesto s deskami a perem (`public/guide/contracts.webp`), aby se neopakovaly klíče a plán domu z předchozího kroku.

## Chování

- Potvrzení veřejné registrace vytváří účet se stavem `pending` a přesměruje na portfolio. Dokud nový uživatel výslovně nevybere vzhled, vidí za úvodním srovnáním Basic; samotná volba Basic/Profi je první krok po potvrzení e-mailu, takže registrační formulář zůstává krátký. Stávající účty bez uložené volby zůstávají v Profi, stav průvodce se jim nevynucuje. Veřejnou registraci nadále řídí `PUBLIC_REGISTRATION_ENABLED`.
- Berry nyní před prohlídkou představuje dvě podoby UI v samostatném srovnání. Základní vzhled ukazuje nemovitosti, nájemníky, platby a úkoly; profesionální vzhled rozvíjí smlouvy, náklady, reporty a týmovou práci. Jde o volbu uspořádání, ne o tarif. Nová průhledná ilustrace `public/guide/choose-mode.webp` navazuje na schválený portrét Berryho a drží dvě otevřené dlaně pro obě volby.
- Profi má sedm kroků: portfolio, nemovitosti/jednotky, smlouvy, finance, úkoly, upozornění, podpora práce. Basic má pět: přehled, nemovitosti a lidé, platby, úkoly, pomoc. Popisky i cíle respektují prázdný účet a existující oprávnění. Výběr se zapisuje do již existující uživatelské preference vzhledu; průvodce nemění tarif ani obchodní data.
- Při přepnutí režimu během průchodu zachovává revizi a stav; kroky, které Basic nemá, převádí na nejbližší následující krok. Dosavadní účty bez aktivního průvodce si zachovávají svůj stav. Verze průvodce se neresetuje všem uživatelům.
- Postup, stav a verze se ukládají k přihlášenému účtu v databázi. Optimistická revize zabraňuje přepsání novějšího průchodu z jiného okna. Tělo požadavku neurčuje uživatele.
- Později / křížek / Escape odloží průvodce. Na další návštěvě zůstane nenásilná nabídka pokračování. Ukončit a Dokončit další nabídku zastaví. Průvodce lze znovu spustit z Mého účtu nebo Podpory práce.
- Další/Zpět nejprve uloží krok a teprve potom přejde na skutečnou stránku. Průvodce nevytváří nemovitosti, úkoly ani jiné provozní záznamy. Cílové ovládání zůstává klikatelné; odejití ze stránky nezahodí postup.
- Cíle mají stabilní `data-guide`. Basic vítá u přepínače režimu, první řádek jednotek osvítí jako jeden celek, stejně jako celé karty plateb a úkolů. Profi v kroku nemovitostí ukazuje také rychlé přidání domu, u upozornění celý viditelný formulář. Šipka se kreslí podle skutečné polohy cíle a bubliny. Geometrie reaguje na scroll/resize; chybějící cíl má náhradní kotvu. Malé displeje mají kompaktní bublinu, tmavý režim vlastní barvy a reduced-motion vypíná animaci šipky.
- API pouze s platnou relací a JSON, vlastní stav, bez cache; náhled cizího účtu průvodce nevykresluje a existující proxy odmítá zápisy. Výpadek sítě umožní zavřít bez uložení pro aktuální relaci prohlížeče.

## Ověření

`e2e/first-login-guide.spec.ts`: potvrzení registračního tokenu bez odesílání e-mailu, prázdné portfolio, skutečný odkaz k založení domu, celý průchod, Zpět, odložení a reload, druhý prohlížeč, dokončení, ruční restart, ukončení, mobilní tmavý režim, klávesnice, nedostupný cíl, chyba uložení, neautorizované API, oddělení účtů a konflikt revizí. CI zapíná veřejnou registraci pouze na izolované testovací databázi.

Migrace je aditivní: čtyři sloupce osobního postupu bez změny práv, autentizačních údajů nebo obchodních dat. Před READY vyžadováno zelené CI a vizuální kontrola sandboxu.
