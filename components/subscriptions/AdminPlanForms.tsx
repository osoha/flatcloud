import { Field } from "@/components/FormUi";
import type { SubscriptionConfig, SubscriptionPlan } from "@/lib/subscriptions/types";
import { subscriptionFeatures, subscriptionPlanDescriptions } from "./catalog";
import { subscriptionMoney } from "./SubscriptionUi";
import styles from "./subscriptions.module.css";

export function AdminPlanForms({ config }: { config: SubscriptionConfig }) {
  return <div className={styles.grid}>{Object.values(config.plans).map(plan => <PlanForm key={`${config.version}-${plan.code}`} plan={plan}/>)}</div>;
}

function PlanForm({ plan }: { plan: SubscriptionPlan }) {
  return <section className={`card ${styles.card}`} data-testid={`subscription-plan-${plan.code}`}>
    <div className={styles.head}><div><h2>{plan.name}</h2><p>{subscriptionPlanDescriptions[plan.code]}</p></div></div>
    <div className={styles.price}>{subscriptionMoney(plan.monthlyPriceCents)} <small>/ měsíc</small></div>
    <form className={styles.form} action="/api/admin/subscriptions/config" method="post">
      <input type="hidden" name="operation" value="plan"/><input type="hidden" name="planCode" value={plan.code}/><input type="hidden" name="returnTo" value="/nastaveni/tarify"/>
      <div className={styles.formGrid}>
        <Field label="Měsíční cena v Kč včetně DPH" name="priceKc" type="number" min={0} step="0.01" defaultValue={plan.monthlyPriceCents / 100} required/>
        <Field label={plan.code === "FREE" ? "Maximum aktivních jednotek" : "Jednotek v základní ceně"} name="includedUnits" type="number" min={1} step="1" defaultValue={plan.includedUnits} required/>
        <Field label="Další jednotka / měsíc v Kč" name="additionalPriceKc" type="number" min={0} step="0.01" defaultValue={plan.additionalUnitPriceCents / 100} required/>
        <Field label="Maximum objektů (prázdné = bez omezení)" name="maxProperties" type="number" min={1} step="1" defaultValue={plan.maxProperties}/>
      </div>
      <div className={styles.featureChecks} aria-label={`Funkce tarifu ${plan.name}`}>{subscriptionFeatures.map(feature => <label className="checkbox-field" key={feature.key}><input type="checkbox" name={`feature:${feature.key}`} defaultChecked={plan.features[feature.key]}/><span>{feature.label}<small>{feature.help}</small></span></label>)}</div>
      <Field label="Důvod změny" name="reason" placeholder="Např. úprava ceníku pro nové zákazníky" required/>
      <button className="primary" type="submit">Uložit {plan.name}</button>
    </form>
  </section>;
}

export function AdminBillingSettings({ config }: { config: SubscriptionConfig }) {
  return <section className={`card ${styles.card}`} id="platebni-nastaveni"><div className={styles.head}><div><h2>Platební nastavení a upozornění</h2><p>Ceny jsou v Kč včetně DPH. Předplatné je oddělené od nájmů a účtů jednotlivých domů.</p></div></div>
    <form className={styles.form} action="/api/admin/subscriptions/config" method="post">
      <input type="hidden" name="operation" value="settings"/><input type="hidden" name="returnTo" value="/nastaveni/tarify"/>
      <div className={styles.formGrid}>
        <Field label="Účet pro předplatné" name="subscriptionBankAccount" defaultValue={config.subscriptionBankAccount} placeholder="Sandboxové číslo účtu / IBAN"/>
        <Field label="Příjemce plateb" name="recipientName" defaultValue={config.recipientName} required/>
        <Field label="Počet placených měsíců za rok" name="annualMonths" type="number" min={1} max={12} step="1" defaultValue={config.annualMonths} required/>
        <Field label="Zmrazení po uplynutí dnů od exspirace" name="graceDays" type="number" min={0} max={60} step="1" defaultValue={config.graceDays} required/>
        <Field label="Délka zkušebního období ve dnech" name="trialDays" type="number" min={1} max={90} step="1" defaultValue={config.trialDays} required/>
        <Field label="Upozornění ve dnech vůči exspiraci" name="reminderDays" defaultValue={config.reminderDays.join(", ")} placeholder="-7, 0, 5" required/>
      </div>
      <p className={styles.help}>Záporné číslo znamená před exspirací, kladné po ní. Upozornění se v sandboxu ukládají uvnitř aplikace; skutečné e-maily ani platby se neodesílají.</p>
      <label className="checkbox-field"><input type="checkbox" name="enabled" defaultChecked={config.enabled}/><span>Uplatňovat tarifní omezení u uživatelů s nastaveným předplatným</span></label>
      <p className={styles.help}>Stávající uživatele bez přiřazeného tarifu automaticky neomezujeme. Ceník nemění jejich oprávnění ani cenu již sjednaných předplatných.</p>
      <Field label="Důvod změny" name="reason" placeholder="Např. úprava délky ochranné lhůty" required/>
      <div className={styles.actions}><button className="primary" type="submit">Uložit platební nastavení</button></div>
    </form>
  </section>;
}
