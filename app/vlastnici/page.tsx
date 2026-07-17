import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, canSeeAll } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Flash, Field, FormCard, Select, Textarea } from "@/components/FormUi";
import { ownerTypes } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function OwnersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  if (!canSeeAll(user.role)) redirect("/portfolio");
  const [owners, query] = await Promise.all([
    prisma.owner.findMany({ include: { _count: { select: { properties: true } } }, orderBy: { name: "asc" } }),
    searchParams,
  ]);

  return <Shell user={user}><div className="page">
    <div className="page-title"><div><h1>Vlastníci a SPV</h1><p>Oddělená portfolia interních společností i externích vlastníků.</p></div></div>
    <Flash ok={query.ok} error={query.error}/>
    <div className="detail-grid">
      <div className="card col-7">
        <div className="card-head"><h2>Seznam vlastníků</h2></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Název</th><th>Typ</th><th>IČO</th><th>Nemovitosti</th><th>Stav</th></tr></thead>
          <tbody>{owners.length ? owners.map((owner) => {
            const href = `/vlastnici/${owner.id}`;
            return <tr className="clickable-table-row" key={owner.id}>
              <td><Link className="row-cell-link table-link" href={href}>{owner.name}</Link></td>
              <td><Link className="row-cell-link" href={href}>{ownerTypes[owner.type]}</Link></td>
              <td><Link className="row-cell-link" href={href}>{owner.ico || "—"}</Link></td>
              <td><Link className="row-cell-link" href={href}>{owner._count.properties}</Link></td>
              <td><Link className="row-cell-link" href={href}><span className={`status ${owner.active ? "ok" : "bad"}`}>{owner.active ? "Aktivní" : "Neaktivní"}</span></Link></td>
            </tr>;
          }) : <tr><td colSpan={5} className="table-empty">Bez vlastníků</td></tr>}</tbody>
        </table></div>
      </div>
      <div className="col-5">
        <FormCard action="/api/owners" cancelHref="/portfolio" submitLabel="Přidat vlastníka">
          <h2 className="form-section-title field-full">Nový vlastník / SPV</h2>
          <Field label="Název" name="name" required/>
          <Select label="Typ" name="type" options={Object.entries(ownerTypes)}/>
          <Field label="IČO" name="ico"/>
          <Field label="E-mail" name="email" type="email"/>
          <Field label="Telefon" name="phone"/>
          <Field label="Adresa" name="address" full/>
          <Textarea label="Poznámka" name="note"/>
        </FormCard>
      </div>
    </div>
  </div></Shell>;
}
