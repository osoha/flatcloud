"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react";
import { GUIDE_VERSION, guideSteps, type GuideAction, type GuideCapabilities, type GuideState } from "@/lib/first-login-guide";

type Payload = { state: GuideState; capabilities: GuideCapabilities; mode: "basic" | "pro"; modeChosen: boolean };
type Box = { x: number; y: number; width: number; height: number };
function coverOutside(boxes: Box[], width: number, height: number): Box[] {
  const xs = [...new Set([0, width, ...boxes.flatMap(b => [b.x, b.x + b.width])])].sort((a, b) => a - b);
  const ys = [...new Set([0, height, ...boxes.flatMap(b => [b.y, b.y + b.height])])].sort((a, b) => a - b);
  return xs.slice(0, -1).flatMap((x, i) => ys.slice(0, -1).flatMap((y, j) => {
    const w = xs[i + 1] - x, h = ys[j + 1] - y, cx = x + w / 2, cy = y + h / 2;
    return w > 0 && h > 0 && !boxes.some(b => cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height) ? [{ x, y, width: w, height: h }] : [];
  }));
}
function arrowTo(box: Box, panel: Box): string {
  const right = box.x + box.width, bottom = box.y + box.height;
  if (right + 16 < panel.x) {
    const sy = panel.y + Math.min(90, panel.height / 3), ey = box.y + box.height / 2;
    return `M ${panel.x - 10} ${sy} Q ${(right + panel.x) / 2} ${Math.min(sy, ey) - 55} ${right + 10} ${ey}`;
  }
  const sx = Math.max(panel.x + 35, Math.min(panel.x + panel.width - 35, box.x + box.width * .68));
  const ex = Math.max(box.x + 18, Math.min(right - 18, sx));
  return `M ${sx} ${panel.y - 10} Q ${(sx + ex) / 2 + 45} ${Math.min(panel.y, bottom) - 65} ${ex} ${bottom < panel.y ? bottom + 10 : box.y + 18}`;
}
const focusable = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';

