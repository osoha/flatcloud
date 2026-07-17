import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, canSeeAll } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Checkbox, Field, Flash, FormCard, FormPage, Select, Textarea } from "@/components/FormUi";
import { ownerTypes } from "@/lib/labels";
import { formatIban, ownerBankAccountLabel } from "@/lib/owner-bank-account";

export const dynamic = "force-dynamic";
export default async function OwnerEdit({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{ok?:string;error?:string}> }) {
  const user = await requireUser();
  if (!canSeeAll(user.role)) redirect("/portfolio");
  const { id } = await params;
  const [owner, query] = await Promise.all([
    prisma.owner.findUnique({ where: { id }, include: { properties: { orderBy: { name: "asc" } }, paymentAccounts: { orderBy: [{ active: "desc" }, { createdAt: "asc" }] } } }),
    searchParams,
  ]);
  if (!owner) notFound();
  return <Shell user={user}><FormPage title={owner.name} description={`${owner.properties.length} spravovaných nemovitostí · ${owner.paymentAccounts.length} bankovních účtů`} backHref="/vlastnici">
    <Flash ok={query.ok} error={query.error}/>
    <div className="detail-grid">
      <div className="col-7">
        <FormCard action={`/api/owners/${owner.id}`} cancelHref="/vlastnici">
          <Field label="Název" name="name" defaultValue={owner.name} required/>
          <Select label="Typ" name="type" defaultValue={owner.type} options={Object.entries(ownerTypes)}/>
          <Field label="IČO" name="ico" defaultValue={owner.ico}/>
          <Field label="E-mail" name="email" type="email" defaultValue={owner.email}/>
          <Field label="Telefon" name="phone" defaultValue={owner.phone}/>
          <Field label="Adresa" name="address" defaultValue={owner.address} full/>
          <Textarea label="Poznámka" name="note" defaultValue={owner.note}/>
          <Checkbox label="Aktivní vlastník" name="active" defaultChecked={owner.active} full/>
        </FormCard>
      </div>
      <div className="card col-5">
        <div className="card-head"><div><h2>Bankovní účty vlastníka</h2><p className="muted-copy">Účet lze následně vybrat u vlastnictví konkrétní jednotky.</p></div></div>
        <div className="stack-list">
          {owner.paymentAccounts.map((account) => <form className="inline-edit-card" action={`/api/owners/${owner.id}/bank-accounts/${account.id}`} method="post" key={account.id}>
            <div className="rule-summary"><div><strong>{ownerBankAccountLabel(account)}</strong><small>{account.iban ? formatIban(account.iban) : "IBAN se pro český účet dopočítá při platbě"}</small></div><span className={`status ${account.active ? "ok" : "bad"}`}>{account.active ? "Aktivní" : "Neaktivní"}</span></div>
            <div className="inline-edit-grid" style={{marginTop:12}}>
              <label className="field"><span>Název účtu</span><input name="label" defaultValue={account.label || ""}/></label>
              <label className="field"><span>Číslo účtu</span><input name="accountNumber" defaultValue={account.accountNumber || ""}/></label>
              <label className="field"><span>Kód banky</span><input name="bankCode" defaultValue={account.bankCode || ""}/></label>
              <label className="field"><span>IBAN</span><input name="iban" defaultValue={account.iban || ""}/></label>
              <label className="field"><span>Měna</span><input name="currency" defaultValue={account.currency}/></label>
              <label className="checkbox-field"><input type="checkbox" name="active" defaultChecked={account.active}/><span>Aktivní účet</span></label>
            </div>
            <div className="mini-actions"><button className="danger-button" type="submit" name="mode" value="delete">Odstranit</button><button className="secondary" type="submit">Uložit účet</button></div>
          </form>)}
          {!owner.paymentAccounts.length && <div className="table-empty">Vlastník zatím nemá uložený bankovní účet.</div>}
        </div>
        <form className="compact-form" action={`/api/owners/${owner.id}/bank-accounts`} method="post">
          <h3>Přidat účet</h3>
          <div className="inline-edit-grid">
            <label className="field"><span>Název účtu</span><input name="label" placeholder="např. Hlavní nájemné"/></label>
            <label className="field"><span>Číslo účtu</span><input name="accountNumber" placeholder="123456789"/></label>
            <label className="field"><span>Kód banky</span><input name="bankCode" placeholder="0800"/></label>
            <label className="field"><span>IBAN</span><input name="iban" placeholder="CZ…"/></label>
            <label className="field"><span>Měna</span><input name="currency" defaultValue="CZK"/></label>
            <label className="checkbox-field"><input type="checkbox" name="active" defaultChecked/><span>Aktivní účet</span></label>
          </div>
          <button className="primary" type="submit">Přidat bankovní účet</button>
        </form>
      </div>
    </div>
  </FormPage></Shell>;
}
