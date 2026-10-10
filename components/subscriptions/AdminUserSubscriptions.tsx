import Link from "next/link";
import { Field, Select } from "@/components/FormUi";
import type { SubscriptionConfig, SubscriptionSummary } from "@/lib/subscriptions/types";
import { paymentMethodLabels, subscriptionFeatures } from "./catalog";
import { SubscriptionStatus, subscriptionDate, subscriptionMoney } from "./SubscriptionUi";
import styles from "./subscriptions.module.css";
import { SubscriptionReminderTimeline } from "./SubscriptionReminderTimeline";

type Property = { id: string; name: string; active: boolean; units: { id: string; label: string }[] };

export function AdminUserSubscriptions({ userId, name, email, summaries, config, properties, flatcloudMember }: { userId: string; name: string; email: string; summaries: SubscriptionSummary[]; config: SubscriptionConfig; properties: Property[]; flatcloudMember: boolean }) {
  const owned = summaries.filter(summary => summary.payerUserId === userId);
  const covered = summaries.filter(summary => summary.payerUserId !== userId && summary.enrolled);
  return <section className={`card ${styles.card} ${styles.compact}`} id="predplatne" data-testid="user-subscription-panel">
    <div className={styles.head}><div><h2>Tarif a platby</h2><p className={styles.help}>Předplatné určuje funkce a kapacitu. Přístupy k nemovitostem a existující pohled uživatele zůstávají ve správě oprávnění.</p></div><Link className="secondary" href="/nastaveni/tarify">Nastavení tarifů</Link></div>
    {owned.map(summary => <AccountEditor key={summary.accountId || "new"} summary={summary} userId={userId} name={name} config={config} properties={properties} flatcloudMember={flatcloudMember}/>)}
    {!owned.length && summaries[0] && <details className={styles.details}><summary>Nastavit vlastní předplatné tohoto uživatele</summary><AccountEditor summary={newAccountSummary(summaries[0], config, userId, name, email, "OWN")} userId={userId} name={name} config={config} properties={properties} flatcloudMember={flatcloudMember}/></details>}
    {owned.some(summary => summary.enrolled) && <details className={styles.details}><summary>Přidat další předplatné pro samostatné portfolio</summary><AccountEditor summary={newAccountSummary(owned[0], config, userId, name, email)} userId={userId} name={name} config={config} properties={properties} flatcloudMember={flatcloudMember}/></details>}
    {covered.length > 0 && <details className={styles.details}><summary>Portfolia hrazená jiným plátcem ({covered.length})</summary>{covered.map(summary => <div className={styles.scope} key={summary.accountId}><div><strong>{summary.billingName} · {config.plans[summary.plan].name}</strong><small>Plátce {summary.payerName} · {summary.usage.units} jednotek / {summary.usage.properties} objektů</small></div><SubscriptionStatus status={summary.status}/></div>)}</details>}
  </section>;
}

