import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";

export default async function ForgotPassword({searchParams}:{searchParams:Promise<{sent?:string;error?:string}>}) {
  const query=await searchParams;
  return <main className="login-page"><div className="login-card">
    <div className="login-logo"><span className="flatberry-brand-bitmap" role="img" aria-label="FlatBerry"/></div>
    <PageHeading>Obnovit heslo</PageHeading>
    <p>Zadejte e-mail svého účtu. Pokud je aktivní, pošleme odkaz platný 30 minut.</p>
    {query.sent&&<div className="notice">Pokud účet existuje a doručování je dostupné, najdete odkaz ve své schránce.</div>}
    {query.error&&<div className="error">Zkontrolujte e-mailovou adresu a zkuste to znovu.</div>}
    <form action="/api/auth/password-reset/request" method="post">
      <label className="field"><span>E-mail</span><input type="email" name="email" autoComplete="email" maxLength={254} required/></label>
      <button className="primary" type="submit">Poslat odkaz pro obnovu</button>
    </form>
    <p className="demo-note"><Link href="/login">Přihlášení</Link> · <Link href="/">Veřejný web FlatBerry</Link></p>
  </div></main>;
}
