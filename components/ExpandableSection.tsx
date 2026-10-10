"use client";
import {useEffect, useRef} from "react";

/** Native details that also opens when a contextual link points into the panel. */
export function ExpandableSection({id, summary, initiallyOpen = false, children, className = "card"}: {id: string; summary: React.ReactNode; initiallyOpen?: boolean; children: React.ReactNode; className?: string}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const reveal = () => {
      let hash: string;
      try {hash = decodeURIComponent(location.hash.slice(1));} catch {return;}
      const target = hash && document.getElementById(hash);
      if (target && ref.current?.contains(target)) {
        ref.current.open = true;
        requestAnimationFrame(() => target.scrollIntoView({block: "start"}));
      }
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [id]);
  return <details ref={ref} id={id} className={className} open={initiallyOpen}><summary>{summary}</summary><div className="expandable-section-content">{children}</div></details>;
}
