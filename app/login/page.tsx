export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand-mark">FC</div>
        <h1>Přihlášení</h1>
        <p>Evidence nájemních plateb a správa portfolia.</p>
        {params.error && <div className="error">Neplatný e-mail nebo heslo.</div>}
        <form action="/api/auth/login" method="post">
          <div className="field"><label>E-mail</label><input name="email" type="email" autoComplete="username" required /></div>
          <div className="field"><label>Heslo</label><input name="password" type="password" autoComplete="current-password" required /></div>
          <button className="primary" type="submit">Přihlásit se</button>
        </form>
        <div className="demo-note">Přístupové údaje nastavuje administrátor při prvním nasazení.</div>
      </div>
    </main>
  );
}