function AccountEditor({ summary, userId, name, config, properties, flatcloudMember }: { summary: SubscriptionSummary; userId: string; name: string; config: SubscriptionConfig; properties: Property[]; flatcloudMember: boolean }) {
  const selectedProperties = new Set(summary.scopes.filter(scope => !scope.unitId).map(scope => scope.propertyId));
  const selectedUnits = new Set(summary.scopes.flatMap(scope => scope.unitId ? [scope.unitId] : []));
  const returnTo = `/uzivatele/${userId}#predplatne`;
  return <div>
    <div className={styles.compactSummary}>
      <div><span className={styles.label}>Tarif</span><strong>{summary.enrolled ? config.plans[summary.plan].name : "Dosavadní přístup"}</strong><small className={styles.help}>{summary.interval === "ANNUAL" ? "Roční" : "Měsíční"} období</small></div>
      <div><span className={styles.label}>Stav</span><SubscriptionStatus status={summary.status}/><small className={styles.help}>{summary.accessUntil ? `Přístup do ${subscriptionDate(summary.accessUntil)}` : "Bez data ukončení"}</small></div>
      <div><span className={styles.label}>Kapacita</span><strong>{summary.enrolled ? `${summary.usage.units} / ${summary.effectiveCapacityUnits} jednotek` : "Dosud nesjednána"}</strong><small className={styles.help}>{summary.enrolled ? `${summary.usage.properties} objektů · prázdné jednotky se započítávají` : "Tarifní limity se neuplatňují"}</small></div>
      <div><span className={styles.label}>Cena dalšího období</span><strong>{subscriptionMoney(summary.nextPriceCents)}</strong><small className={styles.help}>{summary.offerKind === "TEAM" ? "Osvobození FlatCloud team" : "Včetně DPH"}</small></div>
    </div>
    {!summary.enrolled && <div className={styles.notice}><strong>Účet zatím není zařazený do předplatného.</strong><p>Uložením níže zapojíte vybrané nemovitosti do tarifních pravidel. Ostatní stávající uživatelé zůstávají v dosavadním režimu.</p></div>}
    {summary.reminder && <div className={styles.notice}>{summary.reminder}</div>}
    <SubscriptionReminderTimeline summary={summary} config={config}/>
    <details className={styles.details} open={!summary.enrolled}><summary>{summary.enrolled ? "Upravit předplatné, rozsah a nabídku" : "Nastavit předplatné"}</summary>
      <form className={styles.form} action={`/api/admin/subscriptions/user/${userId}`} method="post">
        <input type="hidden" name="accountId" value={summary.accountId || ""}/><input type="hidden" name="ownerId" value={summary.ownerId || ""}/><input type="hidden" name="returnTo" value={returnTo}/>
        <div className={styles.formGrid}>
          <Select label="Účel předplatného" name="kind" defaultValue={summary.kind || "OWN"} options={[["OWN", "Vlastní portfolio"], ["CLIENT", "Portfolio externího klienta"], ["INTERNAL", "Interní portfolio FlatCloud"]]}/>
          <Select label="Tarif" name="plan" defaultValue={summary.enrolled ? summary.plan : "FREE"} options={Object.values(config.plans).map(plan => [plan.code, plan.name])}/>
          <Select label="Období" name="interval" defaultValue={summary.interval} options={[["MONTHLY", "Měsíčně"], ["ANNUAL", "Ročně"]]}/>
          <Field label="Předplacená kapacita jednotek" name="capacityUnits" type="number" min={1} step="1" defaultValue={summary.enrolled ? summary.contract.capacityUnits : config.plans.FREE.includedUnits} required/>
          <Field label="Fakturační název / plátce" name="billingName" defaultValue={summary.billingName || name} required/>
          <Field label="E-mail pro předplatné" name="billingEmail" type="email" defaultValue={summary.billingEmail} required/>
          <Field label="Zaplaceno do" name="paidUntil" type="date" defaultValue={summary.paidUntil?.slice(0, 10)}/>
          <Field label="Zkušební období do" name="trialUntil" type="date" defaultValue={summary.trialUntil?.slice(0, 10)}/>
        </div>
        <details className={styles.details} open={!summary.enrolled}><summary>Nemovitosti hrazené tímto předplatným</summary><p className={styles.help}>Vyberte celý dům nebo jen jednotlivé jednotky. Jednotka pokrytá celým domem se započítává jednou. Toto nastavení neuděluje uživateli nová oprávnění.</p>
          <div className={styles.list}>{properties.filter(property => property.active || selectedProperties.has(property.id) || property.units.some(unit => selectedUnits.has(unit.id))).map(property => <div key={property.id}>
            <label className="checkbox-field"><input type="checkbox" name="propertyIds" value={property.id} defaultChecked={selectedProperties.has(property.id)}/><span>{property.name}{!property.active && " · archiv"}<small className={styles.help}>Celý objekt včetně jeho jednotek</small></span></label>
            <details className={styles.details} open={property.units.some(unit => selectedUnits.has(unit.id))}><summary>Pouze vybrané jednotky ({property.units.length})</summary>{property.units.map(unit => <label className="checkbox-field" key={unit.id}><input type="checkbox" name="unitIds" value={unit.id} defaultChecked={selectedUnits.has(unit.id)}/><span>{unit.label}</span></label>)}</details>
          </div>)}</div>
        </details>
        <details className={styles.details} open={summary.offerKind !== "NONE"}><summary>Individuální nabídka a osvobození</summary><div className={styles.formGrid}>
          <Select label="Typ nabídky" name="offerKind" defaultValue={summary.offerKind} options={[["NONE", "Podle sjednaného tarifu"], ["PERCENT", "Sleva v procentech"], ["FIXED", "Zvýhodněná cena"], ["FREE_UNTIL", "Přístup zdarma do data"], ...(flatcloudMember ? [["TEAM", "FlatCloud team – osvobození"] as [string, string]] : [])]}/>
          <Field label="Platnost nabídky do" name="offerUntil" type="date" defaultValue={summary.offerUntil?.slice(0, 10)}/>
          <Field label="Sleva v %" name="discountPercent" type="number" min={0} max={100} step="1" defaultValue={summary.discountPercent}/>
          <Field label="Zvýhodněná měsíční cena v Kč včetně DPH" name="fixedPriceKc" type="number" min={0} step="0.01" defaultValue={summary.fixedPriceCents == null ? null : summary.fixedPriceCents / 100}/>
        </div><p className={styles.help}>Nabídky se nesčítají. Darované období samo nevyvolá platbu. Osvobození teamu platí pro výslovně zvolené portfolio, nepřenáší se automaticky na cizí klienty.</p></details>
        <details className={styles.details}><summary>Výjimky jednotlivých funkcí</summary><div className={styles.formGrid}>
          {subscriptionFeatures.map(feature => <Select key={feature.key} label={feature.label} name={`override:${feature.key}`} defaultValue={summary.featureOverrides[feature.key] === undefined ? "inherit" : summary.featureOverrides[feature.key] ? "on" : "off"} options={[["inherit", "Podle tarifu"], ["on", "Výslovně povolit"], ["off", "Výslovně vypnout"]]}/>)}
          <Field label="Platnost výjimek do" name="overridesUntil" type="date" defaultValue={summary.overridesUntil?.slice(0, 10)}/>
        </div></details>
        <label className="checkbox-field"><input type="checkbox" name="refreshContract"/><span>Převzít aktuální ceny a limity z katalogu tarifů</span></label>
        <p className={styles.help}>Bez této volby zůstane při změně termínů či nabídky již sjednaný ceník. Při změně tarifu se použije jeho aktuální cena.</p>
        <Field label="Důvod změny (uloží se do historie)" name="reason" required placeholder="Např. aktivace tarifu, individuální nabídka nebo test"/>
        <div className={styles.actions}><button type="submit" className="primary">Uložit předplatné</button></div>
      </form>
    </details>
    {summary.accountId && <details className={`${styles.details} ${styles.sandbox}`}><summary>Sandbox: ověřit exspiraci a platbu</summary>
      <p className={styles.help}>Změny testovacího času platí pouze pro toto předplatné. Přepnutí data ověří ochrannou lhůtu a zmrazení ve skutečném pohledu uživatele.</p>
      <form className={styles.form} action="/api/admin/subscriptions/clock" method="post"><input type="hidden" name="accountId" value={summary.accountId}/><input type="hidden" name="returnTo" value={returnTo}/><Field label="Testovací datum (prázdné = dnešek)" name="date" type="date" defaultValue={summary.simulationNow?.slice(0, 10)}/><div className={styles.actions}><button className="secondary" type="submit">Nastavit testovací datum</button><button className="secondary" type="submit" name="reset" value="1">Vrátit skutečné datum</button></div></form>
      <details className={styles.details}><summary>Simulovat příchozí úhradu</summary><AdminPaymentRequest summary={summary} config={config} returnTo={returnTo}/></details>
    </details>}
    {summary.requests.length > 0 && <details className={styles.details}><summary>Platby a platební požadavky ({summary.requests.length})</summary><div className="table-wrap"><table className={styles.history}><thead><tr><th>Datum / reference</th><th>Metoda</th><th>Částka</th><th>Stav</th><th>Test</th></tr></thead><tbody>{summary.requests.map(request => <tr key={request.id}><td>{subscriptionDate(request.createdAt)}<small className={styles.help}>{request.reference}</small></td><td>{paymentMethodLabels[request.method]}</td><td>{subscriptionMoney(request.amountCents)}</td><td><SubscriptionStatus status={request.status}/></td><td>{request.status === "PENDING" && <SimulatePayment requestId={request.id} returnTo={returnTo}/>}</td></tr>)}</tbody></table></div></details>}
    {summary.audit.length > 0 && <details className={styles.details}><summary>Historie změn ({summary.audit.length})</summary>{summary.audit.map(event => <div className={styles.scope} key={event.id}><div><strong>{event.reason || event.action}</strong><small>{event.actorName} · {subscriptionDate(event.createdAt)}</small></div></div>)}</details>}
  </div>;
}

