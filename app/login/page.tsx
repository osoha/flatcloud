import { PageHeading } from "@/components/PageHeading";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-logo"><span className="flatberry-brand-bitmap" role="img" aria-label="Flatberry"/></div>
        <PageHeading>Přihlášení</PageHeading>
        <p>Evidence nájemních plateb a správa portfolia.</p>
        {params.error && <div className="error">Neplatný e-mail nebo heslo.</div>}
        <form action="/api/auth/login" method="post">
          <div className="field"><label htmlFor="login-email">E-mail</label><input id="login-email" name="email" type="email" autoComplete="username" required /></div>
          <div className="field"><label htmlFor="login-password">Heslo</label><input id="login-password" name="password" type="password" autoComplete="current-password" required /></div>
          <button className="primary" type="submit">Přihlásit se</button>
        </form>
        <div className="demo-note">Přístupové údaje nastavuje administrátor při prvním nasazení.</div>
      </div>
    </main>
  );
}
