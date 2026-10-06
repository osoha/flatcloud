import { TenantPortalFrame } from "@/components/TenantPortalFrame";
import Link from "next/link";
import { notFound } from "next/navigation";
import { workflowActor } from "@/lib/lease-actions/service";
import { prisma } from "@/lib/db";
import { Flash } from "@/components/FormUi";
import { PersonalContractSignature } from "@/components/PersonalContractSignature";
export const dynamic = "force-dynamic";
export default async function Signature({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const actor = await workflowActor();
  if (!actor) notFound();
  const profile = await prisma.contractSignatureProfile.findUnique({
    where: { userId: actor.id },
    select: { userId: true },
  });
  return (
    <TenantPortalFrame user={actor}>
      <main className="page" style={{ maxWidth: 900, margin: "auto" }}>
        <Link href="/portal/najemnik/potvrzeni">
          Zpět na moje podpisy a potvrzení
        </Link>
        <div className="card">
          <h1>Můj podpis</h1>
          <p>{actor.name}</p>
          <Flash {...await searchParams} />
          <PersonalContractSignature hasSignature={Boolean(profile)} />
        </div>
      </main>
    </TenantPortalFrame>
  );
}
