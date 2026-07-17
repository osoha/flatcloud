import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { UserAvatar } from "@/components/UserAvatar";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Search = { changed?: string; error?: string; ok?: string };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const query = await searchParams;
  const messages: Record<string, string> = {
    current: "Současné heslo není správné.",
    length: "Nové heslo musí mít alespoň 12 znaků.",
    match: "Nové heslo a jeho potvrzení se neshodují.",
    same: "Nové heslo musí být jiné než současné.",
  };
  const passwordError = query.error ? messages[query.error] : undefined;

  return (
    <Shell user={user}>
      <div className="page">
        <div className="page-title">
          <div>
            <h1>Můj účet</h1>
            <p>{user.name} · {user.email}</p>
          </div>
        </div>

        <Flash ok={query.ok} error={query.error && !passwordError ? query.error : undefined}/>

        <div className="card account-card account-avatar-card">
          <div className="card-head"><div><h2>Profilová fotografie</h2><p className="muted-copy">Fotografie se automaticky ořízne na čtverec a uloží v optimalizované velikosti pro ostré zobrazení v aplikaci.</p></div></div>
          <form action="/api/account/avatar" method="post" encType="multipart/form-data" className="account-avatar-form">
            <UserAvatar user={user} size="lg"/>
            <div className="account-avatar-fields">
              <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp"/>
              <small>PNG, JPG nebo WebP, maximálně 2 MB.</small>
              {user.avatarMimeType && <label className="checkbox-field"><input type="checkbox" name="removeAvatar"/><span>Odstranit současný avatar</span></label>}
              <button className="primary" type="submit">Uložit avatar</button>
            </div>
          </form>
        </div>

        <div className="card account-card">
          <div className="card-head"><h2>Změna hesla</h2></div>
          {query.changed && <div className="notice success-notice">Heslo bylo úspěšně změněno.</div>}
          {passwordError && <div className="error">{passwordError}</div>}
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
