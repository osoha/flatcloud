"use client";

import { Building2, DoorOpen, House } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function EntityAvatar({ photoId, kind = "property", size = "sm" }: { photoId?: string | null; kind?: "property" | "house" | "unit"; size?: "sm" | "lg" }) {
  const [failedId, setFailedId] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A server-rendered image can fail before React attaches its error listener.
    // Inspect the completed request at hydration as well as handling later errors.
    if (photoId && image.current?.complete && image.current.naturalWidth === 0) setFailedId(photoId);
  }, [photoId]);
  const Icon = kind === "unit" ? DoorOpen : kind === "house" ? House : Building2;
  return <span className={`entity-avatar entity-avatar-${size}`} aria-hidden="true">
    {photoId && failedId !== photoId
      ? <img ref={image} src={photoId.startsWith("avatar:") ? `/api/entity-avatar?key=${encodeURIComponent(photoId.split(":").slice(1,3).join(":"))}&v=${photoId.split(":")[3]}` : `/api/documents/${encodeURIComponent(photoId)}/download?variant=thumbnail`} alt="" loading="lazy" onError={() => setFailedId(photoId)}/>
      : <Icon className="entity-avatar-glyph" strokeWidth={1.5}/>}
  </span>;
}
