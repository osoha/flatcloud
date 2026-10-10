import type { DisplayMode } from "@/lib/display-mode";
import Link from "next/link";

export function DisplayModeSwitch({ mode, mobile = false, returnTo = "/portfolio", profiAllowed = true }: { mode: DisplayMode; mobile?: boolean; returnTo?: string; profiAllowed?: boolean }) {
  return <form className={`display-mode-switch${mobile ? " display-mode-switch-mobile" : ""}`} action="/api/display-mode" method="post" aria-label="Režim zobrazení">
    <input type="hidden" name="returnTo" value={returnTo}/>
    <span className="display-mode-caption">Zobrazení</span>
    <div role="group" aria-label="Zobrazení aplikace">
      <button type="submit" name="mode" value="basic" aria-pressed={mode === "basic"} className={mode === "basic" ? "selected" : ""}>Basic</button>
      {profiAllowed ? <button type="submit" name="mode" value="pro" aria-pressed={mode === "pro"} className={mode === "pro" ? "selected" : ""}>Profi</button> : <Link href="/ucet/predplatne?reason=feature" title="Profi je součástí placeného předplatného" aria-label="Profi – nastavení předplatného" className="subscription-mode-upgrade">Profi ↗</Link>}
    </div>
  </form>;
}
