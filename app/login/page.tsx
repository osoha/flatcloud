import { cookies } from "next/headers";
import { PREVIEW_COOKIE } from "@/lib/user-context-policy";
import { PageHeading } from "@/components/PageHeading";
import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; reset?: string }> }) {
  const params = await searchParams;
  const preview = (await cookies()).has(PREVIEW_COOKIE);
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-logo"><span className="flatberry-brand-bitmap" role="img" aria-label="FlatBerry"/></div>
        <PageHeading>Přihlášení</PageHeading>
        <p>Evidence nájemních plateb a správa portfolia.</p>
        {params.error && <div className="error">Neplatný e-mail nebo heslo.</div>}
        {params.reset && <div className="notice">Heslo bylo změněno. Přihlaste se novým heslem.</div>}
        {preview ? <form action="/api/admin/user-preview/exit" method="post"><p>Před přihlášením ukončete předchozí náhled uživatele.</p><button className="primary">Ukončit náhled</button></form> : <LoginForm failed={Boolean(params.error)}/>}
        <p className="demo-note"><Link href="/zapomenute-heslo">Zapomněli jste heslo?</Link></p>
        {process.env.PUBLIC_REGISTRATION_ENABLED === "true" && <p className="demo-note"><Link href="/registrace">Jsem vlastník – vytvořit účet</Link></p>}
        <p className="demo-note"><Link href="/">Veřejný web FlatBerry</Link></p>
      </div>
    </main>
  );
}
