import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Search = { changed?: string; error?: string };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const query = await searchParams;
  const messages: Record<string, string> = {
    current: "Současné heslo není správné.",
    length: "Nové heslo musí mít alespoň 12 znaků.",
    match: "Nové heslo a jeho potvrzení se neshodují.",
    same: "Nové heslo musí být jiné než současné.",
  };

  return (
    <Shell user={user}>
      <div className="page">
        <div className="page-title">
          <div>
            <h1>Můj účet</h1>
            <p>{user.name} · {user.email}</p>
          </div>
        </div>
        <div className="card account-card">
          <div className="card-head"><h2>Změna hesla</h2></div>
          {query.changed && <div className="notice success-notice">Heslo bylo úspěšně změněno.</div>}
          {query.error && <div className="error">{messages[query.error] || "Heslo se nepodařilo změnit."}</div>}
          <form action="/api/account/password" method="post" className="account-form">
            <div className="field"><label>Současné heslo</label><input type="password" name="currentPassword" autoComplete="current-password" required /></div>
            <div className="field"><label>Nové heslo</label><input type="password" name="newPassword" autoComplete="new-password" minLength={12} required /></div>
            <div className="field"><label>Nové heslo znovu</label><input type="password" name="confirmPassword" autoComplete="new-password" minLength={12} required /></div>
            <button className="primary" type="submit">Změnit heslo</button>
          </form>
        </div>
      </div>
    </Shell>
  );
}
