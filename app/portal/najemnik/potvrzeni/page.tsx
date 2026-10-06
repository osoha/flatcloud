import { TenantPortalFrame } from "@/components/TenantPortalFrame";
import Link from "next/link";
import { notFound } from "next/navigation";
import { workflowActor, myPackets } from "@/lib/lease-actions/service";
import {
  packetStatus,
  actionLabels,
  actionKind,
} from "@/lib/lease-actions/core";
export const dynamic = "force-dynamic";
export default async function Inbox() {
  const actor = await workflowActor();
  if (!actor) notFound();
  const packets = await myPackets(actor);
  return (
    <TenantPortalFrame user={actor}>
      <main className="page" style={{ maxWidth: 1000, margin: "auto" }}>
        <Link
          href={actor.role === "TENANT" ? "/portal/najemnik" : "/portfolio"}
        >
          Zpět do aplikace
        </Link>
        <div className="card">
          <h1>Moje podpisy a potvrzení</h1>
          <Link className="secondary" href="/portal/najemnik/podpis">
            Můj podpis
          </Link>
          <p>
            Každý úkon má vlastní význam. Převzetí dokumentu samo neznamená
            souhlas s jeho obsahem.
          </p>
          {!packets.length && (
            <p>
              Zatím vám nebyl předán žádný dokument k podpisu nebo potvrzení.
            </p>
          )}
          {packets.map((p) => (
            <article className="inline-edit-card" key={p.id}>
              <h2>{p.title}</h2>
              <p>
                {p.lease.unit.property.name} · {p.lease.unit.label}
              </p>
              <p>{packetStatus(p)}</p>
              <Link
                className="primary"
                href={`/portal/najemnik/potvrzeni/${p.id}`}
              >
                {p.mine.every((r) => r.completedAt)
                  ? "Otevřít záznam"
                  : actionLabels[actionKind(p.kind)]}
              </Link>
            </article>
          ))}
        </div>
      </main>
    </TenantPortalFrame>
  );
}
