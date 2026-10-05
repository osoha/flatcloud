import { notFound } from "next/navigation";
import { requireUser, actualUser, canSeeAll, previewContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOwnerReceiptSettings } from "@/lib/owner-receipt-settings";
import { Shell } from "@/components/Shell";
import { FormPage, Flash } from "@/components/FormUi";
import { OwnerReceiptSettings } from "@/components/OwnerReceiptSettings";

export const dynamic = "force-dynamic";

export default async function OwnerReceiptsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [settings, query, actor, preview] = await Promise.all([getOwnerReceiptSettings(user, id), searchParams, actualUser(), previewContext()]);
  if (!settings) notFound();
  const canAct = !preview.requested && actor?.id === user.id;
  const saved = canAct ? await prisma.user.findUnique({ where: { id: user.id }, select: { receiptSignatureData: true } }) : null;
  return <Shell user={user}><FormPage title={`${settings.owner.name} · doklady`} description="Pronajímatel, jednající osoby a jejich vlastní podpisy a souhlasy." backHref={canSeeAll(user.role) ? `/vlastnici/${id}` : "/ucet#zastoupeni"}>
    <Flash ok={query.ok} error={query.error}/>
    <OwnerReceiptSettings settings={settings} canAct={canAct} hasSavedSignature={Boolean(saved?.receiptSignatureData)}/>
  </FormPage></Shell>;
}