function newAccountSummary(base: SubscriptionSummary, config: SubscriptionConfig, payerUserId: string, payerName: string, email: string, kind: "OWN" | "CLIENT" = "CLIENT"): SubscriptionSummary {
  return { ...base, payerUserId, payerName, billingName: payerName, billingEmail: email, accountId: null, kind, ownerId: null, plan: "FREE", enrolled: false, status: "LEGACY", writable: true, effectiveCapacityUnits: config.plans.FREE.includedUnits, effectiveMaxProperties: config.plans.FREE.maxProperties, usage: { units: 0, properties: 0 }, paidUntil: null, trialUntil: null, accessUntil: null, freezeAt: null, offerKind: "NONE", offerUntil: null, discountPercent: 0, fixedPriceCents: null, featureOverrides: {}, overridesUntil: null, recurringConsent: false, nextPriceCents: 0, reminder: null, simulationNow: null, scopes: [], requests: [], audit: [], contract: { version: config.version, plan: config.plans.FREE, capacityUnits: config.plans.FREE.includedUnits, annualMonths: config.annualMonths, graceDays: config.graceDays, currency: "CZK" }, features: config.plans.FREE.features };
}

export function AdminPaymentRequest({ summary, config, returnTo }: { summary: SubscriptionSummary; config: SubscriptionConfig; returnTo: string }) {
  return <form className={styles.form} action="/api/subscriptions/request" method="post"><input type="hidden" name="accountId" value={summary.accountId!}/><input type="hidden" name="returnTo" value={returnTo}/><div className={styles.formGrid}><Select label="Tarif pro testovací úhradu" name="plan" defaultValue={summary.plan === "FREE" ? "PROFI" : summary.plan} options={Object.values(config.plans).filter(plan => plan.code !== "FREE").map(plan => [plan.code, plan.name])}/><Select label="Platební období" name="interval" defaultValue={summary.interval} options={[["MONTHLY", "Měsíčně"], ["ANNUAL", "Ročně"]]}/><Field label="Kapacita pro testovací úhradu" name="capacityUnits" type="number" min={1} step="1" defaultValue={Math.max(summary.usage.units, summary.plan === "FREE" ? config.plans.PROFI.includedUnits : summary.contract.capacityUnits)} required/><Select label="Testovací platební metoda" name="method" defaultValue="CARD" options={Object.entries(paymentMethodLabels)}/></div><button className="secondary" type="submit">Vytvořit testovací požadavek</button></form>;
}

export function SimulatePayment({ requestId, returnTo }: { requestId: string; returnTo: string }) {
  return <form action="/api/subscriptions/simulate" method="post"><input type="hidden" name="requestId" value={requestId}/><input type="hidden" name="returnTo" value={returnTo}/><div className={styles.actions}><button className="secondary" type="submit" name="outcome" value="paid">Přijmout úhradu</button><button className="secondary" type="submit" name="outcome" value="failed">Ověřit selhání</button></div></form>;
}
