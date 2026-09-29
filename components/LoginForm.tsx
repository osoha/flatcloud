"use client";

import { useEffect, useState } from "react";

const emailKey = "flatberry-login-email";

export function LoginForm({ failed }: { failed: boolean }) {
  const [email,setEmail] = useState("");
  useEffect(() => {
    try {
      if (failed) setEmail(sessionStorage.getItem(emailKey) || "");
      else sessionStorage.removeItem(emailKey);
    } catch { /* Storage may be disabled; the form still works. */ }
  }, [failed]);
  return <form action="/api/auth/login" method="post" onSubmit={() => { try { sessionStorage.setItem(emailKey,email); } catch { /* optional */ } }}>
    <div className="field"><label htmlFor="login-email">E-mail</label><input id="login-email" name="email" type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} required/></div>
    <div className="field"><label htmlFor="login-password">Heslo</label><input id="login-password" name="password" type="password" autoComplete="current-password" required/></div>
    <button className="primary" type="submit">Přihlásit se</button>
  </form>;
}
