# Výběr rozsahu portfolia – design patch

Požadavek 2026-09-14: rozsáhlý seznam vlastníků a objektů přesahoval obrazovku; pokus použít posuvník stránky zavíral popup. Uživatel potřebuje odznačit vše a vyhledat jediný objekt.

- Panel je ukotven k tlačítku, ale jeho poloha, šířka a maximální výška respektují aktuální viewport včetně změn velikosti a visualViewport.
- Potvrzení/zrušení, označit/odznačit vše a hledání zůstávají mimo posouvaný obsah. Posouvají se předvolby a objekty společně, takže ani mnoho vlastníků nezvětší panel mimo obrazovku.
- Hromadné akce se týkají všech dostupných objektů, nikoli pouze výsledků hledání. Vybrané počty jsou viditelné; změny se použijí až potvrzením.
- Esc a zrušení ponechají původní výběr; Esc vrací fokus na spouštěcí tlačítko. Běžný klik mimo zavře panel, nativní scrollbar stránky není akcí zrušení.
- Zachovány URL parametry valorizace a stávající oprávnění. Bez migrace, změn evidovaných dat nebo mazání.

Lokálně: TypeScript, Prisma validate a stávající V22-B.1 (94 kontrol) PASS. Nová E2E regrese kontroluje geometrii a dostupnost potvrzení na 900×500 a 390×640, posun seznamu, hromadné akce při hledání, Esc/fokus, potvrzení jediného ID a zachování filtrů, zrušení změn. Izolovaný DB/browser test proběhne v kompletním CI. Konečný stav CI, merge a živé ověření jsou v PR tohoto patche; samotná implementace neznamená uzavřenou bránu.
