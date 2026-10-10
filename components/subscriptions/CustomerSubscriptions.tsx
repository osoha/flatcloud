import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Field, Select } from "@/components/FormUi";
import type { SubscriptionConfig, SubscriptionSummary, SubscriptionUserContext } from "@/lib/subscriptions/types";
import { paymentMethodLabels, subscriptionFeatures, subscriptionPlanDescriptions } from "./catalog";
import { SubscriptionFeatureList, SubscriptionMetric, SubscriptionStatus, subscriptionDate, subscriptionMoney } from "./SubscriptionUi";
import styles from "./subscriptions.module.css";
import { RecoveryArchive } from "./RecoveryArchive";
import { SubscriptionReminderTimeline } from "./SubscriptionReminderTimeline";

export function CustomerSubscriptions({ user, summaries, config, preview, reason }: { user: SubscriptionUserContext; summaries: SubscriptionSummary[]; config: SubscriptionConfig; preview: boolean; reason?: string }) {
  const reasonLabels: Record<string, string> = {
    frozen: "U tohoto portfolia vypršelo předplatné. Data jsou zachována, práci obnovíte úhradou nebo úpravou tarifu.",
    capacity: "Vybrané portfolio dosáhlo kapacity předplatného. Navyšte kapacitu, abyste mohli pokračovat.",
    profi: "Pohled Profi vyžaduje tarif Profi nebo Enterprise. Základní správu můžete používat v pohledu Basic.",
    reports: "Reporty a pokročilé přehledy jsou součástí tarifu Profi a Enterprise.",
    bankNotifications: "Bankovní notifikace k nájmům jsou součástí placených tarifů.",
    paymentMatching: "Párování plateb je součástí placených tarifů. V Basic můžete platby zaznamenávat ručně.",
    paymentReceipts: "Vystavování nových dokladů o zaplacení vyžaduje placený tarif. Uložené doklady zůstávají dostupné.",
    electronicContracts: "Elektronická příprava smluv a dodatků vyžaduje placený tarif. Vlastní PDF můžete dál ukládat.",
    portfolioOversight: "Pokročilý dohled nad portfoliem je součástí tarifu Enterprise.",
  };
  return <>
    {reason && <div className={styles.notice} role="status">{reasonLabels[reason] || "Tato funkce nebo úprava vyžaduje změnu předplatného vybraného portfolia."}</div>}
    {preview && <div className={styles.notice}>Používáte stávající pohled očima uživatele. Zobrazují se jeho tarify a portfolia; platby a změny předplatného jsou v náhledu pouze ke čtení.</div>}
    <div className={`${styles.notice} ${styles.sandbox}`}><strong>Sandbox FlatBerry · testovací platby</strong><p>Karta, Apple Pay, Google Pay i bankovní převod jsou simulované. Nezadáváte údaje karty a nevzniká skutečná platba ani automatické stržení.</p></div>
    <div className={styles.list}>{summaries.map(summary => <CustomerAccount key={summary.accountId || "legacy"} user={user} summary={summary} config={config} payer={summary.payerUserId === user.id} preview={preview}/>)}</div>
    <section className={`card ${styles.card}`} id="tarify"><div className={styles.head}><div><h2>Co jednotlivé tarify zpřístupní</h2><p>Portál nájemníka je součástí všech tarifů. Uživatelé a oprávnění nejsou účtováni po jednotlivých osobách.</p></div></div>
      <div className={styles.grid}>{Object.values(config.plans).map(plan => <div className={styles.metric} key={plan.code}><h3>{plan.name}</h3><div className={styles.price}>{subscriptionMoney(plan.monthlyPriceCents)} <small>/ měsíc</small></div><p className={styles.help}>{subscriptionPlanDescriptions[plan.code]}</p><p>Jednotky v ceně: {plan.includedUnits}{plan.maxProperties != null ? ` · Maximum objektů: ${plan.maxProperties}` : " · bez omezení počtu objektů"}</p>{plan.additionalUnitPriceCents > 0 && <p className={styles.help}>Další jednotka {subscriptionMoney(plan.additionalUnitPriceCents)} / měsíc</p>}<p className={styles.help}>{plan.code === "FREE" ? "Bez plateb a s vlastní správou nemovitostí." : `Roční předplatné za cenu ${config.annualMonths} měsíců.`}</p></div>)}</div>
      <div className="table-wrap"><table className={`${styles.history} ${styles.featureMatrix}`}><thead><tr><th>Funkce</th>{Object.values(config.plans).map(plan => <th key={plan.code}>{plan.name}</th>)}</tr></thead><tbody><tr><td>Portál nájemníka</td>{Object.keys(config.plans).map(code => <td key={code}><Check size={17} aria-label="Dostupné"/></td>)}</tr>{subscriptionFeatures.map(feature => <tr key={feature.key}><td>{feature.label}</td>{Object.values(config.plans).map(plan => <td key={plan.code}>{plan.features[feature.key] ? <Check size={17} aria-label="Dostupné"/> : <Minus size={17} aria-label="Nedostupné"/>}</td>)}</tr>)}</tbody></table></div>
    </section>
  </>;
}

