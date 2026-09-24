"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Preferences = { theme: "light" | "dark" };
export function DisplayPreferences({ userId, mobile = false }: { userId: string; mobile?: boolean }) {
  const [value, setValue] = useState<Preferences>({ theme: "light" });
  const key = `flatberry-display-${userId}`;
  useEffect(() => {
    function sync() {
      let saved: Partial<Preferences> = {};
      try { saved = JSON.parse(localStorage.getItem(key) || "{}"); } catch { /* Private browsing keeps defaults. */ }
      const next: Preferences = { theme: saved.theme === "dark" ? "dark" : "light" };
      setValue(next); document.documentElement.dataset.theme = next.theme; delete document.documentElement.dataset.contentWidth;
    }
    sync(); window.addEventListener("flatberry-display", sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener("flatberry-display", sync); window.removeEventListener("storage", sync); };
  }, [key]);
  function update(next: Preferences) {
    setValue(next); document.documentElement.dataset.theme = next.theme; delete document.documentElement.dataset.contentWidth;
    try { localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new Event("flatberry-display")); } catch { /* Still works for this visit. */ }
  }
  return <div className={`display-preferences${mobile ? " display-preferences-mobile" : ""}`}>
    <button type="button" aria-pressed={value.theme === "dark"} title={value.theme === "dark" ? "Přepnout na světlý režim" : "Přepnout na tmavý režim"} aria-label="Tmavý režim" onClick={() => update({ theme: value.theme === "dark" ? "light" : "dark" })}>{value.theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}<span>{value.theme === "dark" ? "Světlý režim" : "Tmavý režim"}</span></button>
  </div>;
}