export function FirstLoginGuide({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);
  const [startRequested, setStartRequested] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [extraBox, setExtraBox] = useState<Box | null>(null);
  const [missing, setMissing] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [panelBox, setPanelBox] = useState<Box | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const target = useRef<HTMLElement | null>(null);
  const saving = useRef(false);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  // Re-fetch after navigation and when returning from another tab/device.
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      if (document.visibilityState === "hidden" || saving.current) return;
      try {
        const response = await fetch("/api/account/guide", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (response.ok) {
          const data: Payload = await response.json();
          if (!saving.current) setPayload(current => !current || data.state.revision >= current.state.revision ? data : current);
        }
      } catch { /* A failed introduction must never prevent use of the application. */ }
    };
    try { setHidden(sessionStorage.getItem(`flatberry:guide-hidden:${userId}`) === "1"); } catch { /* storage is optional */ }
    void load();
    document.addEventListener("visibilitychange", load);
    return () => { controller.abort(); document.removeEventListener("visibilitychange", load); };
  }, [pathname, userId]);

  const steps = payload ? guideSteps(payload.capabilities, payload.mode) : [];
  const index = steps.findIndex(item => item.id === payload?.state.step);
  const step = steps[index];
  const routeMatches = Boolean(step && pathname === step.href.split("?")[0] && (!step.href.includes("?") || params.get("view") === "guides"));
  const open = !hidden && Boolean(payload && step && routeMatches && (payload.state.status === "active" || (payload.state.status === "pending" && pathname === "/portfolio")));

  const act = useCallback(async (action: GuideAction) => {
    const current = payloadRef.current;
    if (!current || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/guide", { method: "POST", signal: AbortSignal.timeout(10000), headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, revision: current.state.revision, version: GUIDE_VERSION }) });
      const data = await response.json();
      if (data.state) setPayload(value => value ? { ...value, state: data.state } : value);
      if (!response.ok) throw new Error(data.error || "Uložení se nepodařilo. Zkuste to znovu.");
      setHidden(false);
      try { sessionStorage.removeItem(`flatberry:guide-hidden:${userId}`); } catch { /* storage is optional */ }
      if (data.state.status === "completed") router.push("/portfolio");
      if (["start", "resume", "next", "back"].includes(action) && data.state.status === "active") {
        const next = guideSteps(current.capabilities, current.mode).find(item => item.id === data.state.step)!;
        router.push(next.href, { scroll: true });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Uložení se nepodařilo. Zkuste to znovu.");
    } finally { saving.current = false; setBusy(false); }
  }, [router, userId]);

  useEffect(() => {
    const start = () => { setStartRequested(true); };
    window.addEventListener("flatberry:guide-start", start);
    return () => window.removeEventListener("flatberry:guide-start", start);
  }, [act]);

  useEffect(() => {
    if (startRequested && payload) { setStartRequested(false); void act("start"); }
  }, [startRequested, payload, act]);

  // Observe real DOM targets; layout changes, scrolling, mobile and collapsed navigation
  // all use the same geometry. Missing targets never leave a stale spotlight behind.
  useEffect(() => {
    setBox(null);
    setExtraBox(null);
    setMissing(false);
    if (!open || !step) return;
    let frame = 0;
    let scrolled: HTMLElement | null = null;
    let scrolledWidth = 0;
    const started = Date.now();
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        setViewport({ width, height });
        const candidates = [document.querySelector<HTMLElement>(step.target), document.querySelector<HTMLElement>(step.fallback), document.querySelector<HTMLElement>('[data-guide="portfolio"]')];
        const element = candidates.find(el => el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden") || null;
        target.current = element;
        const topbar = document.querySelector<HTMLElement>(".topbar");
        const belowTopbar = Boolean(topbar && element && !topbar.contains(element));
        const headerBottom = belowTopbar ? Math.max(0, topbar!.getBoundingClientRect().bottom) : 0;
        if (element && (scrolled !== element || scrolledWidth !== width)) {
          scrolled = element;
          scrolledWidth = width;
          const previousMargin = element.style.scrollMarginTop;
          element.style.scrollMarginTop = `${headerBottom + 16}px`;
          element.scrollIntoView({ behavior: "instant", block: "start", inline: "nearest" });
          element.style.scrollMarginTop = previousMargin;
        }
        if (element) {
          const r = element.getBoundingClientRect();
          const basic = payloadRef.current?.mode === "basic";
          const firstRow = basic && step.id === "properties" ? [...element.querySelectorAll<HTMLElement>(".basic-property-card")].filter(card => card.getClientRects().length) : [];
          const rowTop = firstRow[0]?.getBoundingClientRect().top;
          const row = firstRow.filter(card => Math.abs(card.getBoundingClientRect().top - rowTop!) < 12).map(card => card.getBoundingClientRect());
          const heading = basic && step.id === "properties" && !row.length ? element.querySelector<HTMLElement>(".basic-section-heading")?.getBoundingClientRect() : null;
          const focus = row.length ? { left: Math.min(...row.map(card => card.left)), top: Math.min(...row.map(card => card.top)), right: Math.max(...row.map(card => card.right)), bottom: Math.max(...row.map(card => card.bottom)) } : heading || r;
          const full = basic && ["properties", "finance", "tasks"].includes(step.id) || !basic && step.id === "notifications";
          const toBox = (rect: {left: number; top: number; right: number; bottom: number}, entire: boolean) => {
            const x = Math.max(8, rect.left - 6), y = Math.max(8, headerBottom + (belowTopbar ? 8 : 0), rect.top - 6);
            const right = Math.min(width - 8, rect.right + 6);
            const bottom = Math.min(height - 8, (entire ? rect.bottom : rect.top + Math.min(rect.bottom - rect.top, width < 700 ? 76 : 150)) + 6);
            return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
          };
          setBox(toBox(focus, full));
          const addProperty = !basic && step.id === "properties" && step.target !== '[data-guide="add-property"]' ? document.querySelector<HTMLElement>('[data-guide="add-property"]') : null;
          setExtraBox(addProperty?.getClientRects().length ? toBox(addProperty.getBoundingClientRect(), true) : null);
          setMissing(false);
        } else {
          setBox(null);
          setExtraBox(null);
          if (Date.now() - started > 1800) setMissing(true);
        }
        if (panel.current) {
          const r = panel.current.getBoundingClientRect();
          setPanelBox({ x: r.x, y: r.y, width: r.width, height: r.height });
        }
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    if (panel.current) observer.observe(panel.current);
    const interval = window.setInterval(measure, 600);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    measure();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); clearInterval(interval); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); window.visualViewport?.removeEventListener("resize", measure); target.current = null; };
  }, [open, step?.id, step?.target, step?.fallback]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    title.current?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); void act("pause"); }
      if (event.key !== "Tab" || !panel.current) return;
      const choices = [...panel.current.querySelectorAll<HTMLElement>(focusable),
        ...(target.current ? [target.current, ...target.current.querySelectorAll<HTMLElement>(focusable)].filter(el => el.matches(focusable)) : [])]
        .filter(el => el.getClientRects().length > 0);
      if (!choices.length) return;
      const position = choices.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      choices[(position + (event.shiftKey ? -1 : 1) + choices.length) % choices.length].focus({ preventScroll: true });
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [open, step?.id, act]);

  if (!payload || !step) return null;
  const choosingMode = open && step.id === "welcome" && !payload.modeChosen;
  const resumable = ["paused", "active", "pending"].includes(payload.state.status);
  const showBanner = !open && (resumable || Boolean(error)) && ["/portfolio", "/ucet", "/metodika", "/ukoly", "/smlouvy", "/reporty"].includes(pathname);
  const hideLocally = () => {
    setHidden(true);
    try { sessionStorage.setItem(`flatberry:guide-hidden:${userId}`, "1"); } catch { /* optional */ }
  };
  const arrow = box && panelBox && !choosingMode ? arrowTo(extraBox || box, panelBox) : null;
  return <>
    {showBanner && <aside className="guide-resume" aria-label="Průvodce aplikací">
      <Compass size={20} aria-hidden="true"/><div><strong>Pan správce je připraven</strong><span>{error || "Prohlídku můžete dokončit, až se vám to bude hodit."}</span></div>
      <button className="secondary" disabled={busy} onClick={() => void act("resume")}>Pokračovat v prohlídce</button>
      <button className="guide-link" disabled={busy} onClick={() => void act("dismiss")}>Ukončit průvodce</button>
    </aside>}
    {choosingMode && createPortal(<div className="first-guide guide-choice" data-testid="first-login-guide">
      <div className="guide-scrim" style={{ inset: 0 }}/>
      <div className="guide-mode-panel" ref={panel} role="dialog" aria-labelledby="guide-title" aria-describedby="guide-copy" aria-busy={busy}>
        <button type="button" className="guide-close" aria-label="Odložit průvodce" disabled={busy} onClick={() => void act("pause")}><X size={19}/></button>
        <img className="guide-mode-berry" src="/guide/choose-mode.webp" alt="" width="280" height="330"/>
        <div className="guide-mode-intro"><span className="guide-eyebrow">Berry vám pomůže začít</span><h2 ref={title} tabIndex={-1} id="guide-title">Vítejte ve FlatBerry</h2><p id="guide-copy">Jsem Berry, pan správce. Doporučuji začít v Basic; pro podrobnou správu zvolte Profi. Vzhled kdykoli přepnete.</p></div>
        <div className="guide-mode-cards" role="group" aria-label="Vyberte vzhled aplikace">
          <form action="/api/display-mode" method="post"><input type="hidden" name="returnTo" value="/portfolio"/><button name="mode" value="basic" className={`guide-mode-card basic${payload.modeChosen && payload.mode === "basic" ? " selected" : ""}`} aria-pressed={payload.modeChosen && payload.mode === "basic"}><span className="guide-mode-name">Basic · doporučeno na začátek</span><strong>Nemovitosti pod kontrolou</strong><span>Přehledné velké karty pro začátečníky, vlastníky a menší portfolia. Domy, nájemníci, platby a úkoly na jednom místě.</span><em>{payload.modeChosen && payload.mode === "basic" ? "Vybráno ✓" : "Zvolit Basic →"}</em></button></form>
          <form action="/api/display-mode" method="post"><input type="hidden" name="returnTo" value="/portfolio"/><button name="mode" value="pro" className={`guide-mode-card pro${payload.modeChosen && payload.mode === "pro" ? " selected" : ""}`} aria-pressed={payload.modeChosen && payload.mode === "pro"}><span className="guide-mode-name">Profi</span><strong>Podrobné nástroje správy</strong><span>Smlouvy, náklady, reporty a týmová práce v souvislostech celého portfolia. Vhodné pro správce a profesionály.</span><em>{payload.modeChosen && payload.mode === "pro" ? "Vybráno ✓" : "Zvolit Profi →"}</em></button></form>
        </div>
        <div className="guide-mode-bottom"><span>Po výběru vás provedu prostředím za přibližně 2 minuty. Režim zobrazení není placený tarif.</span></div>
        <div className="guide-dismiss-actions"><button type="button" disabled={busy} onClick={() => void act("pause")}>Později</button><button type="button" disabled={busy} onClick={() => void act("dismiss")}>Ukončit průvodce</button></div>
        {error && <div className="guide-error" role="alert">{error}<button type="button" onClick={hideLocally}>Zavřít bez uložení</button></div>}
      </div>
    </div>, document.body)}
    {open && !choosingMode && createPortal(<div className="first-guide" data-testid="first-login-guide">
      {/* Four scrims leave the actual highlighted control clickable. */}
      {box ? <>
        {coverOutside(extraBox ? [box, extraBox] : [box], viewport.width, viewport.height).map((region, i) => <div className="guide-scrim" key={i} style={{ left: region.x, top: region.y, width: region.width, height: region.height }}/>) }
        <div className="guide-spotlight" data-testid="guide-spotlight" style={{ left: box.x, top: box.y, width: box.width, height: box.height }}/>
        {extraBox && <div className="guide-spotlight" data-testid="guide-spotlight-secondary" style={{ left: extraBox.x, top: extraBox.y, width: extraBox.width, height: extraBox.height }}/>}
      </> : <div className="guide-scrim" style={{ inset: 0 }}/>}
      {arrow && <svg className="guide-arrow" width={viewport.width} height={viewport.height} aria-hidden="true"><defs><marker id="first-guide-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M 0 0 L 7 4 L 0 8" fill="none" stroke="currentColor" strokeWidth="1.5"/></marker></defs><path d={arrow} fill="none" stroke="currentColor" strokeWidth="3" markerEnd="url(#first-guide-arrowhead)"/></svg>}
      <div className="guide-panel" ref={panel} role="dialog" aria-labelledby="guide-title" aria-describedby="guide-copy" aria-busy={busy}>
        <img className="guide-character" src={`/guide/${step.image}.webp`} alt="" width="240" height="300"/>
        <div className="guide-bubble">
          <button type="button" className="guide-close" aria-label="Odložit průvodce" disabled={busy} onClick={() => void act("pause")}><X size={19}/></button>
          <span className="guide-eyebrow">Pan správce · {index + 1} / {steps.length}</span>
          <h2 ref={title} tabIndex={-1} id="guide-title">{step.title}</h2>
          <p id="guide-copy">{step.body}</p>
          {index === 0 && <p className="guide-hint">{steps.length} zastavení · přibližně 2 minuty · kdykoli můžete skončit</p>}
          {missing && <p className="guide-hint" role="status">Tento prvek teď není dostupný. Můžete pokračovat dalším krokem.</p>}
          <div className="guide-progress" aria-label={`Krok ${index + 1} ze ${steps.length}`}>{steps.map((item, i) => <span key={item.id} className={i === index ? "current" : i < index ? "done" : ""}/>)}</div>
          {error && <div className="guide-error" role="alert">{error}<button type="button" onClick={hideLocally}>Zavřít bez uložení</button></div>}
          <div className="guide-actions">
            {index > 0 && <button type="button" className="secondary" disabled={busy} onClick={() => void act("back")}><ArrowLeft size={16}/> Zpět</button>}
            <button type="button" className="primary" disabled={busy} onClick={() => void act("next")}>{busy ? "Ukládám…" : index === steps.length - 1 ? "Dokončit prohlídku" : index === 0 ? "Pojďme na to" : "Další"}<ArrowRight size={17}/></button>
          </div>
          <div className="guide-dismiss-actions"><button type="button" disabled={busy} onClick={() => void act("pause")}>Později</button><button type="button" disabled={busy} onClick={() => void act("dismiss")}>Ukončit průvodce</button></div>
        </div>
      </div>
    </div>, document.body)}
  </>;
}
