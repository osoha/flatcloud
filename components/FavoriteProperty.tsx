"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function FavoriteProperty({ propertyId, name, favorite }: { propertyId: string; name: string; favorite: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  async function toggle() {
    setBusy(true); setError(false);
    try {
      const data = new FormData(); data.set("favorite", favorite ? "false" : "true");
      const result = await fetch(`/api/properties/${propertyId}/appearance`, { method: "POST", body: data, headers: { Accept: "application/json" } });
      if (!result.ok) throw new Error("Save failed");
      router.refresh();
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return <><button type="button" className={`favorite-property ${favorite ? "is-favorite" : ""}`} aria-label={`${favorite ? "Odebrat z oblíbených" : "Přidat do oblíbených"}: ${name}`} title={favorite ? "Odebrat z oblíbených" : "Přidat do oblíbených"} aria-pressed={favorite} disabled={busy} onClick={toggle}><Star size={20} aria-hidden="true" fill={favorite ? "currentColor" : "none"}/></button>{error && <small role="alert">Nepodařilo se uložit. Zkuste to znovu.</small>}</>;
}
