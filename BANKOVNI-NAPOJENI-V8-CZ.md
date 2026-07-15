# Bankovní napojení FlatCloud Rent V8

## Provozní model

Každý uživatel s právem editace konkrétní nemovitosti může spustit bankovní autorizaci. Přihlášení probíhá v prostředí banky. Aplikace ukládá pouze token/souhlas zašifrovaný pomocí AES-256-GCM a eviduje, který uživatel účet připojil.

Jeden centrální API klient aplikace tak obsluhuje více oddělených uživatelských souhlasů. Bankovní účet je v aplikaci přiřazen konkrétní nemovitosti a volitelně konkrétnímu vlastníkovi.

## Česká spořitelna

V8 obsahuje prioritní adaptér `csas-premium`. Protože podrobná produkční dokumentace a konkrétní endpointy jsou poskytovány až po schválení aplikace bankou, jsou URL, cesty a scope konfigurovatelné přes Render Environment.

Postup aktivace:

1. registrace na Erste Developer Portalu,
2. vytvoření aplikace a výběr účtového/transaction-history API,
3. získání sandboxových klíčů,
4. ověření přesných endpointů a payloadů s API týmem banky,
5. testování souhlasu, účtů a historie,
6. žádost o produkční přístup.

Pro platformu, v níž účty připojují různí vlastníci, je potřeba s bankou potvrdit TPP/smluvní model. Přímé produkční připojení nelze aktivovat pouze vložením běžných přihlašovacích údajů klienta.

## Historická data

V sekci **Banka a pravidla** je u každého připojeného účtu datumové pole „Načíst historická data“. Uživatel zvolí datum od a aplikace požádá banku o dostupnou historii.

Ochrana proti duplicitám:

```text
bankovní účet + externí ID transakce
```

Existující záznam se aktualizuje; nevytvoří se druhá platba. Pokud banka pro transakci neposkytne ID, adaptér vytváří deterministický hash obdrženého záznamu. Maximální rozsah historie vždy závisí na konkrétním API a souhlasu banky.

## Automatická synchronizace

Render Cron Job se spouští jednou za hodinu. Frekvenci nastavuje hlavní administrátor v aplikaci:

- 24× denně = přibližně každou hodinu,
- 12× denně = přibližně každé 2 hodiny,
- 8× denně = přibližně každé 3 hodiny,
- až 1× denně.

Synchronizaci lze globálně vypnout nebo vypnout jen u konkrétního účtu. Tlačítko **Synchronizovat nyní** zůstává jako ruční záloha.

## Pouze příchozí platby

V8 ukládá a zobrazuje pouze transakce s kladnou částkou. Odchozí platby, bankovní poplatky a výdaje nejsou součástí aktuálního produktu.

Nová příchozí platba projde v tomto pořadí:

1. aktivní ignorační pravidla,
2. vlastní automatická nebo návrhová pravidla,
3. jednoznačný variabilní symbol aktivní smlouvy,
4. známý účet plátce nájemníka,
5. fronta **Ke spárování**.

## Fronta „Ke spárování“

Nespárovaná platba zobrazuje datum, plátce, účet plátce, částku, VS a zprávu. Správce ji může:

- přiřadit ke konkrétnímu otevřenému předpisu,
- rozdělit postupně na více předpisů,
- vytvořit automatické pravidlo pro smlouvu,
- vytvořit pouze návrhové pravidlo,
- jednorázově ignorovat,
- ignorovat i budoucí podobné platby.

## Ignorační pravidla

Budoucí nerelevantní příchozí platby lze rozpoznat podle jedné nebo více podmínek:

- bankovní účet objektu,
- účet protistrany,
- jméno plátce obsahuje text,
- variabilní symbol,
- zpráva obsahuje text,
- přesná částka.

Pravidla mají prioritu. Nižší číslo se vyhodnocuje dříve, proto je vhodné přesná ignorační pravidla řadit před obecná párovací pravidla.

## Další banky

Architektura používá registry adaptérů. Česká spořitelna má vlastní přímý adaptér. Další banku lze přidat jako nový modul se stejnými funkcemi:

```text
startAuthorization
completeAuthorization
listInstitutions
sync
```

Do té doby lze pro další banky ponechat licencovaného Open Banking agregátora. To neovlivní párovací logiku ani databázi aplikace.
