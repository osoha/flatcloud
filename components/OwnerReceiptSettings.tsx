import Link from "next/link";
import { OwnerRepresentativeConsent } from "./OwnerRepresentativeConsent";
import { getOwnerReceiptSettings } from "@/lib/owner-receipt-settings";
import { dateTime } from "@/lib/format";
import styles from "./ReceiptSettings.module.css";

type Settings = NonNullable<Awaited<ReturnType<typeof getOwnerReceiptSettings>>>;

export function OwnerReceiptSettings({ settings, canAct, hasSavedSignature }: { settings: Settings; canAct: boolean; hasSavedSignature: boolean }) {
  const { owner, profile, representatives } = settings;
  const canManage = settings.canManage && canAct;
  const ready = settings.status.ready;

  return <section className={`card ${styles.section}`} id="doklady-a-podpisy" aria-labelledby="owner-receipt-heading">
    <div className={styles.header}><div><h2 id="owner-receipt-heading">Doklady a jednající osoby</h2><p className="muted-copy">Na dokladu je pronajímatel jako vystavitel a jméno s podpisem osoby, která za něj jedná.</p></div><span className={`status ${ready ? "ok" : "warn"}`}>{ready ? "Vystavování připraveno" : "Vyžaduje nastavení"}</span></div>
    {!canAct && <p className="notice">Prohlížíte náhled účtu. Nastavení a osobní souhlas lze měnit až po návratu do vlastního účtu.</p>}
    <div className={styles.columns}>
      <div>
        <h3>1. Údaje pronajímatele</h3>
        {canManage ? <form className={styles.form} action={`/api/owners/${owner.id}/receipt-profile`} method="post">
          <input type="hidden" name="revision" value={profile?.updatedAt.toISOString() || "new"}/>
          <label className="field"><span>Název / jméno vystavitele</span><input name="issuerName" defaultValue={profile?.issuerName || owner.name} maxLength={160} required/></label>
          <label className="field"><span>Adresa vystavitele</span><input name="issuerAddress" defaultValue={profile?.issuerAddress || owner.address || ""} maxLength={240} required/></label>
          <label className="field"><span>Osoba podepisující doklady</span><select name="designatedRepresentativeId" defaultValue={profile?.designatedRepresentativeId || ""}><option value="">Vyberte jednající osobu</option>{representatives.filter(person => person.active || person.id === profile?.designatedRepresentativeId).map(person => <option value={person.id} key={person.id}>{person.user.name}{person.roleLabel ? ` · ${person.roleLabel}` : ""}{!person.active ? " · neaktivní" : person.consentCurrent ? " · souhlas potvrzen" : " · čeká na souhlas"}</option>)}</select></label>
          <label className="checkbox-field"><input type="checkbox" name="enabled" defaultChecked={profile?.enabled || false}/><span>Povolit vystavování dokladů za tohoto pronajímatele</span></label>
          <small>Nejprve uložte údaje, přidejte jednající osobu a nechte ji potvrdit vlastní souhlas. Poté ji vyberte pro podpis a zapněte vystavování. Změna názvu nebo adresy vyžaduje nový souhlas.</small>
          <button className="primary" type="submit">Uložit údaje a vystavování</button>
        </form> : <>
          <div className={styles.identity}><strong>{profile?.issuerName || owner.name}</strong><span>{profile?.issuerAddress || "Adresa vystavitele zatím není nastavená."}</span><span>Podepisující osoba: {profile?.designatedRepresentativeName || "Zatím nevybraná"}</span></div>
          <p className={styles.note}>{profile ? profile.enabled ? "Vystavování je povolené. Doklad vyžaduje platný souhlas vybrané jednající osoby." : "Vystavování zatím není zapnuté." : "Údaje pronajímatele zatím nejsou potvrzené pro vystavování dokladů."}</p>
        </>}
        <p className={styles.note}>Pronajímatele přiřadíte ke konkrétnímu nájmu a období v jednotce, v části Dokumenty → Doklady o zaplacení. Již vystavené PDF se změnou nastavení nepřepisuje.</p>
      </div>
      <div>
        <h3>2. Jednající osoby a jejich podpisy</h3>
        <p className={styles.note}>Stejná osoba může zastupovat více pronajímatelů. Každý souhlas a podpis patří ke konkrétnímu pronajímateli.</p>
        {representatives.map(person => <article key={person.id} className={styles.person}>
          <div className={styles.header}><div><h3>{person.user.name}</h3><span className={styles.meta}>{person.user.email}{person.roleLabel ? ` · ${person.roleLabel}` : ""}</span></div><span className={`status ${!person.active ? "neutral" : person.consentCurrent && person.hasSignature ? "ok" : "warn"}`}>{!person.active ? "Neaktivní" : person.consentCurrent && person.hasSignature ? "Souhlas a podpis platný" : person.revokedAt ? "Souhlas odvolán" : person.consentedAt ? "Potvrdit nový souhlas" : "Čeká na osobní souhlas"}</span></div>
          {person.id === profile?.designatedRepresentativeId && <p className={styles.note}>Vybraná osoba pro podpis dokladů.</p>}
          {person.consentedAt && <p className={styles.note}>Poslední souhlas: {dateTime(person.consentedAt)}</p>}
          {canManage && <details className="create-panel"><summary>Upravit zastoupení</summary><form className={styles.form} action={`/api/owners/${owner.id}/representatives`} method="post">
            <input type="hidden" name="action" value="update"/><input type="hidden" name="representativeId" value={person.id}/><input type="hidden" name="revision" value={person.updatedAt.toISOString()}/>
            <label className="field"><span>Funkce / oprávnění</span><input name="roleLabel" defaultValue={person.roleLabel || ""} maxLength={120} placeholder="např. jednatel nebo pověřený správce"/></label>
            <label className="checkbox-field"><input type="checkbox" name="active" defaultChecked={person.active}/><span>Aktivní zastoupení</span></label>
            <small>Změna funkce nebo vypnutí zastoupení zneplatní dosavadní souhlas. Osoba jej pak musí potvrdit znovu.</small>
            <button className="secondary" type="submit">Uložit zastoupení</button>
          </form></details>}
          {person.canConsent && canAct && person.active && profile && <details className="create-panel" open={!person.consentCurrent}><summary>{person.consentCurrent ? "Obnovit můj podpis a souhlas" : "Potvrdit můj podpis a souhlas"}</summary><OwnerRepresentativeConsent ownerId={owner.id} representativeId={person.id} revision={person.updatedAt.toISOString()} profileRevision={profile.revision} issuerName={profile.issuerName} issuerAddress={profile.issuerAddress} signerName={person.user.name} hasSavedSignature={hasSavedSignature}/></details>}
          {person.canConsent && canAct && person.active && !profile && <p className={styles.note}>Nejprve je potřeba uložit údaje pronajímatele. Potom zde potvrdíte vlastní podpis a souhlas.</p>}
          {person.canRevoke && canAct && <form className={styles.actions} action={`/api/owners/${owner.id}/representatives/${person.id}/consent`} method="post"><input type="hidden" name="revision" value={person.updatedAt.toISOString()}/><input type="hidden" name="profileRevision" value={profile?.revision || 0}/><button className="danger-button" type="submit" name="action" value="revoke">Odvolat můj souhlas</button></form>}
          {!person.canConsent && !person.consentCurrent && person.active && <p className={styles.note}>Podpis a souhlas potvrzuje {person.user.name} ve svém účtu v části „Jednám za pronajímatele“.</p>}
        </article>)}
        {!representatives.length && <p className={styles.note}>Zatím není určená žádná jednající osoba.</p>}
        {canManage && <details className="create-panel" open={!representatives.length}><summary>Přidat jednající osobu</summary><form className={styles.form} action={`/api/owners/${owner.id}/representatives`} method="post">
          <input type="hidden" name="action" value="add"/><input type="hidden" name="active" value="on"/>
          <label className="field"><span>E-mail uživatele aplikace</span><input name="userEmail" type="email" required autoComplete="off"/></label>
          <label className="field"><span>Funkce / oprávnění</span><input name="roleLabel" maxLength={120} placeholder="např. jednatel nebo pověřený správce"/></label>
          <small>Přidáním osoby se vystavování nezapne. Osoba se musí přihlásit a sama potvrdit své oprávnění a podpis.</small>
          <button className="secondary" type="submit">Přidat jednající osobu</button>
        </form></details>}
      </div>
    </div>
  </section>;
}

export function OwnerReceiptSummary({ settings }: { settings: Settings }) {
  const ready = settings.status.ready;
  return <section className={`card ${styles.section}`} id="doklady-a-podpisy"><div className={styles.header}><div><h2>Doklady a jednající osoby</h2><p className="muted-copy">Vystavitel: {settings.profile?.issuerName || settings.owner.name} · Podepisuje: {settings.profile?.designatedRepresentativeName || "zatím neurčeno"}</p></div><span className={`status ${ready ? "ok" : "warn"}`}>{ready ? "Vystavování připraveno" : "Vyžaduje nastavení"}</span></div><div className={styles.actions}><Link className="primary" href={`/vlastnici/${settings.owner.id}/doklady`}>Nastavit doklady a podpisy</Link></div><p className={styles.note}>Jednající osoba potvrzuje vlastní podpis a souhlas. Doklady k jednotlivým nájmům najdete u dokumentů jednotky.</p></section>;
}
