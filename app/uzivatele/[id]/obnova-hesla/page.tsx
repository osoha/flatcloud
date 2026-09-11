import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Flash, FormPage } from "@/components/FormUi";

export const dynamic = "force-dynamic";

export default async function PasswordResetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const admin = await requireUser();
  if (admin.role !== "SUPER_ADMIN") redirect("/portfolio");
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, role: true, active: true } });
  if (!target) notFound();
  if (!target.active || target.role === "SUPER_ADMIN" || target.id === admin.id) redirect(`/uzivatele/${id}`);
  const query = await searchParams;
  return <Shell user={admin}><FormPage title="Obnovit heslo uživatele" description={`${target.name} · ${target.email}`} backHref={`/uzivatele/${id}`}>
    <Flash error={query.error}/>
    <form className="card edit-form" action={`/api/users/${id}/password-reset`} method="post">
      <p className="notice">Nové heslo nahradí současné heslo a odhlásí uživatele ze všech zařízení. Jeho role a přístupy zůstanou zachované. E-mail se neodesílá.</p>
      <div className="form-grid">
        <label className="field field-full">Heslo hlavního administrátora<input name="adminPassword" type="password" autoComplete="current-password" required/></label>
        <label className="field">Nové heslo uživatele<input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required aria-describedby="password-help"/></label>
        <label className="field">Potvrzení nového hesla<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required/></label>
        <p id="password-help" className="field-full muted-copy">Alespoň 12 znaků, nejvýše 72 bajtů UTF-8. U znaků s diakritikou může být limit kratší.</p>
        <label className="field field-full">Důvod obnovy<textarea name="reason" minLength={5} maxLength={500} required/></label>
        <label className="checkbox-field field-full"><input name="confirmReset" type="checkbox" required/><span>Potvrzuji obnovu hesla tohoto uživatele a zneplatnění jeho dosavadních přihlášení.</span></label>
      </div>
      <div className="form-actions"><a className="secondary" href={`/uzivatele/${id}`}>Zrušit</a><button className="primary" type="submit">Obnovit heslo a odhlásit uživatele</button></div>
    </form>
  </FormPage></Shell>;
}
