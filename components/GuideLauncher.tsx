"use client";

import { Compass } from "lucide-react";

export function GuideLauncher() {
  return <button type="button" className="secondary guide-launcher" onClick={() => window.dispatchEvent(new Event("flatberry:guide-start"))}>
    <Compass size={17} aria-hidden="true"/> Průvodce aplikací
  </button>;
}
