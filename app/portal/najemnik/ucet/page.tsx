import Link from "next/link";
import { IllustrationPicker } from "@/components/IllustrationPicker";
import { suggestedIllustration } from "@/lib/illustration-library";
import { notFound, redirect } from "next/navigation";
import { actualUser, previewContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  manageableTenantLeaseIds,
  tenantPortalContactMatches,
} from "@/lib/tenant-portal-access";
import { TenantPortalFrame } from "@/components/TenantPortalFrame";
import { UserAvatar } from "@/components/UserAvatar";
import { PersonalContractSignature } from "@/components/PersonalContractSignature";
import { Flash } from "@/components/FormUi";
import { leaseContractPilotEnabled } from "@/lib/lease-contract/pilot";
export const dynamic = "force-dynamic";
export default async function TenantAccount({
  searchParams,
}: {
  searchParams: Promise<{
    tenantId?: string;
    ok?: string;
    error?: string;
    changed?: string;
  }>;
}) {
  const actor = await actualUser();
  if (!actor) redirect("/login");
  const query = await searchParams,
    context = await previewContext();
  let user = context.target || actor,
    preview = context.requested;
  let portalHref = "/portal/najemnik",
    accountHref = "/portal/najemnik/ucet";
  if (query.tenantId) {
    if (
      !(await manageableTenantLeaseIds(actor, query.tenantId).then(
        (ids) => ids.length,
      ))
    )
      notFound();
    const tenant = await prisma.tenant.findUnique({
      where: { id: query.tenantId },
      include: { portalAccesses: { include: { user: true } } },
    });
    if (!tenant) notFound();
    const account = tenant.portalAccesses.find(
      (a) => a.user.active && tenantPortalContactMatches(a.user.email, tenant),
    )?.user;
    user = account
      ? { ...user, ...account }
      : {
          ...user,
          id: tenant.id,
          name: tenant.name,
          email: tenant.communicationEmail || tenant.email || "",
          role: "TENANT",
          avatarChoice: null,
          avatarMimeType: null,
        };
    preview = true;
    portalHref = `/portal/najemnik/${tenant.id}`;
    accountHref = `/portal/najemnik/ucet?tenantId=${tenant.id}`;
  }
  if (preview && !context.target && !query.tenantId) notFound();
  if (user.role !== "TENANT" && !preview) redirect("/ucet");
  const profile = preview
    ? null
    : await prisma.contractSignatureProfile.findUnique({
        where: { userId: user.id },
        select: { userId: true },
      });
  const errors: Record<string, string> = {
    current: "Současné heslo není správné.",
    length: "Nové heslo musí mít alespoň 12 a nejvýše 200 znaků.",
    match: "Nové heslo a potvrzení se neshodují.",
    same: "Nové heslo musí být jiné než současné.",
  };
  return (
    <TenantPortalFrame
      user={user}
      preview={preview}
      portalHref={portalHref}
      accountHref={accountHref}
    >
      <div className="page account-full-width">
        <h1>Můj účet</h1>
        <p>
          {user.name} · {user.email}
        </p>
        <Flash
          ok={query.changed ? "Heslo bylo úspěšně změněno." : query.ok}
          error={query.error ? errors[query.error] || query.error : undefined}
        />
        <section className="card account-card">
          <h2>Uživatelský profil</h2>
          <div className="rule-summary">
            <UserAvatar
              user={{
                id: user.id,
                name: user.name,
                avatarChoice: user.avatarChoice,
              }}
              size="lg"
            />
            <div>
              <strong>{user.name}</strong>
              <p>{user.email}</p>
              <small>Role nájemníka</small>
            </div>
          </div>
          <p>Změnu kontaktních údajů nahlaste správci v portálu.</p>
        </section>
        {!preview && <section className="card account-card account-avatar-card">
          <h2>Profilová fotografie</h2>
          <form action="/api/account/avatar" method="post" encType="multipart/form-data" className="account-avatar-form">
            <div className="account-avatar-fields">
              <IllustrationPicker kind="person" selected={user.avatarMimeType ? "upload" : user.avatarChoice || suggestedIllustration("person", user.id)}/>
              <input aria-label="Nahrát profilovou fotografii" type="file" name="avatar" accept="image/png,image/jpeg,image/webp"/>
              <button className="primary" type="submit">Uložit avatar</button>
            </div>
          </form>
        </section>}
        <section className="card account-card" id="heslo">
          <h2>Změna hesla</h2>
          {preview ? (
            <p>
              Heslo mění pouze přihlášený nájemník ve svém účtu. V náhledu jsou
              osobní změny vypnuté.
            </p>
          ) : (
            <form
              action="/api/account/password"
              method="post"
              className="account-form"
            >
              <label className="field">
                <span>Současné heslo</span>
                <input
                  type="password"
                  name="currentPassword"
                  autoComplete="current-password"
                  required
                  maxLength={200}
                />
              </label>
              <label className="field">
                <span>Nové heslo</span>
                <input
                  type="password"
                  name="newPassword"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={200}
                  required
                />
              </label>
              <label className="field">
                <span>Nové heslo znovu</span>
                <input
                  type="password"
                  name="confirmPassword"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={200}
                  required
                />
              </label>
              <button className="primary">Změnit heslo</button>
            </form>
          )}
        </section>
        {leaseContractPilotEnabled() && (
          <section className="card account-card" id="podpis">
            <h2>Můj podpis</h2>
            {preview ? (
              <p>
                Osobní podpis ukládá a používá pouze nájemník po přihlášení.
                Správce ho v náhledu nemůže vytvořit ani použít.
              </p>
            ) : (
              <PersonalContractSignature
                hasSignature={Boolean(profile)}
                returnToAccount
              />
            )}
          </section>
        )}
        <section className="card account-card">
          <h2>Upozornění</h2>
          <p>
            Provozní upozornění k nájmu jsou zapnutá. Zprávy a úkoly najdete v
            portálu.
          </p>
          <Link className="secondary" href={portalHref}>
            Zpět k mému nájmu
          </Link>
        </section>
      </div>
    </TenantPortalFrame>
  );
}
