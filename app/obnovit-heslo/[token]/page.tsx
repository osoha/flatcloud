import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { prisma } from "@/lib/db";
import { hashPasswordResetToken, resetTokenPattern } from "@/lib/self-service-password-reset";

export const dynamic="force-dynamic";
export default async function ResetPassword({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{error?:string}>}) {
  const {token}=await params,query=await searchParams;
  const reset=resetTokenPattern.test(token)?await prisma.passwordResetToken.findUnique({where:{tokenHash:hashPasswordResetToken(token)},include:{user:{select:{active:true}}}}):null;
  const valid=Boolean(reset&&!reset.usedAt&&reset.expiresAt.getTime()>Date.now()&&reset.user.active);
  return <main className="login-page"><div className="login-card">
    <div className="login-logo"><span className="flatberry-brand-bitmap" role="img" aria-label="FlatBerry"/></div>
    <PageHeading>{valid?"Nové heslo":"Odkaz už není platný"}</PageHeading>
    {valid?<><p>Zvolte nové heslo pro svůj účet. Dosavadní přihlášení se po změně odhlásí.</p>
      {query.error&&<div className="error">Hesla se musí shodovat a mít 12–72 znaků. Zkuste to znovu.</div>}
      <form action="/api/auth/password-reset/confirm" method="post">
        <input type="hidden" name="token" value={token}/>
        <label className="field"><span>Nové heslo</span><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required/></label>
        <label className="field"><span>Potvrdit heslo</span><input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={72} required/></label>
        <button className="primary" type="submit">Uložit nové heslo</button>
      </form>
    </>:<p>Požádejte o nový odkaz pro obnovu hesla.</p>}
    <nav className="auth-footer-links" aria-label="Další možnosti"><Link href="/zapomenute-heslo">Nový odkaz</Link><Link href="/login">Přihlášení</Link><Link href="/">Zpět na web FlatBerry</Link></nav>
  </div></main>;
}
