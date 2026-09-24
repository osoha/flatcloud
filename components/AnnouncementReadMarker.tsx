"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Only the full announcement renders this marker, after its body. */
export function AnnouncementReadMarker({ id }: { id: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  const router = useRouter();
  useEffect(() => {
    const element = marker.current;
    if (!element) return;
    let pending = false;
    let completed = false;
    const observer = new IntersectionObserver(async entries => {
      if (!entries.some(entry => entry.isIntersecting) || document.visibilityState !== "visible" || pending || completed) return;
      pending = true;
      try {
        const response = await fetch(`/api/announcements/${id}/state`, {
          method: "POST",
          body: new URLSearchParams({ action: "read" }),
        });
        if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
          completed = true;
          observer.disconnect();
          router.refresh();
        }
      } catch {
        // Reading remains possible offline; retry on the next visibility change.
      } finally {
        pending = false;
      }
    });
    observer.observe(element);
    const observeAgain = () => {
      if (!completed && document.visibilityState === "visible") {
        observer.unobserve(element);
        observer.observe(element);
      }
    };
    document.addEventListener("visibilitychange", observeAgain);
    window.addEventListener("online", observeAgain);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", observeAgain);
      window.removeEventListener("online", observeAgain);
    };
  }, [id, router]);
  return <span ref={marker} aria-hidden="true" style={{ display: "block", height: 1 }} />;
}
