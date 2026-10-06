import {RecordActionOpened} from "@/components/RecordActionOpened";
import { TenantPortalFrame } from "@/components/TenantPortalFrame";
import Link from "next/link";
import { notFound } from "next/navigation";
import { workflowActor, accessiblePacket } from "@/lib/lease-actions/service";
import {
  actionKind,
  actionLabels,
  actionMeanings,
  packetStatus,
} from "@/lib/lease-actions/core";
import { Flash } from "@/components/FormUi";
export const dynamic = "force-dynamic";
export default async function Action({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const actor = await workflowActor();
  if (!actor) notFound();
  const { id } = await params,
    p = await accessiblePacket(actor, id);
  if (!p) notFound();
  const kind = actionKind(p.kind),
    pending = p.mine.filter((r) => !r.completedAt),
    cancelled = Boolean(p.cancelledAt),
    fmt = (d: Date) =>
      new Intl.DateTimeFormat("cs-CZ", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Prague",
      }).format(d);
  return (
    <TenantPortalFrame user={actor}>
      <main className="page" style={{ maxWidth: 950, margin: "auto" }}>
        <RecordActionOpened packetId={id}/>
        <Link href="/portal/najemnik/potvrzeni">Moje podpisy a potvrzení</Link>
        <div className="card">
          <h1>{p.title}</h1>
          <Flash {...await searchParams} />
          <p>{packetStatus(p)}</p>
          <p>
            {p.lease.unit.property.name} · {p.lease.unit.label}
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{p.body}</p>
          {p.document && (
            <a
              className="primary"
              href={`/api/portal/actions/${id}?original=1`}
            >
              Otevřít přesné PDF před potvrzením
            </a>
          )}
          <p>
            <strong>{actionMeanings[kind]}</strong>
          </p>
          {pending.length && !cancelled ? (
            <form
              action={`/api/portal/actions/${id}`}
              method="post"
              className="edit-form"
            >
              <input type="hidden" name="contentHash" value={p.contentHash} />
              <label className="checkbox-field">
                <input name="accepted" type="checkbox" required />
                <span>{actionMeanings[kind]}</span>
              </label>
              {kind === "SIGN" && (
                <>
                  <p>
                    Nejdříve si uložte{" "}
                    <Link href="/portal/najemnik/podpis">vlastní podpis</Link>.
                    Použijeme jej pouze pro toto konkrétní PDF.
                  </p>
                  <label className="field">
                    <span>Potvrzení podpisu heslem</span>
                    <input
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      maxLength={200}
                    />
                  </label>
                </>
              )}
              <button className="primary">{actionLabels[kind]}</button>
            </form>
          ) : null}
          <h2>Záznam úkonů</h2>
          {p.recipients.map((r) => (
            <p key={r.id}>
              <strong>{r.expectedName}</strong> ·{" "}
              {r.completedAt
                ? `${kind === "SIGN" ? "Podepsáno" : "Potvrzeno"} ${fmt(r.completedAt)}`
                : r.openedAt
                  ? `Otevřeno ${fmt(r.openedAt)}, čeká na výslovné potvrzení`
                  : "Dosud neotevřeno"}
            </p>
          ))}
          <a className="secondary" href={`/api/portal/actions/${id}`}>
            Stáhnout dokument se záznamem úkonů
          </a>
          <p>
            Časy eviduje aplikace. Nejde o kvalifikované časové razítko ani
            kvalifikovaný elektronický podpis.
          </p>
          {p.manages && (
            <>
              <Link
                className="secondary"
                href={`/smlouvy/${p.leaseId}/potvrzeni`}
              >
                Přehled správce
              </Link>
              {p.recipients.some((r) => !r.completedAt) && (
                <p className="contract-note">
                  Chybí potvrzení. Zvažte předání jinou prokazatelnou formou —
                  osobně s potvrzením převzetí, datovou schránkou nebo
                  doporučenou zásilkou podle konkrétní situace. Vložení do
                  portálu ani odeslání upozornění samo neprokazuje doručení.
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </TenantPortalFrame>
  );
}
