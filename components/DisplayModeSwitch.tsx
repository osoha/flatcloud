import type { DisplayMode } from "@/lib/display-mode";

export function DisplayModeSwitch({ mode, mobile = false, returnTo = "/portfolio" }: { mode: DisplayMode; mobile?: boolean; returnTo?: string }) {
  return <form className={`display-mode-switch${mobile ? " display-mode-switch-mobile" : ""}`} action="/api/display-mode" method="post" aria-label="Režim zobrazení">
    <input type="hidden" name="returnTo" value={returnTo}/>
    <span className="display-mode-caption">Zobrazení</span>
    <div role="group" aria-label="Zobrazení aplikace">
      <button type="submit" name="mode" value="basic" aria-pressed={mode === "basic"} className={mode === "basic" ? "selected" : ""}>Basic</button>
      <button type="submit" name="mode" value="pro" aria-pressed={mode === "pro"} className={mode === "pro" ? "selected" : ""}>Profi</button>
    </div>
  </form>;
}
