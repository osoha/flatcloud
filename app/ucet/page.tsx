import {ReceiptSignatureSettings} from "@/components/ReceiptSignatureSettings";
import {portalEditableUnitWhere} from "@/lib/tenant-portal-access";
import { ProfiAppearanceSettings } from "@/components/ProfiAppearanceSettings";
import { GuideLauncher } from "@/components/GuideLauncher";
import { prisma } from "@/lib/db";
import { notificationDefaults, notificationFields } from "@/lib/task-discussion-shared";
import { PageHeading } from "@/components/PageHeading";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { UserAvatar } from "@/components/UserAvatar";
import { requireUser, previewContext } from "@/lib/auth";
import { getMyOwnerReceiptSettings } from "@/lib/owner-receipt-settings";
import Link from "next/link";
import { IllustrationPicker } from "@/components/IllustrationPicker";
import { suggestedIllustration } from "@/lib/illustration-library";

export const dynamic = "force-dynamic";

type Search = { changed?: string; error?: string; ok?: string };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const query = await searchParams;
  const receiptSettings=await prisma.user.findUniqueOrThrow({where:{id:user.id},select:{receiptIssuerName:true,receiptIssuerAddress:true,receiptIssuanceEnabled:true,receiptSignatureData:true}});
  const [ownerReceiptSettings, preview] = await Promise.all([
    user.role === "TENANT" ? [] : getMyOwnerReceiptSettings(user),
    previewContext(),
  ]);
  const canIssueReceipts=user.role!=="TENANT"&&!preview.requested&&await prisma.unit.count({where:portalEditableUnitWhere(user)})>0;
  const preference = await prisma.taskNotificationPreference.findUnique({ where: { userId: user.id } }) || notificationDefaults;
  const deliveries = user.role === "TENANT" ? await prisma.tenantPortalNotification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, createdAt: true, status: true } }) : await prisma.taskNotification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, createdAt: true, status: true } });
  const deliveryLabels: Record<string, string> = { PENDING: "Ve frontě", SENDING: "Odesílání", SENT: "Odesláno", RETRY: "Čeká na opakování", SKIPPED: "Neodesláno dle nastavení nebo přístupu", FAILED: "Odeslání selhalo", UNKNOWN: "Odeslání nepotvrzeno" };
  const messages: Record<string, string> = {
    current: "Současné heslo není správné.",
    length: "Nové heslo musí mít alespoň 12 znaků.",
    match: "Nové heslo a jeho potvrzení se neshodují.",
    same: "Nové heslo musí být jiné než současné.",
  };
  const passwordError = query.error ? messages[query.error] : undefined;

  return (
    <Shell user={user}>
      <div className="page account-full-width">
        <div className="page-title">
          <div>
            <PageHeading>Můj účet</PageHeading>
            <p>{user.name} · {user.email}</p>
          </div>
          <GuideLauncher/>
        </div>

        <Flash ok={query.ok} error={query.error && !passwordError ? query.error : undefined}/>

        <section id="upozorneni" data-guide="notifications" className="card account-card notification-settings">
          <h2>Upozornění</h2>
          {user.role === "TENANT" ? <p>Provozní upozornění k vašemu nájmu jsou vždy zapnutá. Na e-mail dostanete oznámení, nové zprávy, změny stavu a připomenutí termínů. Odpovídat můžete přímo v portálu. Změnu kontaktních údajů nahlaste správci v portálu nájemníka.</p> : <>
          <p>E-maily z úkolů a diskusí můžete kdykoli vypnout. Upozornění uvnitř aplikace zůstanou zachována. Reakce e-maily neposílají.</p>
          <form action="/api/account/notifications" method="post">
            {notificationFields.map(([key,label]) => <label className="checkbox-field" key={key}><input type="checkbox" name={key} defaultChecked={preference[key]}/><span>{label}</span></label>)}
            <small>Přímé zmínky a komentáře zpracováváme po uložení. Přiřazení, změny stavu a termíny kontroluje hodinový plánovač. U termínu posíláme nejvýše jedno upozornění předem a jedno po termínu.</small>
            <button className="primary" type="submit">Uložit upozornění</button>
          </form>
          </>}
          {deliveries.length > 0 && <details><summary>Poslední e-mailová upozornění</summary><ul>{deliveries.map(row => <li key={row.id}>{row.createdAt.toLocaleString("cs-CZ")} · {deliveryLabels[row.status] || row.status}</li>)}</ul></details>}
        </section>

        <div className="card account-card account-avatar-card">
          <div className="card-head"><div><h2>Profilová fotografie</h2><p className="muted-copy">Fotografie se automaticky ořízne na čtverec a uloží v optimalizované velikosti pro ostré zobrazení v aplikaci.</p></div></div>
          <form action="/api/account/avatar" method="post" encType="multipart/form-data" className="account-avatar-form">
            <UserAvatar user={user} size="lg"/>
            <div className="account-avatar-fields">
              <IllustrationPicker kind="person" selected={user.avatarMimeType ? "upload" : user.avatarChoice || suggestedIllustration("person", user.id)}/>
              <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp"/>
              <small>PNG, JPG nebo WebP, maximálně 2 MB.</small>
              {user.avatarMimeType && <label className="checkbox-field"><input type="checkbox" name="removeAvatar"/><span>Odstranit současný avatar</span></label>}
              <button className="primary" type="submit">Uložit avatar</button>
            </div>
          </form>
        </div>

        {ownerReceiptSettings.length > 0 && <section className="card account-card" id="zastoupeni"><h2>Jednám za pronajímatele</h2><p className="muted-copy">Za každého pronajímatele potvrzujete vlastní oprávnění a podpis zvlášť. Souhlas za jinou osobu udělit nelze.</p><div className="stack-list">{ownerReceiptSettings.map(owner => <div className="inline-edit-card" key={owner.id}><div className="rule-summary"><div><strong>{owner.name}</strong><small>{owner.canManage ? "Údaje pronajímatele a jednající osoby" : "Můj podpis a osobní souhlas"}</small></div><Link className="secondary" href={`/vlastnici/${owner.id}/doklady`}>Otevřít nastavení</Link></div></div>)}</div></section>}
        {canIssueReceipts&&<ReceiptSignatureSettings name={receiptSettings.receiptIssuerName||user.name} address={receiptSettings.receiptIssuerAddress||""} enabled={receiptSettings.receiptIssuanceEnabled} hasSignature={Boolean(receiptSettings.receiptSignatureData)}/>}
        <ProfiAppearanceSettings graphics={user.profiGraphics}/>
        <div className="card account-card">
          <div className="card-head"><h2>Změna hesla</h2></div>
          {query.changed && <div className="notice success-notice">Heslo bylo úspěšně změněno.</div>}
          {passwordError && <div className="error">{passwordError}</div>}
          <form action="/api/account/password" method="post" className="account-form">
            <div className="field"><label>Současné heslo</label><input type="password" name="currentPassword" autoComplete="current-password" required /></div>
            <div className="field"><label>Nové heslo</label><input type="password" name="newPassword" autoComplete="new-password" minLength={12} required /></div>
            <div className="field"><label>Nové heslo znovu</label><input type="password" name="confirmPassword" autoComplete="new-password" minLength={12} required /></div>
            <button className="primary" type="submit">Změnit heslo</button>
          </form>
        </div>
      </div>
    </Shell>
  );
}
