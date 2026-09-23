import { cookies } from "next/headers";
import { PREVIEW_COOKIE } from "@/lib/user-context-policy";
import { PageHeading } from "@/components/PageHeading";
import Link from "next/link";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const preview = (await cookies()).has(PREVIEW_COOKIE);
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-logo"><span className="flatberry-brand-bitmap" role="img" aria-label="Flatberry"/></div>
        <PageHeading>Přihlášení</PageHeading>
        <p>Evidence nájemních plateb a správa portfolia.</p>
        {params.error && <div className="error">Neplatný e-mail nebo heslo.</div>}
        {preview ? <form action="/api/admin/user-preview/exit" method="post"><p>Před přihlášením ukončete předchozí náhled uživatele.</p><button className="primary">Ukončit náhled</button></form> : <form action="/api/auth/login" method="post">
          <div className="field"><label htmlFor="login-email">E-mail</label><input id="login-email" name="email" type="email" autoComplete="username" required /></div>
          <div className="field"><label htmlFor="login-password">Heslo</label><input id="login-password" name="password" type="password" autoComplete="current-password" required /></div>
          <button className="primary" type="submit">Přihlásit se</button>
        </form>}
        {process.env.PUBLIC_REGISTRATION_ENABLED === "true" ? <p className="demo-note"><Link href="/registrace">Jsem vlastník – vytvořit účet</Link></p> : <div className="demo-note">Přístupové údaje nastavuje administrátor při prvním nasazení.</div>}
      </div>
    </main>
  );
}