function CustomerAccount({ user, summary, config, payer, preview }: { user: SubscriptionUserContext; summary: SubscriptionSummary; config: SubscriptionConfig; payer: boolean; preview: boolean }) {
  const billingWritable = payer && !preview && Boolean(summary.accountId);
  const pending = summary.requests.filter(request => request.status === "PENDING");
  const privilegedOffer = summary.status === "TEAM";
  return <section className={`card ${styles.card}`} data-testid="customer-subscription" id={summary.accountId || "dosavadni-pristup"}>
    <div className={styles.head}><div><h2>{summary.enrolled ? summary.billingName || "Moje předplatné" : "Moje portfolio"}</h2><p>{summary.enrolled ? `${config.plans[summary.status === "FREE" ? "FREE" : summary.plan].name} · ${summary.interval === "ANNUAL" ? "roční" : "měsíční"} období` : "Dosavadní přístup · předplatné zatím není nastavené"}{!payer && ` · hradí ${summary.payerName}`}</p></div><SubscriptionStatus status={summary.status}/></div>
    {!summary.enrolled && <div className={styles.notice}>V tomto sandboxu vás správce zatím nezařadil do nového tarifního systému. Dosavadní funkce a přístup zůstávají zachovány. Nastavení provede super-admin ve vašem uživatelském profilu.</div>}
    <div className={styles.metrics}>
      <SubscriptionMetric label={payer ? "Aktivní jednotky" : "Dostupné jednotky"} value={summary.enrolled ? payer ? `${summary.usage.units} / ${summary.effectiveCapacityUnits}` : `${summary.usage.units}` : "Bez tarifního limitu"} used={summary.usage.units} limit={summary.enrolled && payer ? summary.effectiveCapacityUnits : null}/>
      <SubscriptionMetric label={summary.status === "TRIAL" ? "Zkušební období do" : summary.status === "GIFTED" ? "Zdarma do" : "Přístup do"} value={summary.status === "TEAM" ? "Bez úhrady" : subscriptionDate(summary.accessUntil)}/>
      <SubscriptionMetric label={payer ? "Cena dalšího období včetně DPH" : "Předplatné hradí"} value={payer ? summary.enrolled ? subscriptionMoney(summary.nextPriceCents) : "Dosud nesjednáno" : summary.payerName}/>
    </div>
    {summary.reminder && <div className={styles.notice}>{summary.reminder}</div>}
    <SubscriptionReminderTimeline summary={summary} config={config}/>
    {summary.status === "FROZEN" && <div className={styles.notice}><strong>Portfolio je nyní pouze ke čtení.</strong><p>Žádná data jsme nesmazali. Přihlášení, uložené dokumenty, základní export a toto platební nastavení zůstávají dostupné. Portál nájemníka zůstává přístupný.</p><p>Po ověřené úhradě se práce obnoví. Ostatní hrazená portfolia se tímto zmrazením neomezují.</p></div>}
    {summary.status === "GRACE" && <div className={styles.notice}><strong>Předplatné vypršelo; zatím můžete pracovat.</strong><p>Bez obnovení se toto portfolio přepne pouze ke čtení {subscriptionDate(summary.freezeAt)}. Úhradou v ochranné lhůtě navážete na původní období.</p></div>}
    {summary.overCapacity && <div className={styles.notice}>Portfolio má více jednotek nebo objektů, než dovoluje tarif. Data zůstávají dostupná; pro pokračování upravte kapacitu předplatného.</div>}
    {!preview && payer && summary.recoveryArchivingAllowed && <RecoveryArchive user={user} summary={summary}/>}
    {summary.status === "TEAM" && <p className={styles.help}>Osvobození člena FlatCloud teamu platí pro toto {summary.kind === "CLIENT" ? "výslovně schválené klientské" : "vlastní nebo interní"} portfolio.</p>}
    {summary.simulationNow && <p className={styles.help}>Správce nastavil testovací datum {subscriptionDate(summary.simulationNow)} pro toto předplatné.</p>}
    <div className={styles.actions}><a className="secondary" href={`/api/subscriptions/export${summary.accountId ? `?accountId=${encodeURIComponent(summary.accountId)}` : ""}`}>Stáhnout základní data (JSON)</a></div>
    <p className={styles.help}>Export obsahuje původní data v rozsahu vašich oprávnění ve formátu JSON. Je dostupný také v Free a při pozastavené práci; analytické reporty jsou součástí placených tarifů.</p>
    {summary.enrolled && <details className={styles.details}><summary>Dostupné funkce a hrazené nemovitosti</summary><SubscriptionFeatureList features={subscriptionFeatures.map(feature => ({ label: feature.label, enabled: summary.features[feature.key] }))}/><div className={styles.list}>{summary.scopes.map(scope => <div className={styles.scope} key={scope.id}><div><Link href={`/nemovitosti/${scope.propertyId}`}>{scope.propertyName}</Link><small>{scope.unitLabel ? scope.unitLabel : "Celý objekt"}</small></div></div>)}</div></details>}
    {billingWritable && summary.enrolled && !privilegedOffer && <details className={styles.details} open={summary.status === "FREE" || summary.status === "FROZEN"}><summary>{summary.plan === "FREE" ? "Vybrat placený tarif" : "Obnovit předplatné nebo změnit tarif"}</summary>
      <p className={styles.help}>Nejprve vytvoříte platební požadavek s konkrétní částkou. Nový tarif a jeho funkce se aktivují až po ověřené úhradě.</p>
      <form className={styles.form} action="/api/subscriptions/request" method="post"><input type="hidden" name="accountId" value={summary.accountId!}/><input type="hidden" name="returnTo" value="/ucet/predplatne"/>
        <div className={styles.formGrid}><Select label="Tarif" name="plan" defaultValue={summary.plan === "FREE" ? "PROFI" : summary.plan} options={Object.values(config.plans).filter(plan => plan.code !== "FREE").map(plan => [plan.code, plan.name])}/><Select label="Období" name="interval" defaultValue={summary.interval} options={[["MONTHLY", "Měsíčně"], ["ANNUAL", "Ročně"]]}/><Field label="Předplacený počet jednotek" name="capacityUnits" type="number" min={Math.max(1, summary.usage.units)} step="1" defaultValue={Math.max(summary.usage.units, summary.plan === "FREE" ? config.plans.PROFI.includedUnits : summary.contract.capacityUnits)} required/><Select label="Platební metoda (simulace)" name="method" defaultValue="CARD" options={Object.entries(paymentMethodLabels)}/></div>
        <div className={styles.actions}><button className="primary" type="submit">Zobrazit částku a připravit platbu</button></div>
      </form>
    </details>}
    {pending.length > 0 && <div className={styles.list} style={{ marginTop: 18 }}>{pending.map(request => <div className={styles.pending} key={request.id} data-testid="pending-subscription-payment"><div className={styles.head}><div><h3>Požadavek na úhradu · {config.plans[request.plan].name}</h3><p className={styles.help}>{request.capacityUnits} jednotek · {request.interval === "ANNUAL" ? "roční" : "měsíční"} období · {paymentMethodLabels[request.method]}</p></div><SubscriptionStatus status={request.status}/></div><div className={styles.price}>{subscriptionMoney(request.amountCents)}</div>
      {request.method === "BANK" ? <dl className={styles.bankData}><div><dt>Účet pro předplatné</dt><dd>{request.recipientAccount || "Dosud nenastavený"}</dd></div><div><dt>Reference platby</dt><dd>{request.reference}</dd></div></dl> : <p className={styles.help}>V produkčním zapojení by nyní následovala chráněná platební stránka poskytovatele. Zde pouze ověříte reakci aplikace na výsledek platby.</p>}
      <p className={styles.help}>Přijetí nebo selhání testovací platby potvrdí super-admin ve správě uživatelů. V pohledu zákazníka se následně promítne stav i dostupné funkce.</p>
    </div>)}</div>}
    {billingWritable && summary.plan !== "FREE" && !privilegedOffer && <details className={styles.details}><summary>Obnovování předplatného</summary><form className={styles.form} action="/api/subscriptions/recurring" method="post"><input type="hidden" name="accountId" value={summary.accountId!}/><input type="hidden" name="returnTo" value="/ucet/predplatne"/><label className="checkbox-field"><input type="checkbox" name="consent" defaultChecked={summary.recurringConsent}/><span>Souhlasím s automatickým obnovením předplatného</span></label><p className={styles.help}>Sandbox ukládá pouze volbu. Žádnou kartu neukládá a platby automaticky nestrhává. Volbu lze kdykoli vypnout.</p><button type="submit" className="secondary">Uložit volbu obnovení</button></form></details>}
    {summary.requests.filter(request => request.status !== "PENDING").length > 0 && <details className={styles.details}><summary>Historie předplatného a plateb</summary><div className="table-wrap"><table className={styles.history}><thead><tr><th>Datum</th><th>Metoda / reference</th><th>Částka</th><th>Stav</th></tr></thead><tbody>{summary.requests.filter(request => request.status !== "PENDING").map(request => <tr key={request.id}><td>{subscriptionDate(request.paidAt || request.createdAt)}</td><td>{paymentMethodLabels[request.method]}<small className={styles.help}>{request.reference}</small></td><td>{subscriptionMoney(request.amountCents)}</td><td><SubscriptionStatus status={request.status}/></td></tr>)}</tbody></table></div></details>}
  </section>;
}
