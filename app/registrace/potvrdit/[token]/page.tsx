import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
export default async function ConfirmRegistrationPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{error?:string}>}){
  const {token}=await params,{error}=await searchParams;
  return <main className="login-page"><div className="login-card"><PageHeading>Potvrdit e-mail</PageHeading><p>Potvrzením vytvoříte svůj účet vlastníka FlatBerry.</p>{error&&<div className="error">{error}</div>}
    <form action="/api/auth/register/confirm" method="post"><input type="hidden" name="token" value={token}/><button className="primary" type="submit">Potvrdit registraci</button></form><p><Link href="/registrace">Zpět na registraci</Link></p></div></main>;
}
