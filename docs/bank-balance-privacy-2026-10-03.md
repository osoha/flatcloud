# Maskování zůstatku v bankovních notifikacích

Nové notifikace se dekódují z MIME/HTML do textu a rozpoznané zůstatky se nahradí `xxxx` ještě před parsováním a uložením do `InboxPayment`. Stejně se chrání předmět a zpráva pro příjemce. Částka platby, účet, VS a datum zůstávají zachované; uloženou zprávu lze znovu parsovat. Zůstatek se nemůže stát náhradní částkou platby.

Maskování rozpoznává české popisky zůstatku (včetně účetního/disponibilního), slovenský zostatok, anglický balance a saldo, na stejném nebo navazujícím řádku. Věta o zvýšení/snížení zůstatku zachovává částku změny a identitu účtu, skrývá výsledný zůstatek. Nové odlišné bankovní formulace vyžadují doplnění regresního příkladu.

Chybová cesta ukládá pouze dekódovaný maskovaný výňatek, nikdy původní RFC822/base64/quoted-printable zdroj. Pokud dekódování selže, výňatek obsahuje pouze obecné vysvětlení. Chybové poznámky a logy synchronizace nepřebírají výjimku, která může obsahovat původní payload.

Bez migrace, hromadného přepisu historických zpráv nebo změn účtování/oprávnění. Původní e-mail v externí IMAP schránce tento krok nemění. Pokrytí v CI zahrnuje plaintext, HTML, MIME obě kódování i multipart, kladný/záporný/celočíselný zůstatek, opakované parsování a ochranu platebních údajů.
