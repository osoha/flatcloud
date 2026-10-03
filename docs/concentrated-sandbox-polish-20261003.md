# Koncentrovaný blok sandboxu – pracovní stav

Uživatel schválil celý blok pouze do sandboxu. Produkce se nemění.

## Implementovaný základ
- čitelnější kauce bez změny výpočtů;
- účet přes celou šířku a volba grafiky Profi (zatím lokální preference prohlížeče);
- oddělení historických nájemníků;
- šestikrokový bankovní dialog s větví přeposílání;
- pouze pro čtení náhled portálu super-adminem z karty nájemníka;
- výrazný telefon správce, podklady pro platbu z účtu smlouvy;
- tabulka domovních/jednotkových měřidel, sbalená historie;
- rozpracovaná automatika odečtů, vypnutá env bránou.

## Další práce ve větvi (čeká na CI a sandbox)
- nájemnický účet s izolovanou rolí a přístupem navázaným na evidovaného nájemníka, pozvánkou a odebráním přístupu;
- aktivní smlouvy přes hlavního nájemníka i smluvní strany v rolích smluvní strana/plátce;
- portál: Berry, výrazný telefon správce, otevřený předpis s ověřeným českým platebním QR, závada s max. třemi fotografiemi, odečet bytového měřidla a historie plateb;
- smluvní dokument v portálu pouze po výslovném zveřejnění správou, se samostatně chráněným stažením;
- preference grafiky Profi uložená serverově; účet přes celou šířku;
- vlastník bankovního účtu vidí své nespárované notifikace a KPI, včetně sdíleného účtu bez VS; obecné pravidlo účtu bylo již v základu;
- do pracovní větve přenesena oprava automatických řešitelů a duplicitních upozornění z PR #243;
- wizard uvnitř zobrazuje konkrétní ověřený postup podle zvolené banky, rozpracovaný krok se ukládá v prohlížeči.
- portál nyní zobrazuje stav nahlášených závad z vlastních požadavků; interní komunikace úkolu se nájemníkovi nezpřístupňuje;
- pro dům lze zvolit ruční nebo automatickou pozvánku (výchozí ručně). Automatika platí jen na nově založené smlouvy, čeká na začátek budoucí smlouvy, vynechá existující přístup a platnou pozvánku. V sandboxu e-mail nepotlačeným způsobem neodchází a testovací odkaz je dostupný na kartě nájemníka;
- uživatel se současnou rolí vlastníka/správce a nájemnickým přístupem může přejít do „Můj nájem“ bez druhého účtu.

## Neuzavřené podmínky společného release
- průchod migracemi na izolované databázi a browser role testy přihlášení, dokumentů, závad a odečtů;
- QR vstup do portálu přímo na PDF nájemní smlouvy a předávacího protokolu vyžaduje rozhodnutí o konkrétním generátoru smluv;
- úplné Basic karty měřidel včetně bytových a hromadného odečtu Profi;
- propojení skutečné smluvní zálohy s tarifem a doporučení navýšení;
- transakční a souběžný audit automatiky odečtů, stabilní klíče měřidel checklistu, roční doplnění všech měřidel do otevřeného úkolu;
- ověřené screenshoty bank a e-mailových služeb; orientační postupy dalších bank musí projít kontrolou na skutečném prostředí;
- komplexní audit směrování všech známých účtů včetně bankovních transakcí bez domu a neznámého účtu, KPI ve všech pohledech a rolích;
- audit a případná fyzická revokace starých přístupů portálu při změně nájemníkova e-mailu či skončení smlouvy; aktuální kontrola e-mailu a aktivní smlouvy zabraňuje přístupu;
- audit referenčních aplikací v aktuální konsolidované pipeline požaduje QR vstup na smlouvě/předání, viditelnost žádosti a propojené workflow závada→schválení→dodavatel→náklad. Základ žádosti se stavem je součástí PR; následné dodavatelské a finanční kroky patří do P04 po pilotu portálu. Přesný výstup dalšího paralelního auditu dosud není v repozitáři dostupný;
- izolované DB a browser smoke, role a mobilní audit celého bloku.

Neoznačovat READY a nenasazovat částečný blok jako kompletní.
