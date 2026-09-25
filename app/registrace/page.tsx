import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";

export default async function RegistrationPage({searchParams}:{searchParams:Promise<{ok?:string;error?:string}>}){
  const params=await searchParams;
  return <main className="login-page"><div className="login-card"><div className="login-logo"><span className="flatberry-brand-bitmap" role="img" aria-label="FlatBerry"/></div><PageHeading>Registrace vlastníka</PageHeading>
    <p>Po potvrzení e-mailu si vyberete přehledný Basic nebo detailní Profi. Berry vám pak ukáže, jak začít.</p>
    {params.ok&&<div className="notice">Pokud je registrace dostupná, pošleme vám potvrzovací odkaz. Zkontrolujte také složku spam.</div>}
    {params.error&&<div className="error">{params.error}</div>}
    {process.env.PUBLIC_REGISTRATION_ENABLED!=="true"?<p>Registrace se připravuje. Přístup nyní získáte pozvánkou od správce.</p>:<form action="/api/auth/register" method="post">
      <div className="field"><label htmlFor="register-name">Jméno</label><input id="register-name" name="name" maxLength={120} autoComplete="name" required/></div>
      <div className="field"><label htmlFor="register-email">E-mail</label><input id="register-email" name="email" type="email" maxLength={254} autoComplete="email" required/></div>
      <div className="field"><label htmlFor="register-password">Heslo (alespoň 12 znaků)</label><input id="register-password" name="password" type="password" minLength={12} maxLength={72} autoComplete="new-password" required/></div>
      <button className="primary" type="submit">Poslat potvrzovací odkaz</button>
    </form>}
    <p><Link href="/login">Zpět na přihlášení</Link></p></div></main>;
}
