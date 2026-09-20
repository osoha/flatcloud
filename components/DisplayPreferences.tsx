"use client";
import { useEffect, useState } from "react";
import { Moon, Sun, Maximize2, Minimize2 } from "lucide-react";

type Preferences = { theme: "light" | "dark"; width: "standard" | "wide" };
export function DisplayPreferences({ userId, mobile = false }: { userId: string; mobile?: boolean }) {
  const [value, setValue] = useState<Preferences>({ theme: "light", width: "wide" });
  const key = `flatberry-display-${userId}`;
  useEffect(() => {
    function sync() {
      let saved: Partial<Preferences> = {};
      try { saved = JSON.parse(localStorage.getItem(key) || "{}"); } catch { /* Private browsing keeps defaults. */ }
      const next: Preferences = { theme: saved.theme === "dark" ? "dark" : "light", width: saved.width === "standard" ? "standard" : "wide" };
      setValue(next); document.documentElement.dataset.theme = next.theme; document.documentElement.dataset.contentWidth = next.width;
    }
    sync(); window.addEventListener("flatberry-display", sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener("flatberry-display", sync); window.removeEventListener("storage", sync); };
  }, [key]);
  function update(next: Preferences) {
    setValue(next); document.documentElement.dataset.theme = next.theme; document.documentElement.dataset.contentWidth = next.width;
    try { localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new Event("flatberry-display")); } catch { /* Still works for this visit. */ }
  }
  return <div className={`display-preferences${mobile ? " display-preferences-mobile" : ""}`}>
    <button type="button" aria-pressed={value.theme === "dark"} title={value.theme === "dark" ? "Přepnout na světlý režim" : "Přepnout na tmavý režim"} aria-label="Tmavý režim" onClick={() => update({ ...value, theme: value.theme === "dark" ? "light" : "dark" })}>{value.theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}<span>{value.theme === "dark" ? "Světlý režim" : "Tmavý režim"}</span></button>
    <button type="button" aria-pressed={value.width === "wide"} title={value.width === "wide" ? "Použít standardní šířku" : "Využít celou šířku obrazovky"} aria-label="Široký obsah" onClick={() => update({ ...value, width: value.width === "wide" ? "standard" : "wide" })}>{value.width === "wide" ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}<span>{value.width === "wide" ? "Zúžit obsah" : "Rozšířit obsah"}</span></button>
  </div>;
}
